# app/routers/medicines.py
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from app.db import db
from app.deps import require_roles, current_user
from app.audit import audit

router = APIRouter(prefix="/medicines", tags=["Medicines"])

class MedicineCreate(BaseModel):
    brand_name: str = Field(min_length=1, max_length=120)
    generic_name: str = Field(min_length=1, max_length=120)
    strength: str = Field(min_length=1, max_length=40)
    dosage_form: str = Field(min_length=1, max_length=30)
    category_id: int = Field(gt=0)
    reorder_level: int = Field(ge=0, default=10)
    requires_prescription: bool = False

class MedicinePatch(BaseModel):
    brand_name: Optional[str] = Field(default=None, max_length=120)
    generic_name: Optional[str] = Field(default=None, max_length=120)
    strength: Optional[str] = Field(default=None, max_length=40)
    dosage_form: Optional[str] = Field(default=None, max_length=30)
    category_id: Optional[int] = Field(default=None, gt=0)
    reorder_level: Optional[int] = Field(default=None, ge=0)
    requires_prescription: Optional[bool] = None
    is_active: Optional[bool] = None

@router.get("/categories")
def list_categories(user=Depends(current_user), conn=Depends(db)):
    cur = conn.cursor()
    cur.execute("SELECT category_id, category_name FROM dbo.categories ORDER BY category_name ASC")
    rows = cur.fetchall()
    return [{"category_id": r.category_id, "category_name": r.category_name} for r in rows]

@router.get("")
def search_medicines(
    q: str = Query(default="", max_length=100),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    user=Depends(current_user),
    conn=Depends(db)
):
    cur = conn.cursor()
    offset = (page - 1) * limit
    pattern = f"%{q.strip()}%"
    
    cur.execute("""
        SELECT m.medicine_id, m.brand_name, m.generic_name, m.strength, m.dosage_form,
               m.category_id, c.category_name, m.reorder_level, m.requires_prescription, m.is_active,
               COALESCE((
                   SELECT SUM(b.qty_on_hand) 
                   FROM dbo.batches b 
                   WHERE b.medicine_id = m.medicine_id AND b.status = 'ACTIVE'
               ), 0) AS total_stock
        FROM dbo.medicines m
        JOIN dbo.categories c ON c.category_id = m.category_id
        WHERE (? = '' OR m.brand_name LIKE ? OR m.generic_name LIKE ?)
        ORDER BY m.brand_name ASC
        LIMIT ? OFFSET ?
    """, q.strip(), pattern, pattern, limit, offset)
    rows = cur.fetchall()
    
    return [{
        "medicine_id": r.medicine_id,
        "brand_name": r.brand_name,
        "generic_name": r.generic_name,
        "strength": r.strength,
        "dosage_form": r.dosage_form,
        "category_id": r.category_id,
        "category_name": r.category_name,
        "reorder_level": r.reorder_level,
        "requires_prescription": bool(r.requires_prescription),
        "is_active": bool(r.is_active),
        "total_stock": r.total_stock
    } for r in rows]

@router.post("", status_code=201)
def create_medicine(
    body: MedicineCreate,
    request: Request,
    user=Depends(require_roles("Admin", "Pharmacist")),
    conn=Depends(db)
):
    ip = request.client.host if request.client else None
    cur = conn.cursor()

    # Check category existence
    cur.execute("SELECT category_id FROM dbo.categories WHERE category_id = ?", body.category_id)
    if not cur.fetchone():
        raise HTTPException(status_code=400, detail="Invalid category_id")

    # Check unique constraint UQ_med_identity
    cur.execute("""
        SELECT medicine_id FROM dbo.medicines 
        WHERE brand_name = ? AND strength = ? AND dosage_form = ?
    """, body.brand_name, body.strength, body.dosage_form)
    if cur.fetchone():
        raise HTTPException(status_code=409, detail="A medicine with identical brand, strength, and dosage form already exists")

    cur.execute("""
        INSERT INTO dbo.medicines (brand_name, generic_name, strength, dosage_form, category_id, reorder_level, requires_prescription, is_active)
        OUTPUT INSERTED.medicine_id
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    """, body.brand_name, body.generic_name, body.strength, body.dosage_form, body.category_id, body.reorder_level, 1 if body.requires_prescription else 0)

    med_id = cur.fetchone().medicine_id
    audit(conn, user["id"], "MEDICINE_CREATE", med_id, ip, table="medicines",
          new=f"brand={body.brand_name};generic={body.generic_name};reorder={body.reorder_level}")
    return {"medicine_id": med_id, "message": "Medicine created successfully"}

