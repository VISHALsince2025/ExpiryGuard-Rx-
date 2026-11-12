# app/routers/reports.py
from datetime import date
from fastapi import APIRouter, Depends
from app.db import db
from app.deps import require_roles

router = APIRouter(prefix="/reports", tags=["Reports & Analytics"])

@router.get("/kpis")
def get_kpis(
    user=Depends(require_roles("Admin", "Pharmacist", "Purchase", "Auditor")),
    conn=Depends(db)
):
    cur = conn.cursor()

    # 1. Expiry loss by month (KPI 1)
    cur.execute("""
        SELECT expiry_month, loss_value, units_lost
        FROM dbo.v_expiry_loss_monthly
        ORDER BY expiry_month DESC
        LIMIT 12
    """)
    kpi1_rows = cur.fetchall()
    kpi1 = [{
        "month": r.expiry_month,
        "loss_value": float(r.loss_value),
        "units_lost": r.units_lost
    } for r in kpi1_rows]

    # 2. Near-expiry stock value (RED + AMBER bands) (KPI 2)
    cur.execute("""
        SELECT expiry_band, 
               COUNT(*) AS batch_count, 
               SUM(qty_on_hand) AS total_units,
               SUM(stock_cost_value) AS total_cost_value
        FROM dbo.v_expiry_status
        GROUP BY expiry_band
    """)
    band_rows = cur.fetchall()
    band_summary = {r.expiry_band: {
        "batches": r.batch_count,
        "units": r.total_units,
        "value": float(r.total_cost_value)
    } for r in band_rows}

    red_val = band_summary.get("RED", {}).get("value", 0.0)
    amber_val = band_summary.get("AMBER", {}).get("value", 0.0)
    expired_val = band_summary.get("EXPIRED", {}).get("value", 0.0)
    near_expiry_total = round(red_val + amber_val, 2)

    # 4. Top 10 Fast Movers (last 30 days) (KPI 4)
    cur.execute("""
        SELECT m.medicine_id, m.brand_name, m.strength, 
               SUM(si.quantity) AS units_sold,
               ROUND(SUM(si.quantity * si.unit_price), 2) AS revenue
        FROM dbo.sale_items si
        JOIN dbo.sales s ON s.sale_id = si.sale_id
        JOIN dbo.batches b ON b.batch_id = si.batch_id
        JOIN dbo.medicines m ON m.medicine_id = b.medicine_id
        WHERE s.sale_time >= datetime('now', '-30 days')
        GROUP BY m.medicine_id, m.brand_name, m.strength
        ORDER BY units_sold DESC
        LIMIT 10
    """)
    fast_movers = [{
        "medicine_id": r.medicine_id,
        "brand_name": r.brand_name,
        "strength": r.strength,
        "units_sold": r.units_sold,
        "revenue": float(r.revenue)
    } for r in cur.fetchall()]

    # 5. Slow Movers (Stock held with 0 or low sales in 30 days) (KPI 5)
    cur.execute("""
        SELECT m.medicine_id, m.brand_name, m.strength,
               SUM(b.qty_on_hand) AS on_hand,
               ROUND(SUM(b.qty_on_hand * b.cost_price), 2) AS tied_up_capital,
               COALESCE((
                   SELECT SUM(si.quantity)
                   FROM dbo.sale_items si
                   JOIN dbo.sales s ON s.sale_id = si.sale_id
                   JOIN dbo.batches b2 ON b2.batch_id = si.batch_id
                   WHERE b2.medicine_id = m.medicine_id AND s.sale_time >= datetime('now', '-30 days')
               ), 0) AS units_sold_30d
        FROM dbo.medicines m
        JOIN dbo.batches b ON b.medicine_id = m.medicine_id
        WHERE m.is_active = 1 AND b.qty_on_hand > 0 AND b.status = 'ACTIVE'
        GROUP BY m.medicine_id, m.brand_name, m.strength
        HAVING units_sold_30d < 10
        ORDER BY tied_up_capital DESC
        LIMIT 10
    """)
    slow_movers = [{
        "medicine_id": r.medicine_id,
        "brand_name": r.brand_name,
        "strength": r.strength,
        "on_hand": r.on_hand,
        "tied_up_capital": float(r.tied_up_capital),
        "units_sold_30d": r.units_sold_30d
    } for r in cur.fetchall()]

    # 6. Daily sales revenue trend (KPI 6)
    cur.execute("""
        SELECT sale_date, SUM(units) AS total_units, ROUND(SUM(revenue), 2) AS total_revenue
        FROM dbo.v_sales_daily
        GROUP BY sale_date
        ORDER BY sale_date DESC
        LIMIT 30
    """)
    daily_sales = [{
        "date": str(r.sale_date),
        "units": r.total_units,
        "revenue": float(r.total_revenue)
    } for r in cur.fetchall()]

    # 7. Supplier return rate & credit received (KPI 7)
    cur.execute("""
        SELECT supplier_name, 
               SUM(return_qty) AS units_returned, 
               ROUND(SUM(credit_amount), 2) AS total_credit
        FROM dbo.v_supplier_returns
        GROUP BY supplier_name
        ORDER BY units_returned DESC
    """)
    supplier_returns = [{
        "supplier_name": r.supplier_name,
        "units_returned": r.units_returned,
        "total_credit": float(r.total_credit)
    } for r in cur.fetchall()]

    # 8. Stock below reorder level (Query Q4 / KPI 8)
    cur.execute("""
        SELECT m.medicine_id, m.brand_name, m.strength, m.reorder_level,
               COALESCE((
                   SELECT SUM(b.qty_on_hand)
                   FROM dbo.batches b
                   WHERE b.medicine_id = m.medicine_id AND b.status = 'ACTIVE'
               ), 0) AS on_hand
        FROM dbo.medicines m
        WHERE m.is_active = 1
          AND COALESCE((
              SELECT SUM(b.qty_on_hand)
              FROM dbo.batches b
              WHERE b.medicine_id = m.medicine_id AND b.status = 'ACTIVE'
          ), 0) < m.reorder_level
        ORDER BY (m.reorder_level - on_hand) DESC
    """)
    reorder_list = [{
        "medicine_id": r.medicine_id,
        "brand_name": r.brand_name,
        "strength": r.strength,
        "reorder_level": r.reorder_level,
        "on_hand": r.on_hand,
        "shortage": r.reorder_level - r.on_hand
    } for r in cur.fetchall()]

    # 9. Sales by cashier & payment mode (KPI 9)
    cur.execute("""
        SELECT u.full_name, COUNT(*) AS bill_count, ROUND(SUM(v.total_amount), 2) AS revenue
        FROM dbo.v_sale_bill v
        JOIN dbo.users u ON u.user_id = v.sold_by
        GROUP BY u.full_name
        ORDER BY revenue DESC
    """)
    cashier_performance = [{
        "cashier_name": r.full_name,
        "bill_count": r.bill_count,
        "revenue": float(r.revenue)
    } for r in cur.fetchall()]

    cur.execute("""
        SELECT payment_mode, COUNT(*) AS count, ROUND(SUM(total_amount), 2) AS amount
        FROM dbo.v_sale_bill
        GROUP BY payment_mode
    """)
    payment_modes = [{
        "mode": r.payment_mode,
        "count": r.count,
        "amount": float(r.amount)
    } for r in cur.fetchall()]

    # Today's overview numbers
    cur.execute("""
        SELECT COUNT(*) AS today_bills, COALESCE(SUM(total_amount), 0) AS today_revenue
        FROM dbo.v_sale_bill
        WHERE date(sale_time) = date('now')
    """)
    today_stats = cur.fetchone()

    return {
        "kpi1_expiry_loss_monthly": {
            "title": "Monthly Expiry Loss (Rupees)",
            "so_what": "Identifies if over-purchasing trends are worsening and flags high-loss months for procurement review.",
            "data": kpi1
        },
        "kpi2_near_expiry_value": {
            "title": "Near-Expiry Stock Value at Risk",
            "so_what": "Quantifies immediate financial capital in RED (<=30 days) and AMBER (<=90 days) bands requiring immediate FEFO dispensing, discount, or supplier return.",
            "near_expiry_total": near_expiry_total,
            "expired_total": expired_val,
            "bands": band_summary
        },
        "kpi4_fast_movers": {
            "title": "Top Fast Moving Medicines (30 Days)",
            "so_what": "Highlights high-velocity stock demanding reliable buffer replenishment to avoid stock-outs.",
            "data": fast_movers
        },
        "kpi5_slow_movers": {
            "title": "Slow Moving Medicines (Dead Capital)",
            "so_what": "Pins down idle pharmaceutical stock with high tied-up rupees to pause replenishment before expiry risk escalates.",
            "data": slow_movers
        },
        "kpi6_daily_revenue": {
            "title": "Daily Sales Revenue Trend",
            "so_what": "Empowers pharmacy owners with operational cash planning and peak-day staffing distribution.",
            "data": daily_sales
        },
        "kpi7_supplier_returns": {
            "title": "Supplier Returns & Credit Recovery",
            "so_what": "Benchmarks supplier accountability, highlighting credit notes received vs outstanding batches.",
            "data": supplier_returns
        },
        "kpi8_reorder_alerts": {
            "title": "Stock Below Reorder Level",
            "so_what": "Immediate procurement action list to prevent patient dispensing failures.",
            "count": len(reorder_list),
            "data": reorder_list
        },
        "kpi9_cashier_and_payments": {
            "title": "Cashier Volume & Payment Modes",
            "so_what": "Operational counter review for auditing cash reconciliation and terminal distribution.",
            "cashiers": cashier_performance,
            "payment_modes": payment_modes
        },
        "today_summary": {
            "today_bills": today_stats.today_bills if today_stats else 0,
            "today_revenue": float(today_stats.today_revenue) if today_stats else 0.0
        }
    }
