# app/audit.py

def audit(conn, user_id, action, record_id, ip=None, table="users", old=None, new=None):
    """
    Records an immutable audit event in dbo.audit_log.
    """
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO dbo.audit_log (user_id, action, table_name, record_id, old_value, new_value, ip_address) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        user_id, action, table, str(record_id) if record_id is not None else None, old, new, ip
    )
    conn.commit()
