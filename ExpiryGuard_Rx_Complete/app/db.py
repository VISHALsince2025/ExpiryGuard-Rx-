# app/db.py
import os
import sys
import json
import sqlite3
import threading
from datetime import datetime, date, timezone
from decimal import Decimal
from app.config import SQL_CONN, ENV

# Thread-local storage for session context (e.g. user_id)
_local_context = threading.local()

class RowAdapter:
    """Wrapper that permits attribute, dictionary, and indexed access like pyodbc.Row."""
    def __init__(self, description, row_tuple):
        self._keys = [d[0].split('.')[-1].lower() for d in description] if description else []
        self._orig_keys = [d[0].split('.')[-1] for d in description] if description else []
        self._data = list(row_tuple) if row_tuple else []
        self._map = {k: v for k, v in zip(self._keys, self._data)}
        for orig, v in zip(self._orig_keys, self._data):
            self._map[orig] = v

    def __getattr__(self, name):
        name_lower = name.lower()
        if name_lower in self._map:
            return self._map[name_lower]
        if name in self._map:
            return self._map[name]
        raise AttributeError(f"Row has no attribute '{name}'")

    def __getitem__(self, item):
        if isinstance(item, int):
            return self._data[item]
        item_lower = item.lower()
        if item_lower in self._map:
            return self._map[item_lower]
        return self._map[item]

    def __iter__(self):
        return iter(self._data)

    def __len__(self):
        return len(self._data)

    def keys(self):
        return self._orig_keys

    def values(self):
        return self._data

    def items(self):
        return list(zip(self._orig_keys, self._data))


