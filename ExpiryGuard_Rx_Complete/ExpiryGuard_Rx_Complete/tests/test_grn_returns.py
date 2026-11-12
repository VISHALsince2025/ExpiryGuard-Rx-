# tests/test_grn_returns.py
import pytest
import uuid
from datetime import date, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.security import make_token
from app.db import get_connection

@pytest.mark.asyncio
async def test_grn_duplicate_batch_fails():
    """
    Verifies that inserting duplicate batch number for the same medicine fails safely (409)
    and rolls back transaction.
    """
    pharmacist_token = make_token(2, "Pharmacist")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", cookies={"access_token": pharmacist_token}) as client:
        # Create unique medicine
        conn = get_connection()
        cur = conn.cursor()
        unique_brand = f"DupBatch Med {uuid.uuid4().hex[:6]}"
        cur.execute("""
            INSERT INTO dbo.medicines (brand_name, generic_name, strength, dosage_form, category_id, reorder_level)
            OUTPUT INSERTED.medicine_id
            VALUES (?, 'Dup Gen', '250 mg', 'Tablet', 1, 10)
        """, unique_brand)
        med_id = cur.fetchone().medicine_id
        conn.commit()
        conn.close()

        today = date.today()
        # 1. First GRN succeeds
        res1 = await client.post("/grn", json={
            "supplier_id": 1,
            "invoice_number": f"INV-{uuid.uuid4().hex[:6]}",
            "invoice_date": str(today),
            "batches": [{
                "medicine_id": med_id,
                "batch_number": "BATCH-DUP-01",
                "expiry_date": str(today + timedelta(days=90)),
                "qty": 50,
                "cost_price": 10.0,
                "selling_price": 15.0
            }]
        })
        assert res1.status_code == 201

        # 2. Duplicate batch for same medicine must fail (409)
        res2 = await client.post("/grn", json={
            "supplier_id": 1,
            "invoice_number": f"INV-{uuid.uuid4().hex[:6]}",
            "invoice_date": str(today),
            "batches": [{
                "medicine_id": med_id,
                "batch_number": "BATCH-DUP-01",
                "expiry_date": str(today + timedelta(days=90)),
                "qty": 20,
                "cost_price": 10.0,
                "selling_price": 15.0
            }]
        })
        assert res2.status_code == 409
        assert "Duplicate invoice or batch number" in res2.text

@pytest.mark.asyncio
async def test_supplier_return_workflow():
    """
    Verifies supplier return lifecycle:
    1. Raise return (PENDING) -> stock NOT reduced yet
    2. Approve return (APPROVED) -> stock IS reduced
    3. Credit note (CREDITED) -> status updated
    """
    pharmacist_token = make_token(2, "Pharmacist")
    purchase_token = make_token(4, "Purchase")

    # Create a batch with 30 units
    conn = get_connection()
    cur = conn.cursor()
    unique_brand = f"Return Med {uuid.uuid4().hex[:6]}"
    cur.execute("""
        INSERT INTO dbo.medicines (brand_name, generic_name, strength, dosage_form, category_id, reorder_level)
        OUTPUT INSERTED.medicine_id
        VALUES (?, 'Ret Gen', '50 mg', 'Tablet', 1, 5)
    """, unique_brand)
    med_id = cur.fetchone().medicine_id

    today = date.today()
    cur.execute("""
        INSERT INTO dbo.batches (medicine_id, grn_id, batch_number, expiry_date, qty_received, qty_on_hand, cost_price, selling_price, status)
        OUTPUT INSERTED.batch_id
        VALUES (?, 1, 'BATCH-RET-1', ?, 30, 30, 10.0, 15.0, 'ACTIVE')
    """, med_id, today + timedelta(days=40))
    batch_id = cur.fetchone().batch_id
    conn.commit()
    conn.close()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Step 1: Raise return as Purchase Officer
        client.cookies.set("access_token", purchase_token)
        res_raise = await client.post("/returns", json={
            "batch_id": batch_id,
            "return_qty": 10,
            "reason": "NEAR_EXPIRY"
        })
        assert res_raise.status_code == 201
        return_id = res_raise.json()["return_id"]

        # Stock must still be 30 (not reduced prematurely)
        c_check = get_connection()
        cur_c = c_check.cursor()
        cur_c.execute("SELECT qty_on_hand FROM dbo.batches WHERE batch_id = ?", batch_id)
        assert cur_c.fetchone().qty_on_hand == 30

        # Step 2: Pharmacist approves return -> stock reduced to 20
        client.cookies.set("access_token", pharmacist_token)
        res_approve = await client.post(f"/returns/{return_id}/approve")
        assert res_approve.status_code == 200

        cur_c.execute("SELECT qty_on_hand FROM dbo.batches WHERE batch_id = ?", batch_id)
        assert cur_c.fetchone().qty_on_hand == 20

        # Step 3: Purchase records credit note
        client.cookies.set("access_token", purchase_token)
        res_credit = await client.patch(f"/returns/{return_id}/credit", json={
            "credit_note_no": "CRN-TEST-999",
            "credit_amount": 100.00
        })
        assert res_credit.status_code == 200
        assert res_credit.json()["status"] == "CREDITED"
        c_check.close()
