# app/routers/users.py
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, EmailStr
from app.db import db
from app.deps import require_roles
from app.security import hash_password
from app.audit import audit

router = APIRouter(prefix="/users", tags=["Users"])

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_.-]+$")
    full_name: str = Field(min_length=1, max_length=100)
    email: EmailStr = Field(max_length=120)
    password: str = Field(min_length=8, max_length=128)
    role_id: int = Field(ge=1, le=5)

class UserPatch(BaseModel):
    role_id: Optional[int] = Field(default=None, ge=1, le=5)
    is_active: Optional[bool] = None
    unlock: Optional[bool] = False

@router.get("")
def list_users(user=Depends(require_roles("Admin")), conn=Depends(db)):
    cur = conn.cursor()
    cur.execute("""
        SELECT u.user_id, u.username, u.full_name, u.email, u.role_id, r.role_name, 
               u.is_active, u.failed_attempts, u.locked_until, u.created_at
        FROM dbo.users u
        JOIN dbo.roles r ON r.role_id = u.role_id
        ORDER BY u.user_id ASC
    """)
    rows = cur.fetchall()
    return [{
        "user_id": r.user_id,
        "username": r.username,
        "full_name": r.full_name,
        "email": r.email,
        "role_id": r.role_id,
        "role_name": r.role_name,
        "is_active": bool(r.is_active),
        "failed_attempts": r.failed_attempts,
        "locked_until": str(r.locked_until) if r.locked_until else None,
        "created_at": str(r.created_at)
    } for r in rows]

@router.post("", status_code=201)
def create_user(body: UserCreate, request: Request, user=Depends(require_roles("Admin")), conn=Depends(db)):
    ip = request.client.host if request.client else None
    cur = conn.cursor()
    
    # Check uniqueness
    cur.execute("SELECT user_id FROM dbo.users WHERE username = ? OR email = ?", body.username, body.email)
    if cur.fetchone():
        raise HTTPException(status_code=409, detail="Username or email already in use")

    pwd_hash = hash_password(body.password)
    cur.execute("""
        INSERT INTO dbo.users (username, full_name, email, password_hash, role_id, is_active, failed_attempts)
        OUTPUT INSERTED.user_id
        VALUES (?, ?, ?, ?, ?, 1, 0)
    """, body.username, body.full_name, body.email, pwd_hash, body.role_id)
    
    created_id = cur.fetchone().user_id
    audit(conn, user["id"], "USER_CREATE", created_id, ip, table="users", new=f"username={body.username};role_id={body.role_id}")
    return {"user_id": created_id, "message": "User created successfully"}

@router.patch("/{id}")
def update_user(id: int, body: UserPatch, request: Request, user=Depends(require_roles("Admin")), conn=Depends(db)):
    ip = request.client.host if request.client else None
    cur = conn.cursor()
    cur.execute("SELECT user_id, role_id, is_active, locked_until FROM dbo.users WHERE user_id = ?", id)
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    old_vals = []
    new_vals = []

    if body.role_id is not None:
        cur.execute("UPDATE dbo.users SET role_id = ? WHERE user_id = ?", body.role_id, id)
        old_vals.append(f"role_id={row.role_id}")
        new_vals.append(f"role_id={body.role_id}")

    if body.is_active is not None:
        val = 1 if body.is_active else 0
        cur.execute("UPDATE dbo.users SET is_active = ? WHERE user_id = ?", val, id)
        old_vals.append(f"is_active={row.is_active}")
        new_vals.append(f"is_active={val}")

    if body.unlock:
        cur.execute("UPDATE dbo.users SET failed_attempts = 0, locked_until = NULL WHERE user_id = ?", id)
        new_vals.append("unlocked")

    audit(conn, user["id"], "USER_UPDATE", id, ip, table="users", old=";".join(old_vals), new=";".join(new_vals))
    return {"user_id": id, "status": "updated"}
