# app/routers/sales.py
import json
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from app.db import db
from app.deps import require_roles
from app.audit import audit

router = APIRouter(tags=["Sales & Billing"])

class Item(BaseModel):
    medicine_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=500)

class SaleIn(BaseModel):
    customer_name: Optional[str] = Field(default=None, max_length=100)
    payment_mode: Literal["CASH", "UPI", "CARD"]
    items: list[Item] = Field(min_length=1, max_length=30)

class PrescriptionIn(BaseModel):
    medicine_id: int = Field(gt=0)
    patient_name: str = Field(min_length=1, max_length=100)
    prescriber_name: str = Field(min_length=1, max_length=100)
    prescriber_reg_no: str = Field(min_length=1, max_length=40)

@router.get("/sales")
def list_sales(
    limit: int = 50,
    user=Depends(require_roles("Admin", "Pharmacist", "Counter", "Auditor")),
    conn=Depends(db)
):
    cur = conn.cursor()
    cur.execute("""
        SELECT v.sale_id, v.sale_time, v.sold_by, u.full_name AS cashier_name,
               s.customer_name, v.payment_mode, v.units, v.total_amount
        FROM dbo.v_sale_bill v
        JOIN dbo.sales s ON s.sale_id = v.sale_id
        JOIN dbo.users u ON u.user_id = v.sold_by
        ORDER BY v.sale_id DESC
        LIMIT ?
    """, limit)
    rows = cur.fetchall()
    return [{
        "sale_id": r.sale_id,
        "sale_time": str(r.sale_time),
        "sold_by": r.sold_by,
        "cashier_name": r.cashier_name,
        "customer_name": r.customer_name,
        "payment_mode": r.payment_mode,
        "units": r.units,
        "total_amount": float(r.total_amount)
    } for r in rows]

@router.post("/sales", status_code=201)
def create_sale(
    body: SaleIn,
    user=Depends(require_roles("Admin", "Pharmacist", "Counter")),
    conn=Depends(db)
):
    conn.autocommit = True # Stored procedure executes its own transactional scope
    cur = conn.cursor()
    try:
        cur.execute(
            "SET NOCOUNT ON; DECLARE @id INT; "
            "EXEC dbo.usp_create_sale @sold_by=?, @customer_name=?, @payment_mode=?, @items=?, @sale_id=@id OUTPUT; "
            "SELECT @id AS sale_id;",
            user["id"], body.customer_name, body.payment_mode,
            json.dumps([i.model_dump() for i in body.items])
        )
        row = cur.fetchone()
        sale_id = row.sale_id if row else None
        return {"sale_id": sale_id, "message": "Sale completed successfully via FEFO"}

    except Exception as e:
        err = str(e)
        if "50001" in err:
            raise HTTPException(status_code=409, detail="Insufficient unexpired stock for a requested medicine.")
        raise HTTPException(status_code=500, detail="Could not complete the sale")

@router.get("/sales/{id}")
def get_sale_bill(
    id: int,
    user=Depends(require_roles("Admin", "Pharmacist", "Counter", "Auditor")),
    conn=Depends(db)
):
    cur = conn.cursor()
    cur.execute("""
        SELECT s.sale_id, s.sale_time, s.customer_name, s.payment_mode,
               u.full_name AS cashier_name
        FROM dbo.sales s
        JOIN dbo.users u ON u.user_id = s.sold_by
        WHERE s.sale_id = ?
    """, id)
    sale_row = cur.fetchone()
    if not sale_row:
        raise HTTPException(status_code=404, detail="Bill not found")

    cur.execute("""
        SELECT si.sale_item_id, si.batch_id, b.batch_number, b.expiry_date,
               m.medicine_id, m.brand_name, m.strength, m.requires_prescription,
               si.quantity, si.unit_price,
               ROUND(si.quantity * si.unit_price, 2) AS line_total
        FROM dbo.sale_items si
        JOIN dbo.batches b ON b.batch_id = si.batch_id
        JOIN dbo.medicines m ON m.medicine_id = b.medicine_id
        WHERE si.sale_id = ?
        ORDER BY si.sale_item_id ASC
    """, id)
    items = cur.fetchall()

    total_amount = sum(float(i.line_total) for i in items)
    total_units = sum(i.quantity for i in items)

    # Check for prescription records
    cur.execute("""
        SELECT r.register_id, r.medicine_id, m.brand_name, r.patient_name,
               r.prescriber_name, r.prescriber_reg_no, r.recorded_at
        FROM dbo.prescription_register r
        JOIN dbo.medicines m ON m.medicine_id = r.medicine_id
        WHERE r.sale_id = ?
    """, id)
    rx_records = cur.fetchall()

    return {
        "sale_id": sale_row.sale_id,
        "sale_time": str(sale_row.sale_time),
        "customer_name": sale_row.customer_name,
        "payment_mode": sale_row.payment_mode,
        "cashier_name": sale_row.cashier_name,
        "total_units": total_units,
        "total_amount": round(total_amount, 2),
        "items": [{
            "item_id": i.sale_item_id,
            "medicine_id": i.medicine_id,
            "brand_name": i.brand_name,
            "strength": i.strength,
            "batch_id": i.batch_id,
            "batch_number": i.batch_number,
            "expiry_date": str(i.expiry_date),
            "quantity": i.quantity,
            "unit_price": float(i.unit_price),
            "line_total": float(i.line_total),
            "requires_prescription": bool(i.requires_prescription)
        } for i in items],
        "prescriptions": [{
            "register_id": rx.register_id,
            "medicine_id": rx.medicine_id,
            "brand_name": rx.brand_name,
            "patient_name": rx.patient_name,
            "prescriber_name": rx.prescriber_name,
            "prescriber_reg_no": rx.prescriber_reg_no,
            "recorded_at": str(rx.recorded_at)
        } for rx in rx_records]
    }

@router.post("/sales/{id}/prescription", status_code=201)
def record_prescription(
    id: int,
    body: PrescriptionIn,
    request: Request,
    user=Depends(require_roles("Admin", "Pharmacist")),
    conn=Depends(db)
):
    ip = request.client.host if request.client else None
    cur = conn.cursor()

    # Verify sale and medicine
    cur.execute("SELECT sale_id FROM dbo.sales WHERE sale_id = ?", id)
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Sale not found")

    cur.execute("SELECT medicine_id FROM dbo.medicines WHERE medicine_id = ?", body.medicine_id)
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Medicine not found")

    # Check unique constraint UQ_rx_sale_med
    cur.execute("SELECT register_id FROM dbo.prescription_register WHERE sale_id = ? AND medicine_id = ?", id, body.medicine_id)
    if cur.fetchone():
        raise HTTPException(status_code=409, detail="Prescription entry already recorded for this medicine on this bill")

    cur.execute("""
        INSERT INTO dbo.prescription_register (sale_id, medicine_id, patient_name, prescriber_name, prescriber_reg_no, recorded_by)
        OUTPUT INSERTED.register_id
        VALUES (?, ?, ?, ?, ?, ?)
    """, id, body.medicine_id, body.patient_name, body.prescriber_name, body.prescriber_reg_no, user["id"])

    reg_id = cur.fetchone().register_id
    audit(conn, user["id"], "RX_RECORDED", reg_id, ip, table="prescription_register",
          new=f"patient={body.patient_name};doctor={body.prescriber_name};reg_no={body.prescriber_reg_no}")

    return {"register_id": reg_id, "message": "Prescription details recorded"}
