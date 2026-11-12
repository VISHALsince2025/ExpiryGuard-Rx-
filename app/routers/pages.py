# app/routers/pages.py
import os
from datetime import date, datetime
from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from app.deps import current_user
from app.db import db

router = APIRouter(include_in_schema=False)
TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")
templates = Jinja2Templates(directory=TEMPLATES_DIR if os.path.isdir(TEMPLATES_DIR) else "app/templates")

def get_dashboard_summary_data(conn, user_id=None):
    cur = conn.cursor()

    # User profile lookup
    user_info = {"full_name": "Pharmacist", "username": "user", "role": "Staff"}
    if user_id:
        cur.execute("SELECT u.username, u.full_name, r.role_name FROM dbo.users u JOIN dbo.roles r ON r.role_id = u.role_id WHERE u.user_id = ?", user_id)
        u_row = cur.fetchone()
        if u_row:
            user_info = {"full_name": u_row.full_name, "username": u_row.username, "role": u_row.role_name}

    # 1. Expiry status bands
    cur.execute("""
        SELECT expiry_band, COUNT(*) AS count, SUM(qty_on_hand) AS units, SUM(stock_cost_value) AS val
        FROM dbo.v_expiry_status
        GROUP BY expiry_band
    """)
    band_rows = cur.fetchall()
    bands = {r.expiry_band: {"count": r.count, "units": r.units, "value": float(r.val)} for r in band_rows}
    
    expired_cnt = bands.get('EXPIRED', {}).get('count', 0)
    expired_units = bands.get('EXPIRED', {}).get('units', 0)
    expired_val = bands.get('EXPIRED', {}).get('value', 0.0)

    red_cnt = bands.get('RED', {}).get('count', 0)
    red_units = bands.get('RED', {}).get('units', 0)
    red_val = bands.get('RED', {}).get('value', 0.0)

    amber_cnt = bands.get('AMBER', {}).get('count', 0)
    amber_units = bands.get('AMBER', {}).get('units', 0)
    amber_val = bands.get('AMBER', {}).get('value', 0.0)

    green_cnt = bands.get('GREEN', {}).get('count', 0)
    green_units = bands.get('GREEN', {}).get('units', 0)
    green_val = bands.get('GREEN', {}).get('value', 0.0)

    near_expiry_val = round(red_val + amber_val, 2)
    total_at_risk_val = round(expired_val + red_val + amber_val, 2)

    # 2. Sales - Today & Yesterday
    cur.execute("""
        SELECT COUNT(*) AS today_bills, COALESCE(SUM(total_amount), 0) AS today_rev
        FROM dbo.v_sale_bill
        WHERE date(sale_time) = date('now')
    """)
    t_row = cur.fetchone()
    today_bills = t_row.today_bills if t_row else 0
    today_rev = float(t_row.today_rev) if t_row else 0.0

    cur.execute("""
        SELECT COUNT(*) AS yest_bills, COALESCE(SUM(total_amount), 0) AS yest_rev
        FROM dbo.v_sale_bill
        WHERE date(sale_time) = date('now', '-1 day')
    """)
    y_row = cur.fetchone()
    yest_bills = y_row.yest_bills if y_row else 0
    yest_rev = float(y_row.yest_rev) if y_row else 0.0

    if yest_rev > 0:
        sales_growth_pct = round(((today_rev - yest_rev) / yest_rev) * 100, 1)
    elif today_rev > 0:
        sales_growth_pct = 100.0
    else:
        sales_growth_pct = 0.0

    # 3. Inventory Valuation & Active Products
    cur.execute("""
        SELECT COUNT(DISTINCT medicine_id) AS active_skus,
               COUNT(*) AS total_batches,
               COALESCE(SUM(qty_on_hand), 0) AS total_units,
               COALESCE(SUM(qty_on_hand * cost_price), 0) AS total_cost_val
        FROM dbo.batches
        WHERE qty_on_hand > 0 AND status = ?
    """, 'ACTIVE')
    inv_row = cur.fetchone()
    active_skus = inv_row.active_skus if inv_row else 0
    total_batches = inv_row.total_batches if inv_row else 0
    total_units = inv_row.total_units if inv_row else 0
    inventory_val = float(inv_row.total_cost_val) if inv_row else 0.0

    # 4. Low stock & out of stock
    cur.execute("""
        SELECT COUNT(*) AS low_stock_count,
               COALESCE(SUM(CASE WHEN (SELECT COALESCE(SUM(b.qty_on_hand), 0) FROM dbo.batches b WHERE b.medicine_id = m.medicine_id AND b.status = 'ACTIVE') = 0 THEN 1 ELSE 0 END), 0) AS out_of_stock_count
        FROM dbo.medicines m
        WHERE m.is_active = 1
          AND COALESCE((SELECT SUM(b.qty_on_hand) FROM dbo.batches b WHERE b.medicine_id = m.medicine_id AND b.status = 'ACTIVE'), 0) < m.reorder_level
    """)
    stock_row = cur.fetchone()
    low_stock_count = stock_row.low_stock_count if stock_row else 0
    out_of_stock_count = stock_row.out_of_stock_count if stock_row else 0

    # 5. Inventory Health Score (0 - 100)
    # Factor A: Non-expired capital ratio (weight 40%)
    f_expired = max(0, min(100, 100 - (expired_val / max(inventory_val, 1) * 100 * 2)))
    # Factor B: Stockout resilience ratio (weight 35%)
    f_stockout = max(0, min(100, ((active_skus - low_stock_count) / max(active_skus, 1)) * 100))
    # Factor C: Critical near-expiry safety ratio (weight 25%)
    f_near_exp = max(0, min(100, 100 - (red_val / max(inventory_val, 1) * 100 * 2)))
    health_score = int(round(0.40 * f_expired + 0.35 * f_stockout + 0.25 * f_near_exp))
    health_score = max(15, min(98, health_score))

    if health_score >= 80:
        health_status = "Optimal"
        health_color = "success"
    elif health_score >= 60:
        health_status = "Attention Needed"
        health_color = "warning"
    else:
        health_status = "Critical Risk"
        health_color = "danger"

    # 6. Sales Trend (30 Days and 7 Days)
    cur.execute("""
        SELECT date(s.sale_time) AS sale_date,
               COUNT(DISTINCT s.sale_id) AS bills,
               ROUND(SUM(si.quantity * si.unit_price), 2) AS revenue
        FROM dbo.sales s
        JOIN dbo.sale_items si ON si.sale_id = s.sale_id
        WHERE date(s.sale_time) >= date('now', '-30 days')
        GROUP BY date(s.sale_time)
        ORDER BY sale_date ASC
    """)
    trend_rows = cur.fetchall()
    sales_trend_30d = [{
        "date": str(r.sale_date),
        "bills": r.bills,
        "revenue": float(r.revenue),
        "aov": round(float(r.revenue) / max(r.bills, 1), 2)
    } for r in trend_rows]
    sales_trend_7d = sales_trend_30d[-7:] if len(sales_trend_30d) >= 7 else sales_trend_30d

    rev_7d_total = sum(d["revenue"] for d in sales_trend_7d)
    bills_7d_total = sum(d["bills"] for d in sales_trend_7d)
    aov_7d = round(rev_7d_total / max(bills_7d_total, 1), 2) if bills_7d_total else 0.0

    # 7. ExpiryGuard Priority Batches (Top 8 requiring immediate action)
    cur.execute("""
        SELECT v.batch_id, v.medicine_id, v.brand_name, v.strength, v.batch_number,
               v.expiry_date, v.days_left, v.qty_on_hand, v.stock_cost_value, v.expiry_band,
               b.cost_price, b.selling_price
        FROM dbo.v_expiry_status v
        JOIN dbo.batches b ON b.batch_id = v.batch_id
        WHERE v.expiry_band IN ('EXPIRED', 'RED', 'AMBER')
        ORDER BY 
            CASE v.expiry_band 
                WHEN 'EXPIRED' THEN 1 
                WHEN 'RED' THEN 2 
                WHEN 'AMBER' THEN 3 
                ELSE 4 
            END,
            v.days_left ASC,
            v.stock_cost_value DESC
        LIMIT 8
    """)
    expiry_batches = [{
        "batch_id": r.batch_id,
        "medicine_id": r.medicine_id,
        "brand_name": r.brand_name,
        "strength": r.strength,
        "batch_number": r.batch_number,
        "expiry_date": str(r.expiry_date),
        "days_left": r.days_left,
        "qty_on_hand": r.qty_on_hand,
        "stock_cost_value": float(r.stock_cost_value),
        "expiry_band": r.expiry_band,
        "cost_price": float(r.cost_price),
        "selling_price": float(r.selling_price),
        "action": "Return / Credit" if r.expiry_band == 'EXPIRED' else ("FEFO Dispense" if r.expiry_band == 'RED' else "Monitor Shelf")
    } for r in cur.fetchall()]

    # 8. Recent Sales (Latest 6)
    cur.execute("""
        SELECT v.sale_id, v.sale_time, v.sold_by, u.full_name AS cashier_name,
               s.customer_name, v.payment_mode, v.units, v.total_amount
        FROM dbo.v_sale_bill v
        JOIN dbo.sales s ON s.sale_id = v.sale_id
        JOIN dbo.users u ON u.user_id = v.sold_by
        ORDER BY v.sale_id DESC
        LIMIT 6
    """)
    recent_sales = [{
        "sale_id": r.sale_id,
        "sale_time": str(r.sale_time),
        "cashier_name": r.cashier_name,
        "customer_name": r.customer_name or "Walk-in Patient",
        "payment_mode": r.payment_mode,
        "units": r.units,
        "total_amount": float(r.total_amount)
    } for r in cur.fetchall()]

    # 9. Recent GRN (Latest 4)
    cur.execute("""
        SELECT g.grn_id, g.supplier_id, s.supplier_name, g.invoice_number, g.invoice_date,
               g.received_at, u.full_name AS received_by_name,
               (SELECT COUNT(*) FROM dbo.batches b WHERE b.grn_id = g.grn_id) AS batch_count,
               (SELECT COALESCE(SUM(b.qty_received), 0) FROM dbo.batches b WHERE b.grn_id = g.grn_id) AS total_units
        FROM dbo.grn g
        JOIN dbo.suppliers s ON s.supplier_id = g.supplier_id
        JOIN dbo.users u ON u.user_id = g.received_by
        ORDER BY g.grn_id DESC
        LIMIT 4
    """)
    recent_grn = [{
        "grn_id": r.grn_id,
        "supplier_name": r.supplier_name,
        "invoice_number": r.invoice_number,
        "invoice_date": str(r.invoice_date),
        "received_at": str(r.received_at),
        "received_by_name": r.received_by_name,
        "batch_count": r.batch_count,
        "total_units": r.total_units
    } for r in cur.fetchall()]

    # 10. Smart Operational Action Alerts
    smart_alerts = []
    if expired_cnt > 0:
        smart_alerts.append({
            "type": "danger",
            "icon": "alert-octagon",
            "title": f"{expired_cnt} Expired Lots Requiring Quarantine",
            "message": f"{expired_units:,} units (₹{expired_val:,.2f} acquisition cost) have elapsed expiration. Quarantine immediately and initiate supplier credit return.",
            "cta_text": "Initiate Supplier Return",
            "cta_url": "/returns-page"
        })
    if red_cnt > 0:
        smart_alerts.append({
            "type": "warning",
            "icon": "clock",
            "title": f"{red_cnt} Batches in Critical Expiry Band (≤30 Days)",
            "message": f"{red_units:,} units (₹{red_val:,.2f}) at imminent risk. Prioritize via FEFO cashier console or clearance adjustment.",
            "cta_text": "Dispense via FEFO POS",
            "cta_url": "/billing-page"
        })
    if low_stock_count > 0:
        smart_alerts.append({
            "type": "info",
            "icon": "package-x",
            "title": f"{low_stock_count} Medicines Below Safety Reorder Threshold",
            "message": f"{out_of_stock_count} items are completely out of stock. Create supplier procurement order to prevent patient dispensing turnaways.",
            "cta_text": "Receive Stock (GRN)",
            "cta_url": "/grn-page"
        })

    notification_count = len(smart_alerts)

    return {
        "user_info": user_info,
        "kpi_today_sales": {
            "today_rev": today_rev,
            "today_bills": today_bills,
            "yesterday_rev": yest_rev,
            "yesterday_bills": yest_bills,
            "sales_growth_pct": sales_growth_pct
        },
        "kpi_inventory": {
            "total_val": inventory_val,
            "active_skus": active_skus,
            "total_batches": total_batches,
            "total_units": total_units
        },
        "kpi_low_stock": {
            "low_stock_count": low_stock_count,
            "out_of_stock_count": out_of_stock_count
        },
        "kpi_expiry": {
            "expired_count": expired_cnt,
            "expired_val": expired_val,
            "expired_units": expired_units,
            "red_count": red_cnt,
            "red_val": red_val,
            "red_units": red_units,
            "amber_count": amber_cnt,
            "amber_val": amber_val,
            "amber_units": amber_units,
            "green_count": green_cnt,
            "green_val": green_val,
            "green_units": green_units,
            "near_expiry_val": near_expiry_val,
            "total_at_risk_val": total_at_risk_val,
            "bands": bands
        },
        "kpi_health": {
            "score": health_score,
            "status": health_status,
            "color": health_color,
            "factors": {
                "f_expired": round(f_expired, 1),
                "f_stockout": round(f_stockout, 1),
                "f_near_exp": round(f_near_exp, 1)
            }
        },
        "sales_trend_7d": sales_trend_7d,
        "sales_trend_30d": sales_trend_30d,
        "revenue_7d_total": rev_7d_total,
        "bills_7d_total": bills_7d_total,
        "aov_7d": aov_7d,
        "expiry_batches": expiry_batches,
        "recent_sales": recent_sales,
        "recent_grn": recent_grn,
        "smart_alerts": smart_alerts,
        "notification_count": notification_count,
        "last_updated": datetime.now().strftime("%I:%M %p")
    }

