# tests/test_rbac.py
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.security import make_token

@pytest.mark.asyncio
async def test_counter_cannot_access_grn_or_users():
    # Generate token for counter (role 3)
    counter_token = make_token(3, "Counter")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", cookies={"access_token": counter_token}) as client:
        client.cookies.set("access_token", counter_token)
        
        # Attempt to access user management -> 403 Forbidden
        res_users = await client.get("/users")
        assert res_users.status_code == 403

        # Attempt to receive stock (GRN) -> 403 Forbidden
        res_grn = await client.post("/grn", json={
            "supplier_id": 1,
            "invoice_number": "INV-UNAUTH",
            "invoice_date": "2026-10-20",
            "batches": []
        })
        assert res_grn.status_code == 403

        # Attempt to create supplier -> 403 Forbidden
        res_sup = await client.post("/suppliers", json={
            "supplier_name": "Unauthorized Wholesaler"
        })
        assert res_sup.status_code == 403

@pytest.mark.asyncio
async def test_admin_can_access_users():
    admin_token = make_token(1, "Admin")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        client.cookies.set("access_token", admin_token)
        res = await client.get("/users")
        assert res.status_code == 200
        assert isinstance(res.json(), list)

@pytest.mark.asyncio
async def test_auditor_is_read_only():
    auditor_token = make_token(5, "Auditor")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        client.cookies.set("access_token", auditor_token)
        
        # Read audit log is allowed
        res_audit = await client.get("/audit")
        assert res_audit.status_code == 200

        # Create medicine is forbidden (403)
        res_med = await client.post("/medicines", json={
            "brand_name": "Forbidden Brand",
            "generic_name": "Generic",
            "strength": "500 mg",
            "dosage_form": "Tablet",
            "category_id": 1,
            "reorder_level": 10
        })
        assert res_med.status_code == 403
