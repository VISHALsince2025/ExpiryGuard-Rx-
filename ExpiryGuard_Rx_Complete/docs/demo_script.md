# ExpiryGuard Rx: 8–10 Minute Master Demonstration Script

This script provides an exact, step-by-step walkthrough for faculty reviews, design evaluations, and viva defense sessions.

---

## Pre-Demo Warm-Up Routine (15 Minutes Before)
1. **Wake Up Database & Compute**: Open the application URL and log in once. If Azure Serverless SQL or App Service was idle, this completes the initial cold start.
2. **Open Cloud Resource Tabs**: Keep Azure Portal tabs open for Azure SQL Database overview, Blob Storage container (`invoices`), and Cosmos DB Data Explorer.
3. **Open Dual Browsers**: Open two browser windows (one standard and one private/incognito) to allow instantaneous switching between `pharmacist1` and `counter1` without re-logging.
4. **Power BI Ready**: Open Power BI Desktop report or navigate to `/reports-page` on the web console.

---

## Demonstration Script

### Step 1: The Problem & Unique Angle (30 Seconds)
- *"Good morning, respected examiners. Retail pharmacies incur significant losses each year due to expired stock, and dispensing an expired drug can be life-threatening. ExpiryGuard Rx solves this problem at the root through batch-level tracking, deterministic First Expiry, First Out (FEFO) dispensing, and predictive expiry risk forecasting."*

### Step 2: Architecture & Data Shapes (30 Seconds)
- *"Our architecture aligns with Microsoft DP-900 cloud data patterns across three fundamental data shapes:*
  1. *Structured Relational Data:* Users, medicines, batches, transactions, and audit logs live in **Azure SQL Database** enforcing ACID constraints.
  2. *Semi-Structured Data:* Distributor invoices and forecast run summaries live in **Azure Cosmos DB** as flexible JSON documents partitioned by `supplier_id`.
  3. *Unstructured Files:* Scanned supplier invoice PDFs/images reside in private **Azure Blob Storage**, accessed only via 5-minute SAS temporary links."*

### Step 3: Zero-Trust RBAC in Action (60 Seconds)
- Log in using username `counter1` and password `Counter@123456`.
- Demonstrate accessing the point-of-sale console (`/billing-page`).
- Attempt to navigate directly to `/users-page` or `/grn-page`.
- Point out: The browser receives HTTP **403 Forbidden**.
- Explain: *"Role-Based Access Control is enforced on the server via FastAPI dependency injection (`require_roles`), not just by hiding UI buttons. A cashier cannot alter user roles or inward unverified deliveries."*

### Step 4: Stock Receiving (GRN) & Multi-Cloud Upload (90 Seconds)
- In the second browser window, log in as `pharmacist1`.
- Navigate to **Receive Stock (GRN)** (`/grn-page`).
- Select wholesaler: *Varanasi Pharma Wholesalers*.
- Enter invoice: `INV-2026-DEMO`, Date: today.
- Add two batches for the same medicine (e.g. *Dolo 650*):
  - Lot 1: `DEMO-LOT-EARLY` &bull; Expiry: 30 days ahead &bull; Qty: 20 &bull; Cost: ₹15 &bull; MRP: ₹25
  - Lot 2: `DEMO-LOT-LATE` &bull; Expiry: 180 days ahead &bull; Qty: 50 &bull; Cost: ₹15 &bull; MRP: ₹25
- Click **Submit Stock Received**. Both lots and the GRN header commit in a single atomic SQL transaction.
- In the upload modal, select a dummy invoice scan and click **Upload Scan**.
- Open the resulting temporary SAS link: *"Notice this link is valid for exactly 5 minutes; the blob container itself is completely private with anonymous access disabled."*
- Briefly show Cosmos DB Data Explorer displaying the structured JSON document for this invoice.

### Step 5: FEFO Point-of-Sale Dispensing & Concurrency (90 Seconds)
- Switch back to `counter1` browser.
- Open **Point of Sale** (`/billing-page`).
- Search *Dolo 650*. Enter quantity **30** (which spans both received batches).
- Click **Dispense & Generate Bill (FEFO)**.
- Display the completed bill modal:
  - Point out that the system automatically allocated all **20 units from `DEMO-LOT-EARLY` first**, and the remaining **10 units from `DEMO-LOT-LATE`**.
- Now attempt to sell **500 units** of an item with only 40 units in stock.
- Click dispense: System immediately raises **409 Conflict ("Insufficient unexpired stock")**.
- Emphasize: *"The entire transaction rolls back atomically. Stock remains untouched, and our database CHECK constraints guarantee stock can never drop below zero."*

### Step 6: Expiry Action Board & Supplier Return Workflow (60 Seconds)
- Open **Expiry Alerts** (`/alerts-page`).
- Show color bands: `EXPIRED`, `RED` ($\le$30d), `AMBER` ($\le$90d), and `GREEN`.
- Point out the **Predicted Daily Units** and **Units at Risk** computed by our exponential smoothing forecast.
- Click **Return** on a near-expiry batch: Raise a return for 10 units.
- Show that the return status is **PENDING** and stock on hand has NOT been reduced yet.
- In `pharmacist1` window, navigate to **Returns** (`/returns-page`) and click **Approve (Deduct Stock)**.
- Emphasize: *"The stock is deducted only upon pharmacist approval inside stored procedure `usp_approve_return`."*
- Purchase officer then records the supplier credit note number.

### Step 7: Compliance Audit Trail (60 Seconds)
- Navigate to **Audit Log** (`/audit-page`).
- Show the chronological event trail showing `LOGIN_OK`, `GRN_CREATED`, `BATCH_UPDATE`, `SALE_CREATED`, and `RETURN_APPROVED` with exact user attribution and timestamps.
- Highlight security rule: *"The audit log is strictly append-only. The application database user has an explicit `DENY UPDATE, DELETE ON dbo.audit_log` rule."*

### Step 8: Cloud Security & Defense-in-Depth (60 Seconds)
- In login, enter SQL injection string `admin' OR '1'='1` with dummy password. Show immediate rejection (401).
- Show browser Network tab developer tools highlighting security headers:
  - `Content-Security-Policy: default-src 'self' ...`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security: max-age=31536000`
- Explain firewall rules: Azure SQL Database allows only App Service outbound IPs.

### Step 9: Analytics & 9 Power BI KPIs (60 Seconds)
- Open the **Power BI Dashboard** (or navigate to `/reports-page`).
- Walk through the 9 KPIs:
  - KPI 1: Expiry loss in rupees by month
  - KPI 2: Near-expiry stock capital in RED + AMBER bands
  - KPI 4 & 5: Fast movers vs slow movers (tied-up dead capital)
  - KPI 7: Supplier return acceptance and credit note recovery
  - KPI 8: Urgent reorder shortage list
- Emphasize: *"Every single visual includes a 'so what' decision-support rationale explaining what action the pharmacy manager takes next."*

### Step 10: Conclusion & Invitation for Questions (30 Seconds)
- *"In summary, ExpiryGuard Rx provides a comprehensive, production-grade inventory prevention system backed by Azure relational and non-relational services, rigorous FEFO concurrency control, and predictive analytics. Thank you, and I invite your questions."*