@router.get("/", response_class=HTMLResponse)
def index(request: Request):
    token = request.cookies.get("access_token")
    if token:
        return RedirectResponse("/dashboard", status_code=303)
    return templates.TemplateResponse(request=request, name="login.html")

@router.get("/login", response_class=HTMLResponse)
def login_page(request: Request):
    return templates.TemplateResponse(request=request, name="login.html")

@router.get("/api/dashboard/summary")
def dashboard_summary_api(user=Depends(current_user), conn=Depends(db)):
    data = get_dashboard_summary_data(conn, user["id"])
    return JSONResponse(data)

@router.get("/dashboard", response_class=HTMLResponse)
def dashboard_page(request: Request, user=Depends(current_user), conn=Depends(db)):
    data = get_dashboard_summary_data(conn, user["id"])
    return templates.TemplateResponse(
        request=request,
        name="dashboard.html",
        context={
            "user": user,
            "dashboard": data,
            "user_info": data["user_info"],
            "today_date": date.today().strftime("%A, %d %B %Y"),
            "bands": data["kpi_expiry"]["bands"],
            "today_bills": data["kpi_today_sales"]["today_bills"],
            "today_rev": data["kpi_today_sales"]["today_rev"],
            "low_stock_count": data["kpi_low_stock"]["low_stock_count"]
        }
    )