class SQLiteCursorWrapper:
    """Cursor wrapper that normalizes T-SQL statements, manages stored procedures and views."""
    def __init__(self, raw_cursor, conn_wrapper):
        self._cur = raw_cursor
        self._conn = conn_wrapper
        self.description = None

    def execute(self, sql, *args):
        # Flatten tuple/list params if passed as single tuple/list
        params = list(args)
        if len(args) == 1 and isinstance(args[0], (tuple, list)):
            params = list(args[0])

        normalized_sql = sql.strip()

        # Handle sp_set_session_context
        if "sp_set_session_context" in normalized_sql:
            # EXEC sp_set_session_context @key=N'user_id', @value=?
            user_id = params[0] if params else None
            _local_context.user_id = user_id
            return self

        # Handle usp_create_sale
        if "usp_create_sale" in normalized_sql:
            return self._execute_usp_create_sale(params)

        # Handle usp_approve_return
        if "usp_approve_return" in normalized_sql:
            return self._execute_usp_approve_return(params)

        # Convert common T-SQL expressions to SQLite equivalents for local fallback
        clean_sql = normalized_sql
        clean_sql = clean_sql.replace("dbo.", "")
        clean_sql = clean_sql.replace("SYSUTCDATETIME()", "datetime('now')")
        clean_sql = clean_sql.replace("dbo.fn_today()", "date('now')")
        clean_sql = clean_sql.replace("CAST(SYSUTCDATETIME() AS DATE)", "date('now')")
        clean_sql = clean_sql.replace("SCOPE_IDENTITY()", "last_insert_rowid()")
        
        # Handle OUTPUT INSERTED.<col>
        if "OUTPUT INSERTED." in clean_sql:
            # Convert INSERT INTO table (...) OUTPUT INSERTED.id VALUES (...) -> regular insert followed by lastrowid
            import re
            m = re.search(r"OUTPUT\s+INSERTED\.(\w+)", clean_sql, re.IGNORECASE)
            col_name = m.group(1) if m else "id"
            clean_sql = re.sub(r"OUTPUT\s+INSERTED\.\w+\s*", "", clean_sql, flags=re.IGNORECASE)
            self._cur.execute(clean_sql, params)
            last_id = self._cur.lastrowid
            # Synthesize fetchone result
            self.description = [(col_name,)]
            self._synthetic_row = RowAdapter(self.description, (last_id,))
            return self
        else:
            self._synthetic_row = None

        # Convert TOP (N) syntax to LIMIT N
        import re
        top_match = re.search(r"SELECT\s+TOP\s*\(?(\d+)\)?\s+(.*)", clean_sql, re.IGNORECASE | re.DOTALL)
        if top_match:
            n = top_match.group(1)
            rest = top_match.group(2)
            clean_sql = f"SELECT {rest} LIMIT {n}"

        # Clean locks hints like WITH (UPDLOCK, ROWLOCK)
        clean_sql = re.sub(r"WITH\s*\([^)]*\)", "", clean_sql, flags=re.IGNORECASE)

        # Execute on underlying sqlite cursor
        self._cur.execute(clean_sql, params)
        self.description = self._cur.description
        return self

    def _execute_usp_create_sale(self, params):
        # params: [sold_by, customer_name, payment_mode, items_json]
        sold_by = params[0]
        customer_name = params[1]
        payment_mode = params[2]
        items_data = json.loads(params[3])

        # Atomic transaction
        cur = self._cur
        cur.execute("INSERT INTO sales (sold_by, sale_time, customer_name, payment_mode) VALUES (?, datetime('now'), ?, ?)",
                    (sold_by, customer_name, payment_mode))
        sale_id = cur.lastrowid

        for item in items_data:
            med_id = item["medicine_id"]
            need = item["quantity"]

            while need > 0:
                cur.execute("""
                    SELECT batch_id, qty_on_hand, selling_price
                    FROM batches
                    WHERE medicine_id = ? AND status = 'ACTIVE' AND qty_on_hand > 0 AND expiry_date > date('now')
                    ORDER BY expiry_date ASC, batch_id ASC
                    LIMIT 1
                """, (med_id,))
                batch = cur.fetchone()
                if not batch:
                    # Rollback and throw error 50001
                    self._conn.rollback()
                    raise Exception("50001: Insufficient unexpired stock for a requested medicine.")

                batch_id, avail, price = batch[0], batch[1], batch[2]
                take = min(avail, need)

                cur.execute("UPDATE batches SET qty_on_hand = qty_on_hand - ? WHERE batch_id = ?", (take, batch_id))
                cur.execute("INSERT INTO sale_items (sale_id, batch_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
                            (sale_id, batch_id, take, price))

                # Batch update audit trigger emulation
                cur.execute("""
                    INSERT INTO audit_log (event_time, user_id, action, table_name, record_id, old_value, new_value)
                    VALUES (datetime('now'), ?, 'BATCH_UPDATE', 'batches', ?, ?, ?)
                """, (sold_by, str(batch_id), f"qty={avail}", f"qty={avail - take}"))

                need -= take

        # Audit sale creation
        cur.execute("""
            INSERT INTO audit_log (event_time, user_id, action, table_name, record_id, new_value)
            VALUES (datetime('now'), ?, 'SALE_CREATED', 'sales', ?, ?)
        """, (sold_by, str(sale_id), json.dumps(items_data)))

        self._conn.commit()
        self.description = [("sale_id",)]
        self._synthetic_row = RowAdapter(self.description, (sale_id,))
        return self

    def _execute_usp_approve_return(self, params):
        # params: [return_id, approved_by]
        return_id = params[0]
        approved_by = params[1]

        cur = self._cur
        cur.execute("SELECT batch_id, return_qty, status FROM supplier_returns WHERE return_id = ?", (return_id,))
        row = cur.fetchone()
        if not row:
            raise Exception("50010: Return not found.")
        batch_id, qty, status = row[0], row[1], row[2]
        if status != "PENDING":
            raise Exception("50011: Return already processed.")

        # Check stock on hand
        cur.execute("SELECT qty_on_hand FROM batches WHERE batch_id = ?", (batch_id,))
        b_row = cur.fetchone()
        if not b_row or b_row[0] < qty:
            self._conn.rollback()
            raise Exception("50012: Insufficient batch stock to approve return.")

        old_qty = b_row[0]
        new_qty = old_qty - qty
        cur.execute("UPDATE batches SET qty_on_hand = ? WHERE batch_id = ?", (new_qty, batch_id))
        cur.execute("UPDATE supplier_returns SET status = 'APPROVED', approved_by = ? WHERE return_id = ?",
                    (approved_by, return_id))

        cur.execute("""
            INSERT INTO audit_log (event_time, user_id, action, table_name, record_id, old_value, new_value)
            VALUES (datetime('now'), ?, 'RETURN_APPROVED', 'supplier_returns', ?, 'PENDING', 'APPROVED')
        """, (approved_by, str(return_id)))

        self._conn.commit()
        return self

    def fetchone(self):
        if getattr(self, "_synthetic_row", None) is not None:
            r = self._synthetic_row
            self._synthetic_row = None
            return r
        row = self._cur.fetchone()
        if row is None:
            return None
        return RowAdapter(self.description, row)

    def fetchall(self):
        rows = self._cur.fetchall()
        return [RowAdapter(self.description, r) for r in rows]

    def close(self):
        self._cur.close()


