# Power BI Business Intelligence & Analytics Specification

## 1. Data Connection Architecture

Power BI connects directly to the Azure SQL Database in **Import Mode** utilizing least-privilege application credentials (`eg_app`) or a dedicated read-only analytics login. Power BI reads exclusively from prepared database views to separate heavy analytical queries from the transactional write path.

- **Server**: `<your-server-name>.database.windows.net`
- **Database**: `expiryguard`
- **Data Connectivity Mode**: `Import`
- **Authentication**: `Database (SQL Authentication)` with least-privilege user `eg_app`

---

## 2. Prepared Analytical Views (Import Set)

Power BI loads exclusively the following curated SQL views:
1. `dbo.v_expiry_status`: Live inventory categorized into `EXPIRED`, `RED`, `AMBER`, and `GREEN` bands with cost value.
2. `dbo.v_sale_bill`: Bill-level transaction summaries including timestamp, cashier, payment mode, total units, and gross revenue.
3. `dbo.v_sales_daily`: Daily unit volume and sales revenue per medicine.
4. `dbo.v_expiry_loss_monthly`: Monthly unsold expired quantities and write-off financial losses.
5. `dbo.v_supplier_returns`: Wholesaler return records with return reasons, approval statuses, and credit note amounts.
6. `dbo.v_forecast_latest`: Most recent machine learning demand forecast outputs per pharmaceutical line.

---

## 3. The 9 Core KPIs & Decision-Support Mappings

| # | Key Performance Indicator (KPI) | Recommended Visual | Data Source | Decision Supported ("So What?") |
|---|---|---|---|---|
| **1** | **Monthly Expiry Loss in Rupees** | Column Chart | `v_expiry_loss_monthly` | Are we over-purchasing? Pinpoints worst write-off months to adjust distributor order sizes. |
| **2** | **Near-Expiry Stock Capital (RED + AMBER)** | Card + Stacked Bar by Band | `v_expiry_status` (`stock_cost_value`) | How much capital is immediately at risk? Flags lots requiring rapid FEFO sales, discounts, or vendor returns. |
| **3** | **Units & Rupees at Risk from ML Forecast** | Table with Data Bars | `v_expiry_status` + `v_forecast_latest` | Which lots will fail to sell before expiration? Identifies the exact batches to return today. |
| **4** | **Top 10 Fast Movers (30 Days)** | Horizontal Bar Chart | `v_sales_daily` | High-turnover lines requiring continuous replenishment to avoid stock-outs. |
| **5** | **Slow Movers (Dead Capital)** | Matrix / Table | `v_expiry_status` $\bowtie$ `v_sales_daily` | Stagnant stock with high capital and zero sales; signals items to stop reordering immediately. |
| **6** | **Daily Sales Revenue Trend** | Line Chart | `v_sales_daily` | Day-of-week sales rhythm for staffing allocation and cash reconciliation. |
| **7** | **Supplier Return Rate & Credit Received** | Clustered Bar by Vendor | `v_supplier_returns` | Benchmarks distributor accountability; reveals uncooperative wholesalers to terminate. |
| **8** | **Stock Below Safety Reorder Level** | Table with Red Alerts | Query Q4 / `medicines` $\bowtie$ `batches` | Immediate purchase orders to place today to maintain dispensing continuity. |
| **9** | **Sales by Cashier & Payment Mode** | Donut + Stacked Bar | `v_sale_bill` + `users` | Terminal volume, cashier performance review, and digital (UPI/Card) vs cash audit. |

---

## 4. Four-Page Dashboard Layout Structure

### Page 1: Executive Overview
- **Header**: ExpiryGuard Rx &mdash; Executive Pharmacy Health
- **Top Row KPI Cards**:
  - Near-Expiry Capital at Risk (KPI 2)
  - Projected Unsold Units at Risk (KPI 3)
  - 30-Day Daily Sales Velocity (KPI 6)
  - Critical Reorder Shortages Count (KPI 8)
- **Central Visual**: Donut Chart showing stock distribution across `EXPIRED`, `RED`, `AMBER`, and `GREEN` bands.
- **Footnote**: *"Decision Supported: Provides pharmacy owners with an instant diagnostic of capital at risk and urgent procurement priorities."*

### Page 2: Expiry & Shelf-Life Risk
- **Visual 1**: Column chart of Monthly Expiry Write-Offs in Rupees (KPI 1).
- **Visual 2**: Detailed Batch Risk Table showing Batch #, Days Left, Stock Qty, Forecasted Daily Demand, and Predicted Rupee Loss (KPI 3).
- **Slicer**: Dropdown filter for Medicine Category (Antibiotics, Analgesics, etc.).
- **Footnote**: *"Decision Supported: Guides pharmacists on which near-expiry lots to return to distributors before the credit return window lapses."*

### Page 3: Sales Velocity & Inventory Turnover
- **Visual 1**: Top 10 Fast Movers (KPI 4).
- **Visual 2**: Slow Movers with Tied-Up Capital (KPI 5).
- **Visual 3**: 30-Day Daily Revenue Trend Line (KPI 6).
- **Visual 4**: Sales by Cashier Terminal & Payment Mode (KPI 9).
- **Footnote**: *"Decision Supported: Optimizes purchasing budgets toward high-velocity drugs and eliminates capital locks in dead inventory."*

### Page 4: Distributor & Wholesaler Accountability
- **Visual 1**: Units Returned vs. Credit Notes Received by Supplier (KPI 7).
- **Visual 2**: Table of Outstanding Pending Returns.
- **Footnote**: *"Decision Supported: Measures vendor return acceptance and credit note recovery to strengthen procurement contract negotiations."*

---

## 5. In-App Web Fallback
To safeguard examination and viva evaluations in situations where Power BI Desktop is unavailable on demo day, ExpiryGuard Rx provides an identical real-time reporting console at `/reports-page` (consuming `GET /reports/kpis`), computing these exact metrics directly from the SQL views.