@router.get("/medicines-page", response_class=HTMLResponse)
def medicines_page(request: Request, user=Depends(current_user)):
    return templates.TemplateResponse(request=request, name="medicines.html", context={"user": user})

@router.get("/grn-page", response_class=HTMLResponse)
def grn_page(request: Request, user=Depends(current_user)):
    return templates.TemplateResponse(request=request, name="grn.html", context={"user": user, "today": str(date.today())})

@router.get("/billing-page", response_class=HTMLResponse)
def billing_page(request: Request, user=Depends(current_user)):
    return templates.TemplateResponse(request=request, name="billing.html", context={"user": user})

@router.get("/alerts-page", response_class=HTMLResponse)
def alerts_page(request: Request, user=Depends(current_user)):
    return templates.TemplateResponse(request=request, name="alerts.html", context={"user": user})

@router.get("/returns-page", response_class=HTMLResponse)
def returns_page(request: Request, user=Depends(current_user)):
    return templates.TemplateResponse(request=request, name="returns.html", context={"user": user})

@router.get("/audit-page", response_class=HTMLResponse)
def audit_page(request: Request, user=Depends(current_user)):
    return templates.TemplateResponse(request=request, name="audit.html", context={"user": user})

@router.get("/users-page", response_class=HTMLResponse)
def users_page(request: Request, user=Depends(current_user)):
    return templates.TemplateResponse(request=request, name="users.html", context={"user": user})

@router.get("/reports-page", response_class=HTMLResponse)
def reports_page(request: Request, user=Depends(current_user)):
    return templates.TemplateResponse(request=request, name="reports.html", context={"user": user})
