# tests/test_auth.py
import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db import get_connection
from app.security import hash_password

@pytest.mark.asyncio
async def test_auth_login_success():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/auth/login", data={"username": "admin", "password": "Admin@123456"}, follow_redirects=False)
        assert res.status_code in (303, 200)
        assert "access_token" in res.cookies

@pytest.mark.asyncio
async def test_auth_login_invalid_password():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/auth/login", data={"username": "admin", "password": "WrongPassword!99"}, follow_redirects=False)
        assert res.status_code == 401
        assert "Invalid username or password" in res.text

@pytest.mark.asyncio
async def test_auth_lockout_after_failures():
    # Create isolated user for lockout testing
    conn = get_connection()
    cur = conn.cursor()
    lock_uname = f"lockuser_{uuid.uuid4().hex[:6]}"
    hashed = hash_password("ValidPassword@123")
    cur.execute("""
        INSERT INTO dbo.users (username, full_name, email, password_hash, role_id, is_active, failed_attempts)
        OUTPUT INSERTED.user_id
        VALUES (?, 'Lockout User', ?, ?, 3, 1, 0)
    """, lock_uname, f"{lock_uname}@rx.com", hashed)
    conn.commit()
    conn.close()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 5 failed attempts
        for _ in range(5):
            res = await client.post("/auth/login", data={"username": lock_uname, "password": "BadPassword"}, follow_redirects=False)
            assert res.status_code == 401
        
        # 6th attempt with CORRECT password must still be rejected due to lockout
        res_blocked = await client.post("/auth/login", data={"username": lock_uname, "password": "ValidPassword@123"}, follow_redirects=False)
        assert res_blocked.status_code == 401

@pytest.mark.asyncio
async def test_auth_me_requires_token():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/auth/me")
        assert res.status_code == 401
