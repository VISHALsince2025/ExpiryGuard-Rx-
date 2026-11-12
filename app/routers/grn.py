# app/routers/grn.py
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field, field_validator
from app.db import db
from app.deps import require_roles, current_user
from app.security import validate_upload
from app.services.blob import upload_invoice, short_link
from app.services.cosmos import save_invoice_doc

router = APIRouter(prefix="/grn", tags=["Goods Received Notes"])

class BatchIn(BaseModel):
    medicine_id: int = Field(gt=0)
    batch_number: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9\-_/]+$")
    expiry_date: date
    qty: int = Field(ge=1, le=100000)
    cost_price: Decimal = Field(ge=0, le=100000)
    selling_price: Decimal = Field(ge=0, le=100000)

    @field_validator("expiry_date")
    @classmethod
    def sensible_expiry(cls, v):
        if v <= date.today() or v > date.today() + timedelta(days=365 * 6):
            raise ValueError("Expiry must be in the future and within 6 years")
        return v

class GrnIn(BaseModel):
    supplier_id: int = Field(gt=0)
    invoice_number: str = Field(min_length=1, max_length=50)
    invoice_date: date
    batches: list[BatchIn] = Field(min_length=1, max_length=50)

@router.get("")
def list_grn(user=Depends(require_roles("Admin", "Pharmacist", "Auditor")), conn=Depends(db)):
    cur = conn.cursor()
    cur.execute("""
        SELECT g.grn_id, g.supplier_id, s.supplier_name, g.invoice_number, g.invoice_date,
               g.received_at, u.full_name AS received_by_name, g.invoice_blob, g.invoice_doc_id,
               (SELECT COUNT(*) FROM dbo.batches b WHERE b.grn_id = g.grn_id) AS batch_count,
               (SELECT COALESCE(SUM(b.qty_received), 0) FROM dbo.batches b WHERE b.grn_id = g.grn_id) AS total_units
        FROM dbo.grn g
        JOIN dbo.suppliers s ON s.supplier_id = g.supplier_id
        JOIN dbo.users u ON u.user_id = g.received_by
        ORDER BY g.grn_id DESC
    """)
    rows = cur.fetchall()
    return [{
        "grn_id": r.grn_id,
        "supplier_id": r.supplier_id,
        "supplier_name": r.supplier_name,
        "invoice_number": r.invoice_number,
        "invoice_date": str(r.invoice_date),
        "received_at": str(r.received_at),
        "received_by_name": r.received_by_name,
        "invoice_blob": r.invoice_blob,
        "invoice_doc_id": r.invoice_doc_id,
        "batch_count": r.batch_count,
        "total_units": r.total_units
    } for r in rows]

@router.get("/{id}")
def get_grn_details(id: int, user=Depends(require_roles("Admin", "Pharmacist", "Auditor")), conn=Depends(db)):
    cur = conn.cursor()
    cur.execute("""
        SELECT g.grn_id, g.supplier_id, s.supplier_name, g.invoice_number, g.invoice_date,
               g.received_at, u.full_name AS received_by_name, g.invoice_blob, g.invoice_doc_id
        FROM dbo.grn g
        JOIN dbo.suppliers s ON s.supplier_id = g.supplier_id
        JOIN dbo.users u ON u.user_id = g.received_by
        WHERE g.grn_id = ?
    """, id)
    grn_row = cur.fetchone()
    if not grn_row:
        raise HTTPException(status_code=404, detail="GRN not found")

    cur.execute("""
        SELECT b.batch_id, b.medicine_id, m.brand_name, m.strength, b.batch_number,
               b.expiry_date, b.qty_received, b.qty_on_hand, b.cost_price, b.selling_price, b.status
        FROM dbo.batches b
        JOIN dbo.medicines m ON m.medicine_id = b.medicine_id
        WHERE b.grn_id = ?
        ORDER BY b.batch_id ASC
    """, id)
    batches = cur.fetchall()

    return {
        "grn": {
            "grn_id": grn_row.grn_id,
            "supplier_id": grn_row.supplier_id,
            "supplier_name": grn_row.supplier_name,
            "invoice_number": grn_row.invoice_number,
            "invoice_date": str(grn_row.invoice_date),
            "received_at": str(grn_row.received_at),
            "received_by_name": grn_row.received_by_name,
            "invoice_blob": grn_row.invoice_blob,
            "invoice_doc_id": grn_row.invoice_doc_id
        },
        "batches": [{
            "batch_id": b.batch_id,
            "medicine_id": b.medicine_id,
            "brand_name": b.brand_name,
            "strength": b.strength,
            "batch_number": b.batch_number,
            "expiry_date": str(b.expiry_date),
            "qty_received": b.qty_received,
            "qty_on_hand": b.qty_on_hand,
            "cost_price": float(b.cost_price),
            "selling_price": float(b.selling_price),
            "status": b.status
        } for b in batches]
    }

