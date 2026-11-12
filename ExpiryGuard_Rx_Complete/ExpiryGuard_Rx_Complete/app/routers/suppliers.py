# app/routers/suppliers.py
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from app.db import db
from app.deps import require_roles
from app.audit import audit

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])

class SupplierCreate(BaseModel):
    supplier_name: str = Field(min_length=1, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=120)
    city: Optional[str] = Field(default=None, max_length=60)

class SupplierPatch(BaseModel):
    supplier_name: Optional[str] = Field(default=None, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=120)
    city: Optional[str] = Field(default=None, max_length=60)

@router.get("")
def list_suppliers(
    user=Depends(require_roles("Admin", "Pharmacist", "Purchase", "Auditor")),
    conn=Depends(db)
):
    cur = conn.cursor()
    cur.execute("""
        SELECT supplier_id, supplier_name, phone, email, city,
               (SELECT COUNT(*) FROM dbo.grn g WHERE g.supplier_id = s.supplier_id) AS total_deliveries
        FROM dbo.suppliers s
        ORDER BY supplier_name ASC
    """)
    rows = cur.fetchall()
    return [{
        "supplier_id": r.supplier_id,
        "supplier_name": r.supplier_name,
        "phone": r.phone,
        "email": r.email,
        "city": r.city,
        "total_deliveries": r.total_deliveries
    } for r in rows]

@router.post("", status_code=201)
def create_supplier(
    body: SupplierCreate,
    request: Request,
    user=Depends(require_roles("Admin", "Purchase")),
    conn=Depends(db)
):
    ip = request.client.host if request.client else None
    cur = conn.cursor()
    
    # Check uniqueness
    cur.execute("SELECT supplier_id FROM dbo.suppliers WHERE supplier_name = ?", body.supplier_name)
    if cur.fetchone():
        raise HTTPException(status_code=409, detail="A supplier with this name already exists")

    cur.execute("""
        INSERT INTO dbo.suppliers (supplier_name, phone, email, city)
        OUTPUT INSERTED.supplier_id
        VALUES (?, ?, ?, ?)
    """, body.supplier_name, body.phone, body.email, body.city)

    sup_id = cur.fetchone().supplier_id
    audit(conn, user["id"], "SUPPLIER_CREATE", sup_id, ip, table="suppliers",
          new=f"name={body.supplier_name};city={body.city}")
    return {"supplier_id": sup_id, "message": "Supplier created successfully"}

@router.patch("/{id}")
def update_supplier(
    id: int,
    body: SupplierPatch,
    request: Request,
    user=Depends(require_roles("Admin", "Purchase")),
    conn=Depends(db)
):
    ip = request.client.host if request.client else None
    cur = conn.cursor()
    cur.execute("SELECT * FROM dbo.suppliers WHERE supplier_id = ?", id)
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Supplier not found")

    old_vals = []
    new_vals = []

    if body.supplier_name is not None:
        cur.execute("UPDATE dbo.suppliers SET supplier_name = ? WHERE supplier_id = ?", body.supplier_name, id)
        old_vals.append(f"name={row.supplier_name}")
        new_vals.append(f"name={body.supplier_name}")

    if body.phone is not None:
        cur.execute("UPDATE dbo.suppliers SET phone = ? WHERE supplier_id = ?", body.phone, id)
        old_vals.append(f"phone={row.phone}")
        new_vals.append(f"phone={body.phone}")

    if body.email is not None:
        cur.execute("UPDATE dbo.suppliers SET email = ? WHERE supplier_id = ?", body.email, id)
        old_vals.append(f"email={row.email}")
        new_vals.append(f"email={body.email}")

    if body.city is not None:
        cur.execute("UPDATE dbo.suppliers SET city = ? WHERE supplier_id = ?", body.city, id)
        old_vals.append(f"city={row.city}")
        new_vals.append(f"city={body.city}")

    audit(conn, user["id"], "SUPPLIER_UPDATE", id, ip, table="suppliers",
          old=";".join(old_vals), new=";".join(new_vals))
    return {"supplier_id": id, "status": "updated"}