@router.patch("/{id}")
def update_medicine(
    id: int,
    body: MedicinePatch,
    request: Request,
    user=Depends(require_roles("Admin", "Pharmacist")),
    conn=Depends(db)
):
    ip = request.client.host if request.client else None
    cur = conn.cursor()
    cur.execute("SELECT * FROM dbo.medicines WHERE medicine_id = ?", id)
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Medicine not found")

    old_vals = []
    new_vals = []

    if body.brand_name is not None:
        cur.execute("UPDATE dbo.medicines SET brand_name = ? WHERE medicine_id = ?", body.brand_name, id)
        old_vals.append(f"brand={row.brand_name}")
        new_vals.append(f"brand={body.brand_name}")

    if body.generic_name is not None:
        cur.execute("UPDATE dbo.medicines SET generic_name = ? WHERE medicine_id = ?", body.generic_name, id)
        old_vals.append(f"generic={row.generic_name}")
        new_vals.append(f"generic={body.generic_name}")

    if body.strength is not None:
        cur.execute("UPDATE dbo.medicines SET strength = ? WHERE medicine_id = ?", body.strength, id)
        old_vals.append(f"strength={row.strength}")
        new_vals.append(f"strength={body.strength}")

    if body.dosage_form is not None:
        cur.execute("UPDATE dbo.medicines SET dosage_form = ? WHERE medicine_id = ?", body.dosage_form, id)
        old_vals.append(f"dosage_form={row.dosage_form}")
        new_vals.append(f"dosage_form={body.dosage_form}")

    if body.category_id is not None:
        cur.execute("UPDATE dbo.medicines SET category_id = ? WHERE medicine_id = ?", body.category_id, id)
        old_vals.append(f"category_id={row.category_id}")
        new_vals.append(f"category_id={body.category_id}")

    if body.reorder_level is not None:
        cur.execute("UPDATE dbo.medicines SET reorder_level = ? WHERE medicine_id = ?", body.reorder_level, id)
        old_vals.append(f"reorder_level={row.reorder_level}")
        new_vals.append(f"reorder_level={body.reorder_level}")

    if body.requires_prescription is not None:
        val = 1 if body.requires_prescription else 0
        cur.execute("UPDATE dbo.medicines SET requires_prescription = ? WHERE medicine_id = ?", val, id)
        old_vals.append(f"requires_prescription={row.requires_prescription}")
        new_vals.append(f"requires_prescription={val}")

    if body.is_active is not None:
        val = 1 if body.is_active else 0
        cur.execute("UPDATE dbo.medicines SET is_active = ? WHERE medicine_id = ?", val, id)
        old_vals.append(f"is_active={row.is_active}")
        new_vals.append(f"is_active={val}")

    audit(conn, user["id"], "MEDICINE_UPDATE", id, ip, table="medicines",
          old=";".join(old_vals), new=";".join(new_vals))
    return {"medicine_id": id, "status": "updated"}


@router.get("/search")
def medicine_autocomplete_search(
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=20, ge=1, le=50),
    user=Depends(current_user),
    conn=Depends(db)
):
    """Fast autocomplete search across brand, generic name, strength, dosage form."""
    cur = conn.cursor()
    pattern = f"%{q.strip()}%"
    cur.execute("""
        SELECT m.medicine_id, m.brand_name, m.generic_name, m.strength, m.dosage_form,
               c.category_name, m.reorder_level, m.requires_prescription,
               COALESCE((
                   SELECT SUM(b.qty_on_hand) 
                   FROM dbo.batches b 
                   WHERE b.medicine_id = m.medicine_id AND b.status = 'ACTIVE'
               ), 0) AS total_stock,
               (
                   SELECT MIN(b.expiry_date)
                   FROM dbo.batches b
                   WHERE b.medicine_id = m.medicine_id AND b.status = 'ACTIVE' AND b.qty_on_hand > 0
               ) AS nearest_expiry
        FROM dbo.medicines m
        JOIN dbo.categories c ON c.category_id = m.category_id
        WHERE m.is_active = 1
          AND (? = '' OR m.brand_name LIKE ? OR m.generic_name LIKE ? OR m.strength LIKE ?)
        ORDER BY m.brand_name ASC
        LIMIT ?
    """, q.strip(), pattern, pattern, pattern, limit)
    rows = cur.fetchall()
    return [{
        "medicine_id": r.medicine_id,
        "brand_name": r.brand_name,
        "generic_name": r.generic_name,
        "strength": r.strength,
        "dosage_form": r.dosage_form,
        "category_name": r.category_name,
        "reorder_level": r.reorder_level,
        "total_stock": r.total_stock,
        "nearest_expiry": str(r.nearest_expiry) if r.nearest_expiry else None,
        "is_low_stock": r.total_stock <= r.reorder_level
    } for r in rows]
