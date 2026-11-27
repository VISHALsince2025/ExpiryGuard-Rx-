# tests/test_scanning.py
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

transport = ASGITransport(app=app)

async def get_auth_cookies_and_headers(username="pharmacist1", password="Pharmacist@123456"):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/auth/login", data={"username": username, "password": password}, follow_redirects=False)
        assert res.status_code in (200, 303)
        token = res.cookies.get("access_token")
        assert token is not None
        return {"cookies": {"access_token": token}, "headers": {"Authorization": f"Bearer {token}"}}

@pytest.mark.asyncio
async def test_voice_nlp_parser_english():
    auth = await get_auth_cookies_and_headers()
    payload = {
        "text": "Add 50 strips of Dolo 650, batch ABC123, expiry March 2027, purchase price 18 rupees, selling price 25 rupees",
        "language": "en-IN"
    }
    async with AsyncClient(transport=transport, base_url="http://test", cookies=auth["cookies"]) as client:
        res = await client.post("/api/scanning/voice", json=payload, headers=auth["headers"])
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["brand_name"] == "Dolo 650"
        assert data["quantity"] == 50
        assert data["batch_number"] == "ABC123"
        assert "2027-03" in data["expiry_date"]
        assert data["purchase_price"] == 18.0
        assert data["selling_price"] == 25.0
        assert data["confidence"] >= 80.0

@pytest.mark.asyncio
async def test_voice_nlp_parser_hindi_hinglish():
    auth = await get_auth_cookies_and_headers()
    payload = {
        "text": "Augmentin 625 ke 30 strips add karo, batch AUG990, expiry December 2026, khareed 120 rupaye aur bech 160 rupaye",
        "language": "hi-IN"
    }
    async with AsyncClient(transport=transport, base_url="http://test", cookies=auth["cookies"]) as client:
        res = await client.post("/api/scanning/voice", json=payload, headers=auth["headers"])
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["brand_name"] == "Augmentin 625"
        assert data["quantity"] == 30
        assert data["batch_number"] == "AUG990"
        assert "2026-12" in data["expiry_date"]
        assert data["purchase_price"] == 120.0
        assert data["selling_price"] == 160.0

@pytest.mark.asyncio
async def test_qr_structured_code_parsing():
    auth = await get_auth_cookies_and_headers()
    qr_payload = 'Brand: Azithromycin 500; Batch: AZ-401; Exp: 2027-10-31; Qty: 40; Cost: 65.0; Price: 95.0'
    async with AsyncClient(transport=transport, base_url="http://test", cookies=auth["cookies"]) as client:
        res = await client.post("/api/scanning/barcode", json={"code": qr_payload}, headers=auth["headers"])
        assert res.status_code == 200
        res_data = res.json()
        assert res_data["is_qr_payload"] is True
        struct = res_data["structured_data"]
        assert struct["brand_name"] == "Azithromycin 500"
        assert struct["batch_number"] == "AZ-401"
        assert struct["expiry_date"] == "2027-10-31"
        assert struct["quantity"] == 40
        assert struct["cost_price"] == 65.0

@pytest.mark.asyncio
async def test_ocr_packaging_text_extraction():
    auth = await get_auth_cookies_and_headers()
    raw_text = "DOLO 650 Tablets\nB.No: DLO2025\nEXP: 12/2027\nMFG: 01/2025\nM.R.P. Rs. 34.50"
    async with AsyncClient(transport=transport, base_url="http://test", cookies=auth["cookies"]) as client:
        res = await client.post("/api/scanning/ocr", data={"raw_text": raw_text}, headers=auth["headers"])
        assert res.status_code == 200
        res_data = res.json()["data"]
        assert res_data["brand_name"] == "Dolo 650"
        assert res_data["batch_number"] == "DLO2025"
        assert "2027-12" in res_data["expiry_date"]
        assert res_data["mrp"] == 34.50

@pytest.mark.asyncio
async def test_save_scanned_medicine_to_database():
    auth = await get_auth_cookies_and_headers("pharmacist1", "Pharmacist@123456")
    save_payload = {
        "brand_name": "TestAI Drug 500",
        "generic_name": "Test Formulation",
        "strength": "500 mg",
        "dosage_form": "Tablet",
        "category_id": 1,
        "batch_number": "TAI-9999",
        "expiry_date": "2027-12-31",
        "quantity": 75,
        "cost_price": 22.50,
        "selling_price": 35.00,
        "supplier_id": 1,
        "source": "AI_TEST_SUITE"
    }
    async with AsyncClient(transport=transport, base_url="http://test", cookies=auth["cookies"]) as client:
        res = await client.post("/api/scanning/save", json=save_payload, headers=auth["headers"])
        assert res.status_code == 200, f"Save failed: {res.text}"
        saved = res.json()
        assert saved["status"] == "success"
        assert saved["data"]["brand_name"] == "TestAI Drug 500"
        assert saved["data"]["batch_number"] == "TAI-9999"
        assert saved["data"]["quantity_added"] == 75

        # Verify lookup via barcode endpoint finds newly stored batch
        lookup_res = await client.post("/api/scanning/barcode", json={"code": "TAI-9999"}, headers=auth["headers"])
        assert lookup_res.status_code == 200
        lookup_data = lookup_res.json()
        assert lookup_data["found"] is True
        assert lookup_data["medicine"]["brand_name"] == "TestAI Drug 500"
        assert any(b["batch_number"] == "TAI-9999" for b in lookup_data["batches"])
