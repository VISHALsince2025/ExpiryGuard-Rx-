# tests/test_clinical.py
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

transport = ASGITransport(app=app)

async def get_auth_cookies_and_headers():
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/auth/login", data={"username": "pharmacist1", "password": "Pharmacist@123456"}, follow_redirects=False)
        assert res.status_code in (200, 303)
        token = res.cookies.get("access_token")
        return {"cookies": {"access_token": token}, "headers": {"Authorization": f"Bearer {token}"}}

@pytest.mark.asyncio
async def test_clinical_common_drugs_list():
    auth = await get_auth_cookies_and_headers()
    async with AsyncClient(transport=transport, base_url="http://test", cookies=auth["cookies"]) as client:
        res = await client.get("/api/clinical/common-drugs", headers=auth["headers"])
        assert res.status_code == 200
        drugs = res.json()
        assert len(drugs) > 0
        assert "medicine_id" in drugs[0]
        assert "brand_name" in drugs[0]

@pytest.mark.asyncio
async def test_clinical_interaction_checker_safe():
    auth = await get_auth_cookies_and_headers()
    # Check 1 drug
    async with AsyncClient(transport=transport, base_url="http://test", cookies=auth["cookies"]) as client:
        res = await client.post("/api/clinical/check-interactions", json={"medicine_ids": [1]}, headers=auth["headers"])
        assert res.status_code == 200
        data = res.json()
        assert data["overall_risk"] in ("SAFE", "MODERATE_CAUTION", "CRITICAL_WARNING")
        assert "clinical_summary" in data
