# app/routers/returns.py
from decimal import Decimal
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from app.db import db
from app.deps import require_roles
from app.audit import audit

router = APIRouter(prefix="/returns", tags=["Supplier Returns"])

class ReturnCreate(BaseModel):
    batch_id: int = Field(gt=0)
    return_qty: int = Field(gt=0)
    reason: Literal["NEAR_EXPIRY", "EXPIRED", "DAMAGED", "RECALL"]

class CreditNotePatch(BaseModel):
    credit_note_no: str = Field(min_length=1, max_length=40)
    credit_amount: Decimal = Field(ge=0)

@router.get("")
def list_returns(
    status: Optional[str] = None,
    user=Depends(require_roles("Admin", "Pharmacist", "Purchase", "Auditor")),
    conn=Depends(db)
):
    cur = conn.cursor()
    cur.execute("""
        SELECT r.return_id, r.batch_id, b.batch_number, m.brand_name, m.strength,
               sp.supplier_id, sp.supplier_name, r.return_qty, r.reason, r.status,
               r.credit_note_no, r.credit_amount, r.return_date,
               u1.full_name AS created_by_name, u2.full_name AS approved_by_name
        FROM dbo.supplier_returns r
        JOIN dbo.batches b ON b.batch_id = r.batch_id
        JOIN dbo.medicines m ON m.medicine_id = b.medicine_id
        JOIN dbo.grn g ON g.grn_id = b.grn_id
        JOIN dbo.suppliers sp ON sp.supplier_id = g.supplier_id
        JOIN dbo.users u1 ON u1.user_id = r.created_by
        LEFT JOIN dbo.users u2 ON u2.user_id = r.approved_by
        WHERE (? IS NULL OR r.status = ?)
        ORDER BY r.return_id DESC
    """, status, status)
    rows = cur.fetchall()
    return [{
        "return_id": r.return_id,
        "batch_id": r.batch_id,
        "batch_number": r.batch_number,
        "brand_name": r.brand_name,
        "strength": r.strength,
        "supplier_id": r.supplier_id,
        "supplier_name": r.supplier_name,
        "return_qty": r.return_qty,
        "reason": r.reason,
        "status": r.status,
        "credit_note_no": r.credit_note_no,
        "credit_amount": float(r.credit_amount) if r.credit_amount is not None else None,
        "return_date": str(r.return_date),
        "created_by_name": r.created_by_name,
        "approved_by_name": r.approved_by_name
    } for r in rows]

@router.post("", status_code=201)
def create_return(
    body: ReturnCreate,
    request: Request,
    user=Depends(require_roles("Admin", "Pharmacist", "Purchase")),
    conn=Depends(db)
):
    ip = request.client.host if request.client else None
    cur = conn.cursor()

    # Verify batch exists and has sufficient current stock
    cur.execute("SELECT batch_id, qty_on_hand, status FROM dbo.batches WHERE batch_id = ?", body.batch_id)
    batch = cur.fetchone()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if batch.qty_on_hand < body.return_qty:
        raise HTTPException(status_code=400, detail="Return quantity exceeds current stock on hand")

    # Stock is NOT reduced yet (remains on hand until pharmacist approves)
    cur.execute("""
        INSERT INTO dbo.supplier_returns (batch_id, return_qty, reason, status, created_by)
        OUTPUT INSERTED.return_id
        VALUES (?, ?, ?, 'PENDING', ?)
    """, body.batch_id, body.return_qty, body.reason, user["id"])

    return_id = cur.fetchone().return_id
    audit(conn, user["id"], "RETURN_CREATED", return_id, ip, table="supplier_returns",
          new=f"batch={body.batch_id};qty={body.return_qty};reason={body.reason};status=PENDING")
    return {"return_id": return_id, "status": "PENDING", "message": "Return raised and pending approval"}

@router.post("/{id}/approve")
def approve_return(
    id: int,
    user=Depends(require_roles("Admin", "Pharmacist")),
    conn=Depends(db)
):
    conn.autocommit = True # Procedure manages its own transaction
    cur = conn.cursor()
    try:
        cur.execute("EXEC dbo.usp_approve_return @return_id=?, @approved_by=?;", id, user["id"])
        return {"return_id": id, "status": "APPROVED", "message": "Return approved and stock deducted"}
    except Exception as e:
        err = str(e)
        if "50010" in err:
            raise HTTPException(status_code=404, detail="Return not found")
        if "50011" in err:
            raise HTTPException(status_code=409, detail="Return already processed")
        if "50012" in err or "CHECK" in err.upper():
            raise HTTPException(status_code=400, detail="Insufficient batch stock to approve return")
        raise HTTPException(status_code=500, detail="Could not approve return")

@router.patch("/{id}/credit")
def record_credit_note(
    id: int,
    body: CreditNotePatch,
    request: Request,
    user=Depends(require_roles("Admin", "Purchase")),
    conn=Depends(db)
):
    ip = request.client.host if request.client else None
    cur = conn.cursor()
    cur.execute("SELECT return_id, status FROM dbo.supplier_returns WHERE return_id = ?", id)
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Return not found")
    if row.status != "APPROVED":
        raise HTTPException(status_code=400, detail="Credit note can only be applied to APPROVED returns")

    cur.execute("""
        UPDATE dbo.supplier_returns
        SET credit_note_no = ?, credit_amount = ?, status = 'CREDITED'
        WHERE return_id = ?
    """, body.credit_note_no, float(body.credit_amount), id)

    audit(conn, user["id"], "RETURN_CREDITED", id, ip, table="supplier_returns",
          old="APPROVED", new=f"CREDITED;note={body.credit_note_no};amount={body.credit_amount}")
    return {"return_id": id, "status": "CREDITED", "message": "Credit note recorded"}