@router.post("", status_code=201)
def create_grn(
    body: GrnIn,
    user=Depends(require_roles("Admin", "Pharmacist")),
    conn=Depends(db)
):
    cur = conn.cursor()
    try:
        # Atomic transaction: GRN header + batches + audit log
        cur.execute("EXEC sp_set_session_context @key=N'user_id', @value=?", user["id"])
        
        # Verify supplier exists
        cur.execute("SELECT supplier_id FROM dbo.suppliers WHERE supplier_id = ?", body.supplier_id)
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail="Supplier not found")

        # Verify medicines exist
        for b in body.batches:
            cur.execute("SELECT medicine_id FROM dbo.medicines WHERE medicine_id = ?", b.medicine_id)
            if not cur.fetchone():
                raise HTTPException(status_code=400, detail=f"Medicine ID {b.medicine_id} does not exist")

        cur.execute("""
            INSERT INTO dbo.grn (supplier_id, invoice_number, invoice_date, received_by)
            OUTPUT INSERTED.grn_id
            VALUES (?, ?, ?, ?)
        """, body.supplier_id, body.invoice_number, body.invoice_date, user["id"])
        
        grn_id = cur.fetchone().grn_id

        for b in body.batches:
            cur.execute("""
                INSERT INTO dbo.batches (medicine_id, grn_id, batch_number, expiry_date,
                                         qty_received, qty_on_hand, cost_price, selling_price)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, b.medicine_id, grn_id, b.batch_number, b.expiry_date, b.qty, b.qty,
                 float(b.cost_price), float(b.selling_price))

        cur.execute("""
            INSERT INTO dbo.audit_log (user_id, action, table_name, record_id, new_value)
            VALUES (?, 'GRN_CREATED', 'grn', ?, ?)
        """, user["id"], str(grn_id), f"{len(body.batches)} batches; invoice={body.invoice_number}")

        conn.commit()
        return {"grn_id": grn_id, "message": "Stock received successfully"}

    except Exception as e:
        conn.rollback()
        err_msg = str(e)
        if "UNIQUE" in err_msg.upper() or "UQ_" in err_msg.upper() or "IntegrityError" in type(e).__name__:
            raise HTTPException(
                status_code=409,
                detail="Duplicate invoice or batch number, or an unknown supplier or medicine"
            )
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="Could not save the GRN")

@router.post("/{id}/invoice")
async def upload_grn_invoice(
    id: int,
    file: UploadFile = File(...),
    user=Depends(require_roles("Admin", "Pharmacist")),
    conn=Depends(db)
):
    # 1. Validate GRN exists
    cur = conn.cursor()
    cur.execute("SELECT grn_id, supplier_id, invoice_number, invoice_date FROM dbo.grn WHERE grn_id = ?", id)
    grn_row = cur.fetchone()
    if not grn_row:
        raise HTTPException(status_code=404, detail="GRN record not found")

    # 2. Strict file validation (magic bytes & size limit)
    data, ext, content_type = await validate_upload(file)

    try:
        # 3. Upload file to Azure Blob Storage
        blob_name = upload_invoice(data, ext, content_type)

        # 4. Fetch batch details for Cosmos DB semi-structured JSON document
        cur.execute("""
            SELECT m.brand_name, m.strength, b.batch_number, b.qty_received, b.selling_price
            FROM dbo.batches b
            JOIN dbo.medicines m ON m.medicine_id = b.medicine_id
            WHERE b.grn_id = ?
        """, id)
        batch_rows = cur.fetchall()

        invoice_doc = {
            "grn_id": id,
            "supplier_id": grn_row.supplier_id,
            "invoice_number": grn_row.invoice_number,
            "invoice_date": str(grn_row.invoice_date),
            "lines": [{
                "medicine": f"{r.brand_name} {r.strength}",
                "batch": r.batch_number,
                "qty": r.qty_received,
                "mrp": float(r.selling_price)
            } for r in batch_rows],
            "source_blob": blob_name
        }

        # 5. Store semi-structured document in Cosmos DB
        doc_id = save_invoice_doc(invoice_doc)

        # 6. Update GRN SQL record with references
        cur.execute("""
            UPDATE dbo.grn 
            SET invoice_blob = ?, invoice_doc_id = ? 
            WHERE grn_id = ?
        """, blob_name, doc_id, id)
        conn.commit()

        return {
            "grn_id": id,
            "blob_name": blob_name,
            "doc_id": doc_id,
            "message": "Invoice uploaded and recorded in Blob and Cosmos DB"
        }
    except Exception as e:
        # Deliberate architectural trade-off: Stock is already saved safely; report upload issue
        raise HTTPException(
            status_code=502,
            detail=f"Stock was preserved, but invoice storage failed: {str(e)}"
        )

@router.get("/{id}/invoice-link")
def get_invoice_link(
    id: int,
    user=Depends(require_roles("Admin", "Pharmacist", "Auditor")),
    conn=Depends(db)
):
    cur = conn.cursor()
    cur.execute("SELECT invoice_blob FROM dbo.grn WHERE grn_id = ?", id)
    row = cur.fetchone()
    if not row or not row.invoice_blob:
        raise HTTPException(status_code=404, detail="No invoice scan uploaded for this GRN")

    # Generate 5-minute SAS temporary link
    url = short_link(row.invoice_blob, minutes=5)
    return {"url": url, "expires_in_minutes": 5}
