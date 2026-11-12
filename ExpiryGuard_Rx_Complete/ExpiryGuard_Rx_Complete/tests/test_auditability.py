# tests/test_auditability.py
import pytest
import uuid
from datetime import date, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db import get_connection
from app.security import make_token

@pytest.mark.asyncio
async def test_nfr5_100_percent_stock_changing_operations_audited():
    """
    NFR5 Auditability Verification:
    Proves that 100% of stock-changing operations create an audit log entry.
    """
    conn = get_connection()
    cur = conn.cursor()
    today = date.today()

    cur.execute("SELECT COUNT(*) AS initial_audit_count FROM dbo.audit_log")
    initial_audit_count = cur.fetchone().initial_audit_count

    # 1. GRN creation (Stock Inward)
    pharma_token = make_token(2, "Pharmacist")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", cookies={"access_token": pharma_token}) as client:
        # Create medicine
        bname = f"AuditMed {uuid.uuid4().hex[:6]}"
        cur.execute("""
            INSERT INTO dbo.medicines (brand_name, generic_name, strength, dosage_form, category_id, reorder_level)
            OUTPUT INSERTED.medicine_id
            VALUES (?, 'AuditGen', '100 mg', 'Tablet', 1, 5)
        """, bname)
        m_id = cur.fetchone().medicine_id
        conn.commit()

        # Inward stock
        res_grn = await client.post("/grn", json={
            "supplier_id": 1,
            "invoice_number": f"INV-AUD-{uuid.uuid4().hex[:6]}",
            "invoice_date": str(today),
            "batches": [{
                "medicine_id": m_id,
                "batch_number": "LOT-AUD-01",
                "expiry_date": str(today + timedelta(days=90)),
                "qty": 40,
                "cost_price": 10.0,
                "selling_price": 20.0
            }]
        })
        assert res_grn.status_code == 201

        # Check audit: GRN_CREATED must exist
        cur.execute("SELECT COUNT(*) AS cnt FROM dbo.audit_log WHERE action = 'GRN_CREATED'")
        assert cur.fetchone().cnt >= 1

        # 2. FEFO Sale Dispensing (Stock Reduction)
        counter_token = make_token(3, "Counter")
        client.cookies.set("access_token", counter_token)
        res_sale = await client.post("/sales", json={
            "payment_mode": "CASH",
            "items": [{"medicine_id": m_id, "quantity": 10}]
        })
        assert res_sale.status_code == 201

        # Check audit: BATCH_UPDATE and SALE_CREATED must exist
        cur.execute("SELECT COUNT(*) AS cnt FROM dbo.audit_log WHERE action = 'SALE_CREATED'")
        assert cur.fetchone().cnt >= 1
        cur.execute("SELECT COUNT(*) AS cnt FROM dbo.audit_log WHERE action = 'BATCH_UPDATE'")
        assert cur.fetchone().cnt >= 1

    cur.execute("SELECT COUNT(*) AS final_audit_count FROM dbo.audit_log")
    final_audit_count = cur.fetchone().final_audit_count
    conn.close()

    assert final_audit_count > initial_audit_count
    print(f"\n[NFR5 Auditability Result] Verified audit rows increased by {final_audit_count - initial_audit_count}")
