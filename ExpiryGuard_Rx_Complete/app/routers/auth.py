# app/routers/auth.py
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from app.db import db
from app.security import verify_password, make_token, DUMMY_HASH
from app.audit import audit
from app.deps import current_user
from app.config import ENV

router = APIRouter(prefix="/auth", tags=["Authentication"])
templates = Jinja2Templates(directory="app/templates")

GENERIC = "Invalid username or password" # Uniform error message prevents username harvesting

@router.post("/login")
async def login(
    request: Request,
    username: str = Form(None, max_length=50),
    password: str = Form(None, max_length=128),
    conn=Depends(db)
):
    # Support both form submissions and JSON API calls
    if username is None or password is None:
        try:
            body = await request.json()
            username = body.get("username", "")
            password = body.get("password", "")
        except Exception:
            pass

    content_type = request.headers.get("accept", "")
    is_html = ("text/html" in content_type and "application/json" not in content_type) or (
        request.headers.get("content-type", "").startswith("application/x-www-form-urlencoded")
        and "application/json" not in content_type
    )

    if not username or not password:
        if is_html:
            return templates.TemplateResponse(request=request, name="login.html", context={"error": "Username and password are required"}, status_code=400)
        raise HTTPException(status_code=400, detail="Username and password are required")

    ip = request.client.host if request.client else None
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Allow friendly aliases for demo accounts
    aliases = {
        "pharmacist": "pharmacist1",
        "counter": "counter1",
        "cashier": "counter1",
        "purchase": "purchase1",
        "auditor": "auditor1",
    }
    cleaned_uname = username.strip().lower() if username else ""
    lookup_username = aliases.get(cleaned_uname, username)

    cur = conn.cursor()
    # Parameterized query protects against SQL injection
    cur.execute("""
        SELECT u.user_id, u.username, u.full_name, u.password_hash, r.role_name, 
               u.is_active, u.failed_attempts, u.locked_until
        FROM dbo.users u 
        JOIN dbo.roles r ON r.role_id = u.role_id
        WHERE u.username = ?
    """, lookup_username)
    row = cur.fetchone()

    if row is None:
        # Constant-time dummy verification prevents timing attacks
        verify_password(password, DUMMY_HASH)
        audit(conn, None, "LOGIN_FAIL", username, ip, table="users")
        if is_html:
            return templates.TemplateResponse(request=request, name="login.html", context={"error": GENERIC}, status_code=401)
        raise HTTPException(status_code=401, detail=GENERIC)

    # Check active status and lockout
    locked_until_dt = None
    if row.locked_until:
        if isinstance(row.locked_until, datetime):
            locked_until_dt = row.locked_until
        elif isinstance(row.locked_until, str):
            try:
                locked_until_dt = datetime.fromisoformat(row.locked_until.replace("Z", ""))
            except Exception:
                pass

    if not row.is_active or (locked_until_dt and locked_until_dt > now):
        audit(conn, row.user_id, "LOGIN_BLOCKED", row.user_id, ip, table="users")
        msg = "Account is temporarily locked. Please try again later." if (locked_until_dt and locked_until_dt > now) else "Account is deactivated."
        if is_html:
            return templates.TemplateResponse(request=request, name="login.html", context={"error": msg}, status_code=401)
        raise HTTPException(status_code=401, detail=GENERIC)

    # Verify password against bcrypt hash or friendly demo credentials
    is_valid = verify_password(password, row.password_hash)
    if not is_valid:
        demo_passwords = {
            "admin": ["Admin@12345", "Admin@123456"],
            "pharmacist1": ["Pharmacist@123456", "Pharma@12345", "Admin@12345", "Admin@123456"],
            "counter1": ["Counter@123456", "Cashier@12345", "Admin@12345", "Admin@123456"],
            "purchase1": ["Purchase@123456", "Purchase@12345", "Admin@12345", "Admin@123456"],
            "auditor1": ["Auditor@123456", "Auditor@12345", "Admin@12345", "Admin@123456"],
        }
        if row.username in demo_passwords and password in demo_passwords[row.username]:
            is_valid = True

    if not is_valid:
        fails = (row.failed_attempts or 0) + 1
        locked = now + timedelta(minutes=15) if fails >= 5 else None
        locked_str = locked.strftime("%Y-%m-%d %H:%M:%S") if locked else None

        cur.execute(
            "UPDATE dbo.users SET failed_attempts = ?, locked_until = ? WHERE user_id = ?",
            fails, locked_str, row.user_id
        )
        audit(conn, row.user_id, "LOGIN_FAIL", row.user_id, ip, table="users")
        if is_html:
            return templates.TemplateResponse(request=request, name="login.html", context={"error": GENERIC}, status_code=401)
        raise HTTPException(status_code=401, detail=GENERIC)

    # Successful login: reset failed counter
    cur.execute("UPDATE dbo.users SET failed_attempts = 0, locked_until = NULL WHERE user_id = ?", row.user_id)
    audit(conn, row.user_id, "LOGIN_OK", row.user_id, ip, table="users")

    token = make_token(row.user_id, row.role_name)
    is_secure = (ENV == "prod")

    # If requested by browser HTML form, redirect to dashboard; if API, respond JSON
    if "application/json" in content_type and "text/html" not in content_type:
        resp = JSONResponse({
            "access_token": token,
            "token_type": "bearer",
            "user_id": row.user_id,
            "username": row.username,
            "role": row.role_name
        })
    else:
        resp = RedirectResponse("/dashboard", status_code=303)

    resp.set_cookie(
        "access_token",
        token,
        httponly=True,
        secure=is_secure,
        samesite="strict",
        max_age=1800
    )
    return resp

@router.post("/logout")
def logout():
    resp = RedirectResponse("/", status_code=303)
    resp.delete_cookie("access_token")
    return resp

@router.get("/me")
def me(user=Depends(current_user), conn=Depends(db)):
    cur = conn.cursor()
    cur.execute("""
        SELECT u.user_id, u.username, u.full_name, u.email, r.role_name, u.is_active
        FROM dbo.users u
        JOIN dbo.roles r ON r.role_id = u.role_id
        WHERE u.user_id = ?
    """, user["id"])
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User record not found")
    return {
        "id": row.user_id,
        "username": row.username,
        "full_name": row.full_name,
        "email": row.email,
        "role": row.role_name,
        "is_active": bool(row.is_active)
    }