class SQLiteConnWrapper:
    """Connection wrapper for local SQLite database fallback."""
    def __init__(self, raw_conn):
        self._conn = raw_conn
        self.autocommit = False

    def cursor(self):
        return SQLiteCursorWrapper(self._conn.cursor(), self)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


_schema_initialized = False
_init_lock = threading.Lock()

def _init_sqlite_schema(conn):
    """Initializes schema and views on local SQLite database once."""
    global _schema_initialized
    with _init_lock:
        if _schema_initialized:
            return
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='roles'")
        if cur.fetchone():
            _schema_initialized = True
            return

        cur.executescript("""
    CREATE TABLE IF NOT EXISTS roles (
        role_id INTEGER PRIMARY KEY,
        role_name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role_id INTEGER NOT NULL REFERENCES roles(role_id),
        is_active INTEGER NOT NULL DEFAULT 1,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
        category_id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS medicines (
        medicine_id INTEGER PRIMARY KEY AUTOINCREMENT,
        brand_name TEXT NOT NULL,
        generic_name TEXT NOT NULL,
        strength TEXT NOT NULL,
        dosage_form TEXT NOT NULL,
        category_id INTEGER NOT NULL REFERENCES categories(category_id),
        reorder_level INTEGER NOT NULL CHECK (reorder_level >= 0),
        requires_prescription INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        UNIQUE (brand_name, strength, dosage_form)
    );

    CREATE TABLE IF NOT EXISTS suppliers (
        supplier_id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_name TEXT NOT NULL UNIQUE,
        phone TEXT NULL,
        email TEXT NULL,
        city TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS grn (
        grn_id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL REFERENCES suppliers(supplier_id),
        invoice_number TEXT NOT NULL,
        invoice_date TEXT NOT NULL,
        received_by INTEGER NOT NULL REFERENCES users(user_id),
        received_at TEXT NOT NULL DEFAULT (datetime('now')),
        invoice_blob TEXT NULL,
        invoice_doc_id TEXT NULL,
        UNIQUE (supplier_id, invoice_number)
    );

    CREATE TABLE IF NOT EXISTS batches (
        batch_id INTEGER PRIMARY KEY AUTOINCREMENT,
        medicine_id INTEGER NOT NULL REFERENCES medicines(medicine_id),
        grn_id INTEGER NOT NULL REFERENCES grn(grn_id),
        batch_number TEXT NOT NULL,
        expiry_date TEXT NOT NULL,
        qty_received INTEGER NOT NULL CHECK (qty_received > 0),
        qty_on_hand INTEGER NOT NULL CHECK (qty_on_hand >= 0),
        cost_price REAL NOT NULL CHECK (cost_price >= 0),
        selling_price REAL NOT NULL CHECK (selling_price >= 0),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','RETURNED','WRITTEN_OFF')),
        UNIQUE (medicine_id, batch_number),
        CHECK (qty_on_hand <= qty_received)
    );

    CREATE TABLE IF NOT EXISTS sales (
        sale_id INTEGER PRIMARY KEY AUTOINCREMENT,
        sold_by INTEGER NOT NULL REFERENCES users(user_id),
        sale_time TEXT NOT NULL DEFAULT (datetime('now')),
        customer_name TEXT NULL,
        payment_mode TEXT NOT NULL CHECK (payment_mode IN ('CASH','UPI','CARD'))
    );

    CREATE TABLE IF NOT EXISTS sale_items (
        sale_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL REFERENCES sales(sale_id),
        batch_id INTEGER NOT NULL REFERENCES batches(batch_id),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price REAL NOT NULL CHECK (unit_price >= 0),
        UNIQUE (sale_id, batch_id)
    );

    CREATE TABLE IF NOT EXISTS prescription_register (
        register_id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL REFERENCES sales(sale_id),
        medicine_id INTEGER NOT NULL REFERENCES medicines(medicine_id),
        patient_name TEXT NOT NULL,
        prescriber_name TEXT NOT NULL,
        prescriber_reg_no TEXT NOT NULL,
        recorded_by INTEGER NOT NULL REFERENCES users(user_id),
        recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (sale_id, medicine_id)
    );

    CREATE TABLE IF NOT EXISTS supplier_returns (
        return_id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL REFERENCES batches(batch_id),
        return_qty INTEGER NOT NULL CHECK (return_qty > 0),
        reason TEXT NOT NULL CHECK (reason IN ('NEAR_EXPIRY','EXPIRED','DAMAGED','RECALL')),
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','CREDITED')),
        credit_note_no TEXT NULL,
        credit_amount REAL NULL,
        created_by INTEGER NOT NULL REFERENCES users(user_id),
        approved_by INTEGER NULL REFERENCES users(user_id),
        return_date TEXT NOT NULL DEFAULT (date('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
        audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_time TEXT NOT NULL DEFAULT (datetime('now')),
        user_id INTEGER NULL REFERENCES users(user_id),
        action TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id TEXT NULL,
        old_value TEXT NULL,
        new_value TEXT NULL,
        ip_address TEXT NULL
    );

    CREATE TABLE IF NOT EXISTS demand_forecasts (
        forecast_id INTEGER PRIMARY KEY AUTOINCREMENT,
        medicine_id INTEGER NOT NULL REFERENCES medicines(medicine_id),
        forecast_date TEXT NOT NULL,
        predicted_daily_units REAL NOT NULL CHECK (predicted_daily_units >= 0),
        method TEXT NOT NULL,
        mae REAL NULL,
        UNIQUE (medicine_id, forecast_date)
    );

    -- Insert roles if empty
    INSERT OR IGNORE INTO roles (role_id, role_name) VALUES
        (1, 'Admin'),
        (2, 'Pharmacist'),
        (3, 'Counter'),
        (4, 'Purchase'),
        (5, 'Auditor');

    -- Create operational views
    DROP VIEW IF EXISTS v_expiry_status;
    CREATE VIEW v_expiry_status AS
    SELECT 
        b.batch_id, 
        m.medicine_id, 
        m.brand_name, 
        m.strength, 
        b.batch_number,
        b.expiry_date,
        CAST((julianday(b.expiry_date) - julianday(date('now'))) AS INTEGER) AS days_left,
        b.qty_on_hand,
        ROUND(b.qty_on_hand * b.cost_price, 2) AS stock_cost_value,
        CASE 
            WHEN b.expiry_date <= date('now') THEN 'EXPIRED'
            WHEN (julianday(b.expiry_date) - julianday(date('now'))) <= 30 THEN 'RED'
            WHEN (julianday(b.expiry_date) - julianday(date('now'))) <= 90 THEN 'AMBER'
            ELSE 'GREEN' 
        END AS expiry_band
    FROM batches b
    JOIN medicines m ON m.medicine_id = b.medicine_id
    WHERE b.qty_on_hand > 0 AND b.status IN ('ACTIVE','EXPIRED');

    DROP VIEW IF EXISTS v_sale_bill;
    CREATE VIEW v_sale_bill AS
    SELECT 
        s.sale_id, 
        s.sale_time, 
        s.sold_by, 
        s.payment_mode,
        SUM(si.quantity) AS units,
        SUM(si.quantity * si.unit_price) AS total_amount
    FROM sales s
    JOIN sale_items si ON si.sale_id = s.sale_id
    GROUP BY s.sale_id, s.sale_time, s.sold_by, s.payment_mode;

    DROP VIEW IF EXISTS v_sales_daily;
    CREATE VIEW v_sales_daily AS
    SELECT 
        date(s.sale_time) AS sale_date,
        b.medicine_id, 
        SUM(si.quantity) AS units, 
        SUM(si.quantity * si.unit_price) AS revenue
    FROM sales s
    JOIN sale_items si ON si.sale_id = s.sale_id
    JOIN batches b ON b.batch_id = si.batch_id
    GROUP BY date(s.sale_time), b.medicine_id;

    DROP VIEW IF EXISTS v_expiry_loss_monthly;
    CREATE VIEW v_expiry_loss_monthly AS
    SELECT 
        strftime('%Y-%m', expiry_date) AS expiry_month,
        SUM(qty_on_hand * cost_price) AS loss_value,
        SUM(qty_on_hand) AS units_lost
    FROM batches
    WHERE expiry_date <= date('now') AND qty_on_hand > 0
    GROUP BY strftime('%Y-%m', expiry_date);

    DROP VIEW IF EXISTS v_supplier_returns;
    CREATE VIEW v_supplier_returns AS
    SELECT 
        sp.supplier_name, 
        r.status, 
        r.reason, 
        r.return_qty, 
        COALESCE(r.credit_amount, 0) AS credit_amount, 
        r.return_date
    FROM supplier_returns r
    JOIN batches b ON b.batch_id = r.batch_id
    JOIN grn g ON g.grn_id = b.grn_id
    JOIN suppliers sp ON sp.supplier_id = g.supplier_id;

    DROP VIEW IF EXISTS v_forecast_latest;
    CREATE VIEW v_forecast_latest AS
    SELECT 
        f.medicine_id, 
        m.brand_name, 
        f.predicted_daily_units, 
        f.method, 
        f.mae, 
        f.forecast_date
    FROM demand_forecasts f
    JOIN medicines m ON m.medicine_id = f.medicine_id
    WHERE f.forecast_date = (
        SELECT MAX(forecast_date) 
        FROM demand_forecasts 
        WHERE medicine_id = f.medicine_id
    );
    """)
    conn.commit()


_local_db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "expiryguard_local.db")

def get_connection():
    """
    Returns a live connection to Azure SQL Database if configured,
    or falls back cleanly to the local storage database.
    """
    if SQL_CONN and ("Driver=" in SQL_CONN or "Server=" in SQL_CONN):
        try:
            import pyodbc
            conn = pyodbc.connect(SQL_CONN, timeout=30)
            return conn
        except Exception as e:
            # If remote connection fails and in dev mode, provide local fallback
            if ENV != "prod":
                pass
            else:
                raise e

    # Fallback to local SQLite database
    os.makedirs(os.path.dirname(_local_db_path), exist_ok=True)
    raw_conn = sqlite3.connect(_local_db_path, timeout=30, check_same_thread=False)
    raw_conn.execute("PRAGMA journal_mode = WAL;")
    raw_conn.execute("PRAGMA busy_timeout = 10000;")
    raw_conn.execute("PRAGMA foreign_keys = ON;")
    _init_sqlite_schema(raw_conn)
    return SQLiteConnWrapper(raw_conn)


def db():
    """FastAPI dependency: one connection per request, always closed."""
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()
