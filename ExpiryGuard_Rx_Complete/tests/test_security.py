# tests/test_security.py
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.security import make_token

@pytest.mark.asyncio
async def test_sql_injection_login_rejected():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Classic SQL injection tautology payload
        res = await client.post("/auth/login", data={"username": "admin' OR '1'='1", "password": "x"}, follow_redirects=False)
        assert res.status_code == 401
        assert "Invalid username or password" in res.text

@pytest.mark.asyncio
async def test_bad_quantity_rejected():
    counter_token = make_token(3, "Counter")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        client.cookies.set("access_token", counter_token)
        # Negative quantity must be rejected by Pydantic schema validation (422)
        res = await client.post("/sales", json={
            "payment_mode": "CASH",
            "items": [{"medicine_id": 1, "quantity": -5}]
        })
        assert res.status_code == 422

@pytest.mark.asyncio
async def test_security_headers_present():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/health")
        assert res.status_code == 200
        headers = res.headers
        assert headers.get("X-Content-Type-Options") == "nosniff"
        assert headers.get("X-Frame-Options") == "DENY"
        assert "default-src 'self'" in headers.get("Content-Security-Policy", "")
        assert "max-age=31536000" in headers.get("Strict-Transport-Security", "")
