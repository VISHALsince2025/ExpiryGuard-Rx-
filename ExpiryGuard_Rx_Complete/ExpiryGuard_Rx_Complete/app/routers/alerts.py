# app/routers/alerts.py
from datetime import date
from decimal import Decimal
from typing import Optional, Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from app.db import db
from app.deps import require_roles, current_user
from app.services.forecast import batch_risk

router = APIRouter(tags=["Batches, Expiry & Alerts"])

class BatchPatch(BaseModel):
    selling_price: Optional[Decimal] = Field(default=None, ge=0)
    status: Optional[Literal["ACTIVE", "EXPIRED", "RETURNED", "WRITTEN_OFF"]] = None

@router.get("/batches")
def list_batches(
    medicine_id: Optional[int] = None,
    status: Optional[str] = None,
    user=Depends(current_user),
    conn=Depends(db)
):
    cur = conn.cursor()
    cur.execute("""
        SELECT b.batch_id, b.medicine_id, m.brand_name, m.strength, b.grn_id,
               b.batch_number, b.expiry_date, b.qty_received, b.qty_on_hand,
               b.cost_price, b.selling_price, b.status
        FROM dbo.batches b
        JOIN dbo.medicines m ON m.medicine_id = b.medicine_id
        WHERE (? IS NULL OR b.medicine_id = ?)
          AND (? IS NULL OR b.status = ?)
        ORDER BY b.expiry_date ASC
    """, medicine_id, medicine_id, status, status)
    rows = cur.fetchall()
    return [{
        "batch_id": r.batch_id,
        "medicine_id": r.medicine_id,
        "brand_name": r.brand_name,
        "strength": r.strength,
        "grn_id": r.grn_id,
        "batch_number": r.batch_number,
        "expiry_date": str(r.expiry_date),
        "qty_received": r.qty_received,
        "qty_on_hand": r.qty_on_hand,
        "cost_price": float(r.cost_price),
        "selling_price": float(r.selling_price),
        "status": r.status
    } for r in rows]

@router.patch("/batches/{id}")
def update_batch(
    id: int,
    body: BatchPatch,
    user=Depends(require_roles("Admin", "Pharmacist")),
    conn=Depends(db)
):
    cur = conn.cursor()
    # Set session context so DB trigger records the user id
    cur.execute("EXEC sp_set_session_context @key=N'user_id', @value=?", user["id"])
    
    cur.execute("SELECT batch_id, selling_price, status FROM dbo.batches WHERE batch_id = ?", id)
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Batch not found")

    if body.selling_price is not None:
        cur.execute("UPDATE dbo.batches SET selling_price = ? WHERE batch_id = ?", float(body.selling_price), id)
    if body.status is not None:
        cur.execute("UPDATE dbo.batches SET status = ? WHERE batch_id = ?", body.status, id)

    conn.commit()
    return {"batch_id": id, "status": "updated"}

@router.get("/alerts/expiry")
def get_expiry_alerts(
    band: Optional[str] = Query(default=None),
    user=Depends(current_user),
    conn=Depends(db)
):
    cur = conn.cursor()
    cur.execute("""
        SELECT v.batch_id, v.medicine_id, v.brand_name, v.strength, v.batch_number,
               v.expiry_date, v.days_left, v.qty_on_hand, v.stock_cost_value, v.expiry_band,
               b.cost_price,
               f.predicted_daily_units
        FROM dbo.v_expiry_status v
        JOIN dbo.batches b ON b.batch_id = v.batch_id
        LEFT JOIN dbo.v_forecast_latest f ON f.medicine_id = v.medicine_id
        WHERE (? IS NULL OR v.expiry_band = ?)
        ORDER BY v.days_left ASC, v.medicine_id ASC
    """, band, band)
    rows = cur.fetchall()

    today_date = date.today()

    # Group batches by medicine to calculate FEFO-based expiry risk
    med_batches = {}
    for r in rows:
        m_id = r.medicine_id
        if m_id not in med_batches:
            med_batches[m_id] = {
                "forecast": float(r.predicted_daily_units) if r.predicted_daily_units is not None else 0.0,
                "batches": []
            }
        # Parse expiry date
        exp_dt = date.fromisoformat(str(r.expiry_date)) if isinstance(r.expiry_date, str) else r.expiry_date
        med_batches[m_id]["batches"].append({
            "batch_id": r.batch_id,
            "qty": r.qty_on_hand,
            "expiry_date": exp_dt,
            "cost": float(r.cost_price),
            "row": r
        })

    results = []
    for m_id, data in med_batches.items():
        daily_fc = data["forecast"]
        batch_inputs = [{
            "batch_id": b["batch_id"],
            "qty": b["qty"],
            "expiry_date": b["expiry_date"],
            "cost": b["cost"]
        } for b in data["batches"]]

        risk_list = batch_risk(batch_inputs, daily_fc, today_date)
        risk_map = {rk["batch_id"]: rk for rk in risk_list}

        for b in data["batches"]:
            r = b["row"]
            rk_info = risk_map.get(b["batch_id"], {"units_at_risk": b["qty"], "value_at_risk": round(b["qty"] * b["cost"], 2)})
            results.append({
                "batch_id": r.batch_id,
                "medicine_id": r.medicine_id,
                "brand_name": r.brand_name,
                "strength": r.strength,
                "batch_number": r.batch_number,
                "expiry_date": str(r.expiry_date),
                "days_left": r.days_left,
                "qty_on_hand": r.qty_on_hand,
                "stock_cost_value": float(r.stock_cost_value),
                "expiry_band": r.expiry_band,
                "predicted_daily_units": daily_fc if daily_fc > 0 else None,
                "units_at_risk": rk_info["units_at_risk"],
                "value_at_risk": rk_info["value_at_risk"]
            })

    return results

@router.get("/forecast/{medicine_id}")
def get_medicine_forecast(
    medicine_id: int,
    user=Depends(require_roles("Admin", "Pharmacist", "Purchase")),
    conn=Depends(db)
):
    cur = conn.cursor()
    cur.execute("""
        SELECT f.forecast_id, f.medicine_id, m.brand_name, f.forecast_date,
               f.predicted_daily_units, f.method, f.mae
        FROM dbo.demand_forecasts f
        JOIN dbo.medicines m ON m.medicine_id = f.medicine_id
        WHERE f.medicine_id = ?
        ORDER BY f.forecast_date DESC
        LIMIT 1
    """, medicine_id)
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="No forecast model found for this medicine")

    return {
        "forecast_id": row.forecast_id,
        "medicine_id": row.medicine_id,
        "brand_name": row.brand_name,
        "forecast_date": str(row.forecast_date),
        "predicted_daily_units": float(row.predicted_daily_units),
        "method": row.method,
        "mae": float(row.mae) if row.mae is not None else None
    }
