# tests/test_performance.py
import pytest
import time
import uuid
import numpy as np
from datetime import date, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db import get_connection
from app.security import make_token

@pytest.mark.asyncio
async def test_nfr1_sale_performance_50_sales_under_2_seconds():
    """
    NFR1 Performance Verification:
    Executes a timing test of 50 multi-line sales.
    Proves 95th percentile latency completes in strictly under 2.0 seconds.
    """
    conn = get_connection()
    cur = conn.cursor()
    today = date.today()

    # Create 3 dedicated high-stock medicines
    med_ids = []
    for idx in range(3):
        bname = f"PerfMed {uuid.uuid4().hex[:6]}"
        cur.execute("""
            INSERT INTO dbo.medicines (brand_name, generic_name, strength, dosage_form, category_id, reorder_level)
            OUTPUT INSERTED.medicine_id
            VALUES (?, 'PerfGen', '500 mg', 'Tablet', 1, 5)
        """, bname)
        m_id = cur.fetchone().medicine_id
        med_ids.append(m_id)

        # Inward 5,000 units
        cur.execute("""
            INSERT INTO dbo.batches (medicine_id, grn_id, batch_number, expiry_date, qty_received, qty_on_hand, cost_price, selling_price, status)
            VALUES (?, 1, ?, ?, 5000, 5000, 10.0, 15.0, 'ACTIVE')
        """, m_id, f"LOT-PERF-{idx}", today + timedelta(days=180))

    conn.commit()
    conn.close()

    counter_token = make_token(3, "Counter")
    transport = ASGITransport(app=app)
    durations = []

    async with AsyncClient(transport=transport, base_url="http://test", cookies={"access_token": counter_token}) as client:
        for i in range(50):
            payload = {
                "customer_name": f"Perf Cust {i}",
                "payment_mode": "CASH" if i % 2 == 0 else "UPI",
                "items": [
                    {"medicine_id": med_ids[0], "quantity": 2},
                    {"medicine_id": med_ids[1], "quantity": 1},
                    {"medicine_id": med_ids[2], "quantity": 3}
                ]
            }

            t0 = time.perf_counter()
            res = await client.post("/sales", json=payload)
            t1 = time.perf_counter()

            assert res.status_code == 201
            durations.append(t1 - t0)

    p95 = np.percentile(durations, 95)
    mean_lat = np.mean(durations)
    print(f"\n[NFR1 Performance Result] 50 Sales Executed. Mean: {mean_lat*1000:.2f}ms, P95: {p95*1000:.2f}ms")
    assert p95 < 2.0, f"P95 latency {p95:.3f}s exceeded 2.0s limit"
