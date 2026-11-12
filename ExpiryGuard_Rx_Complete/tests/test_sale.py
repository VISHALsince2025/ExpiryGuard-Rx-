# tests/test_sale.py
import pytest
import asyncio
import uuid
from datetime import date, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db import get_connection
from app.security import make_token

@pytest.mark.asyncio
async def test_fefo_earliest_batch_allocated():
    """
    Verifies that FEFO allocates from the earliest expiring active batch.
    """
    conn = get_connection()
    cur = conn.cursor()
    unique_brand = f"FEFO Med {uuid.uuid4().hex[:6]}"

    # Create a test medicine
    cur.execute("""
        INSERT INTO dbo.medicines (brand_name, generic_name, strength, dosage_form, category_id, reorder_level)
        OUTPUT INSERTED.medicine_id
        VALUES (?, 'FEFO Generic', '500 mg', 'Tablet', 1, 10)
    """, unique_brand)
    med_id = cur.fetchone().medicine_id

    # Create 2 batches: B1 expires in 20 days (qty: 15), B2 expires in 80 days (qty: 50)
    today = date.today()
    cur.execute("""
        INSERT INTO dbo.batches (medicine_id, grn_id, batch_number, expiry_date, qty_received, qty_on_hand, cost_price, selling_price, status)
        OUTPUT INSERTED.batch_id
        VALUES (?, 1, 'BATCH-EARLY', ?, 15, 15, 10.0, 20.0, 'ACTIVE')
    """, med_id, today + timedelta(days=20))
    b1_id = cur.fetchone().batch_id

    cur.execute("""
        INSERT INTO dbo.batches (medicine_id, grn_id, batch_number, expiry_date, qty_received, qty_on_hand, cost_price, selling_price, status)
        OUTPUT INSERTED.batch_id
        VALUES (?, 1, 'BATCH-LATE', ?, 50, 50, 10.0, 20.0, 'ACTIVE')
    """, med_id, today + timedelta(days=80))
    b2_id = cur.fetchone().batch_id
    conn.commit()
    conn.close()

    # Sell 20 units: Should take ALL 15 from B1 (earlier expiry) and 5 from B2
    counter_token = make_token(3, "Counter")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", cookies={"access_token": counter_token}) as client:
        res = await client.post("/sales", json={
            "customer_name": "FEFO Test Patient",
            "payment_mode": "CASH",
            "items": [{"medicine_id": med_id, "quantity": 20}]
        })
        assert res.status_code == 201
        sale_id = res.json()["sale_id"]

        # Verify bill line items
        bill_res = await client.get(f"/sales/{sale_id}")
        assert bill_res.status_code == 200
        bill_data = bill_res.json()

        items = bill_data["items"]
        assert len(items) == 2
        # Earliest batch took 15
        assert items[0]["batch_id"] == b1_id
        assert items[0]["quantity"] == 15
        # Next batch took 5
        assert items[1]["batch_id"] == b2_id
        assert items[1]["quantity"] == 5

    # Verify on-hand stock updated in DB
    conn_verify = get_connection()
    cur_v = conn_verify.cursor()
    cur_v.execute("SELECT qty_on_hand FROM dbo.batches WHERE batch_id = ?", b1_id)
    assert cur_v.fetchone().qty_on_hand == 0
    cur_v.execute("SELECT qty_on_hand FROM dbo.batches WHERE batch_id = ?", b2_id)
    assert cur_v.fetchone().qty_on_hand == 45
    conn_verify.close()

@pytest.mark.asyncio
async def test_insufficient_stock_fails_atomically():
    """
    Verifies that attempting to sell more than unexpired stock rolls back entire transaction (409)
    and leaves stock completely unchanged.
    """
    conn = get_connection()
    cur = conn.cursor()
    unique_brand = f"Shortage Med {uuid.uuid4().hex[:6]}"

    # Create medicine with only 5 units in stock
    cur.execute("""
        INSERT INTO dbo.medicines (brand_name, generic_name, strength, dosage_form, category_id, reorder_level)
        OUTPUT INSERTED.medicine_id
        VALUES (?, 'Shortage Gen', '100 mg', 'Capsule', 1, 5)
    """, unique_brand)
    med_id = cur.fetchone().medicine_id

    today = date.today()
    cur.execute("""
        INSERT INTO dbo.batches (medicine_id, grn_id, batch_number, expiry_date, qty_received, qty_on_hand, cost_price, selling_price, status)
        OUTPUT INSERTED.batch_id
        VALUES (?, 1, 'BATCH-SHORT', ?, 5, 5, 5.0, 10.0, 'ACTIVE')
    """, med_id, today + timedelta(days=30))
    b_id = cur.fetchone().batch_id
    conn.commit()
    conn.close()

    counter_token = make_token(3, "Counter")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", cookies={"access_token": counter_token}) as client:
        # Attempt to sell 10 units when only 5 exist
        res = await client.post("/sales", json={
            "payment_mode": "UPI",
            "items": [{"medicine_id": med_id, "quantity": 10}]
        })
        assert res.status_code == 409
        assert "Insufficient unexpired stock" in res.text

    # Verify stock remains untouched (5)
    conn_verify = get_connection()
    cur_v = conn_verify.cursor()
    cur_v.execute("SELECT qty_on_hand FROM dbo.batches WHERE batch_id = ?", b_id)
    assert cur_v.fetchone().qty_on_hand == 5
    conn_verify.close()

@pytest.mark.asyncio
async def test_concurrent_sales_competing_for_last_unit():
    """
    NFR3 Consistency Test:
    When total available stock = 1 unit, two concurrent terminals attempting to buy 1 unit
    must NOT both succeed. Exactly ONE sale must succeed, and the other must fail with 409.
    Final stock must equal 0, never negative.
    """
    conn = get_connection()
    cur = conn.cursor()
    unique_brand = f"Race Med {uuid.uuid4().hex[:6]}"

    cur.execute("""
        INSERT INTO dbo.medicines (brand_name, generic_name, strength, dosage_form, category_id, reorder_level)
        OUTPUT INSERTED.medicine_id
        VALUES (?, 'Race Gen', '200 mg', 'Tablet', 1, 1)
    """, unique_brand)
    med_id = cur.fetchone().medicine_id

    today = date.today()
    cur.execute("""
        INSERT INTO dbo.batches (medicine_id, grn_id, batch_number, expiry_date, qty_received, qty_on_hand, cost_price, selling_price, status)
        OUTPUT INSERTED.batch_id
        VALUES (?, 1, 'BATCH-RACE-1', ?, 1, 1, 10.0, 25.0, 'ACTIVE')
    """, med_id, today + timedelta(days=50))
    b_id = cur.fetchone().batch_id
    conn.commit()
    conn.close()

    counter_token = make_token(3, "Counter")
    transport = ASGITransport(app=app)

    async def attempt_sale(terminal_id):
        async with AsyncClient(transport=transport, base_url="http://test", cookies={"access_token": counter_token}) as client:
            return await client.post("/sales", json={
                "customer_name": f"Terminal {terminal_id}",
                "payment_mode": "CASH",
                "items": [{"medicine_id": med_id, "quantity": 1}]
            })

    # Fire two concurrent sale requests
    res1, res2 = await asyncio.gather(attempt_sale(1), attempt_sale(2))

    statuses = [res1.status_code, res2.status_code]
    # Exactly one must be 201 Created and the other must be 409 Conflict
    assert 201 in statuses
    assert 409 in statuses

    # Final DB check: Final stock must be exactly 0, never negative
    conn_check = get_connection()
    cur_check = conn_check.cursor()
    cur_check.execute("SELECT qty_on_hand FROM dbo.batches WHERE batch_id = ?", b_id)
    final_stock = cur_check.fetchone().qty_on_hand
    assert final_stock == 0
    conn_check.close()
