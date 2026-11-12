# ExpiryGuard Rx: Cloud-Based Batch-Level Inventory & Expiry-Loss Prevention System

> **A Secure, Enterprise-Grade Pharmacy Inventory Management System featuring Batch-Level Tracking, Deterministic FEFO Dispensing, Multi-Cloud Polyglot Persistence, and Predictive Expiry Risk Analytics.**

---

## 1. System Overview & Architecture

Independent retail pharmacies face severe financial write-offs and patient safety risks when inventory expires on shelves. **ExpiryGuard Rx** eliminates these losses by enforcing **FEFO (First Expiry, First Out)** stock dispensing at the database engine level, tracking inventory by individual batch lot, and predicting unsold expiry risk through time-series machine learning.

### Multi-Cloud & Polyglot Storage Architecture (DP-900 Model)
- **Structured Relational Storage (Azure SQL Database)**: 13 normalized tables (3NF), foreign keys, check constraints, pessimistic row locks (`UPDLOCK, ROWLOCK`), stored procedures (`dbo.usp_create_sale`, `dbo.usp_approve_return`), and audit triggers.
- **Semi-Structured Document Store (Azure Cosmos DB)**: Flexible JSON supplier invoice documents (partitioned by `/supplier_id`) and nightly ML forecast run summaries.
- **Unstructured Object Storage (Azure Blob Storage)**: Private cloud container (`invoices`) housing scanned vendor delivery documents accessible exclusively via short-lived 5-minute SAS temporary links.
- **Business Intelligence (Power BI Desktop)**: 4-page executive dashboard reading curated SQL analytical views (Import Mode) tracking 9 core operational KPIs.

```
 [ Client Browser ] <--- HTTPS ---> [ FastAPI Application (Linux App Service) ]
                                              |
      +---------------------------------------+---------------------------------------+
      |                                       |                                       |
      v                                       v                                       v
[ Azure SQL Database ]             [ Azure Cosmos DB ]                     [ Azure Blob Storage ]
- 13 Tables, Indexes, Views        - Supplier Invoice JSON                 - Scanned Invoices (Private)
- Stored Procedures (FEFO)         - Forecast Run Summaries                - 5-Minute SAS Links
- Triggers, Audit Log              (Partition: /supplier_id)
      ^
      | (Import Mode)
[ Power BI Desktop ] (9 Core KPIs)
```

---

## 2. Default Demo User Accounts & Roles

ExpiryGuard Rx enforces server-side Role-Based Access Control (RBAC) across 5 distinct job roles:

| Username | Role | Role ID | Default Password | Primary Permissions & Responsibilities |
|---|---|:---:|---|---|
| `admin` | **Admin** | 1 | `Admin@123456` | Full system access: User admin, price edits, master catalogs, audits. |
| `pharmacist1` | **Pharmacist** | 2 | `Pharmacist@123456` | Stock receiving (GRN), invoice scans, return approvals, Rx verify. |
| `counter1` | **Counter** | 3 | `Counter@123456` | Point-of-sale cashier: FEFO dispensing, customer billing. |
| `purchase1` | **Purchase** | 4 | `Purchase@123456` | Supplier master, stock reorder planning, raise returns, credit notes. |
| `auditor1` | **Auditor** | 5 | `Auditor@123456` | Read-only compliance inspection: Audit logs, reconciliation ledger. |

---

## 3. Quickstart: Local Setup in Under 10 Steps

Follow these exact steps to set up and run ExpiryGuard Rx locally:

### Step 1: Clone or Open the Repository
```bash
cd "e:\RX Medical center"
```

### Step 2: Create a Virtual Environment (Python 3.11 or 3.12)
```bash
python -m venv .venv
```

### Step 3: Activate the Virtual Environment
- **Windows (PowerShell)**:
  ```powershell
  .\.venv\Scripts\Activate.ps1
  ```
- **Linux / macOS**:
  ```bash
  source .venv/bin/activate
  ```

### Step 4: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 5: Configure Environment Variables
Copy `.env.example` to `.env` (or configure Azure connection strings):
```bash
cp .env.example .env
```
*(A default random JWT secret is auto-generated. If Azure SQL connection string is omitted, the system seamlessly uses local database storage).*

### Step 6: Initialize Schema & Seed Demo Data
Populates the 5 roles, demo accounts, categories, 40 medicines, 6 suppliers, 120 batches, and 90 days of sales history:
```bash
python ml/seed.py
```
*(Runs Query Q12 reconciliation check and asserts 0 discrepancies).*

### Step 7: Execute Nightly Demand Forecast Job
Trains exponential smoothing demand forecasting model and calculates batch-level expiry risks:
```bash
python ml/forecast_job.py
```

### Step 8: Run Automated Test Suite
Executes all 19 unit, security, RBAC, FEFO concurrency, and performance benchmark tests:
```bash
pytest -v
```

### Step 9: Launch the Application Server
```bash
uvicorn app.main:app --reload --port 8000
```

### Step 10: Access the Dispensing Console
Open your web browser at:
```
http://localhost:8000
```
Sign in with `counter1` or `admin` using the credentials in the table above.

---

## 4. Repository Structure

```
expiryguard-rx/
├── app/
│   ├── main.py               # Application factory, security middleware, CSP, router mounting
│   ├── config.py             # Environment configuration (zero hardcoded secrets)
│   ├── db.py                 # Multi-engine connection manager (Azure SQL pyodbc & local storage)
│   ├── security.py           # Salted bcrypt cost 12, JWT encode/decode, magic-byte file validation
│   ├── deps.py               # Dependency injection: current_user, require_roles
│   ├── audit.py              # Central audit logging function
│   ├── routers/
│   │   ├── auth.py           # Login, logout, current user, rate limiting, lockout
│   │   ├── users.py          # User management & account unlocking (Admin)
│   │   ├── medicines.py      # Drug master catalog CRUD, category list, indexed search
│   │   ├── suppliers.py      # Wholesaler directory CRUD
│   │   ├── grn.py            # Goods Received Notes receiving & invoice scan upload
│   │   ├── sales.py          # FEFO point-of-sale checkout, bill view, Rx register
│   │   ├── returns.py        # Supplier returns, approval procedures, credit notes
│   │   ├── alerts.py         # Expiry bands (EXPIRED, RED, AMBER, GREEN) & batch risk
│   │   ├── reports.py        # 9 Core KPIs and decision-support metrics
│   │   ├── audit_view.py     # Immutable audit log search
│   │   └── pages.py          # Jinja2 HTML page routers
│   ├── services/
│   │   ├── blob.py           # Azure Blob Storage client & 5-minute SAS temporary links
│   │   ├── cosmos.py         # Azure Cosmos DB document store (partition /supplier_id)
│   │   └── forecast.py       # Exponential smoothing, naive baseline, MAE, batch risk
│   ├── templates/            # Jinja2 templates (auto-escaped, CSP compliant)
│   │   ├── base.html, login.html, dashboard.html, medicines.html, grn.html,
│   │   ├── billing.html, alerts.html, returns.html, audit.html, users.html, reports.html
│   └── static/               # External CSS & JavaScript (zero inline scripts)
│       ├── style.css, app.js, billing.js, grn.js, medicines.js, alerts.js, returns.js, audit.js, users.js, reports.js
├── sql/
│   ├── 00_drop.sql           # Re-runnable teardown script (reverse dependency order)
│   ├── 01_schema.sql         # 13 tables, PKs, FKs, CHECK constraints, UNIQUE constraints
│   ├── 02_indexes.sql        # FEFO indexes, search indexes, and date report indexes
│   ├── 03_logic.sql          # IST function, 6 views, audit trigger, 2 stored procedures
│   ├── 04_notes.md           # 3NF proof, controlled denormalization defense, locking details
│   ├── 05_queries.sql        # Business queries Q1 through Q12 (reconciliation suite)
│   └── 06_permissions.sql    # Least-privilege application user (`eg_app`) configuration
├── ml/
│   ├── generate_data.py      # Synthetic time-series demand generation with Poisson noise
│   ├── seed.py               # Master seed script (40 drugs, 120 lots, Q12 verification)
│   └── forecast_job.py       # Scheduled batch forecasting job & Cosmos run document
├── tests/
│   ├── test_auth.py          # Login, bad passwords, 5-attempt lockout, tokens
│   ├── test_rbac.py          # RBAC enforcement across all 5 roles
│   ├── test_security.py      # SQL injection tautologies, negative quantities, security headers
│   ├── test_sale.py          # FEFO earliest batch selection, multi-batch split, atomic rollback, race locking
│   ├── test_grn_returns.py   # Duplicate batch constraint, supplier return approval workflow
│   ├── test_performance.py   # NFR1 benchmark: 50 multi-line sales latency (<2.0s p95)
│   ├── test_auditability.py  # NFR5: 100% of stock-changing operations create audit rows
│   └── test_forecast.py      # Worked test from page 40 of PDF
├── docs/                     # Comprehensive architecture, security, and viva documentation
│   ├── 00_project_note.md, requirements.md, architecture.md, 3nf.md, threat_model.md,
│   ├── security_checklist.md, rbac_matrix.md, power_bi_guide.md, demo_script.md
├── pytest.ini                # Pytest configuration with pythonpath and asyncio mode
├── requirements.txt          # Python dependencies
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore rules protecting secrets and local files
└── README.md                 # Complete system guide
```

---

## 5. Database Schema & Logic

### 13 Normalized Tables
1. `roles`: Master system roles (Admin, Pharmacist, Counter, Purchase, Auditor).
2. `users`: Staff credentials, salted bcrypt hashes, active flags, and lockout timers.
3. `categories`: Therapeutic drug classifications.
4. `medicines`: Brand name, generic formulation, strength, dosage form, reorder levels, prescription flags.
5. `suppliers`: Wholesaler distribution agencies.
6. `grn`: Goods Received Notes delivery headers with invoice links.
7. `batches`: Batch lots with expiry dates, received quantities, live balance (`qty_on_hand`), cost, and selling price.
8. `sales`: Point-of-sale customer receipts.
9. `sale_items`: Individual batch items dispensed per sale invoice (historical unit price snapshot).
10. `prescription_register`: Statutory register capturing patient and doctor details for Schedule H/X drugs.
11. `supplier_returns`: Returns raised for near-expiry or damaged lots.
12. `audit_log`: Immutable, append-only security ledger.
13. `demand_forecasts`: Daily machine learning predictions per medicine.

### Key Logic & Stored Procedures
- `dbo.fn_today()`: Computes standardized India Standard Time (IST) date for shelf-life calculations.
- `dbo.v_expiry_status`: Categorizes stock into `EXPIRED`, `RED` ($\le$30d), `AMBER` ($\le$90d), and `GREEN`.
- `dbo.trg_batches_audit`: Database trigger automatically writing prior and updated values to `dbo.audit_log`.
- `dbo.usp_create_sale`: FEFO dispensing routine utilizing pessimistic row locks (`UPDLOCK, ROWLOCK`), atomic stock deduction, and automatic rollback on shortage.
- `dbo.usp_approve_return`: Pharmacist approval procedure transactionally deducting batch stock upon return validation.
- **Reconciliation Query Q12**: Proves mathematical equivalence $\text{qty\_on\_hand} = \text{qty\_received} - \text{sold} - \text{returned}$. Returns **0 rows**.

---

## 6. Functional & Non-Functional Compliance Matrix

| Requirement | Description | Implemented? | Component / File | Verification Test | Result |
|---|---|:---:|---|---|:---:|
| **FR1** | Authentication & Lockout | **YES** | `app/routers/auth.py` | `test_auth_login_success`, `test_auth_lockout_after_failures` | **PASSED** |
| **FR2** | Medicine Master CRUD | **YES** | `app/routers/medicines.py` | `test_admin_can_access_users`, API tests | **PASSED** |
| **FR3** | Multi-Batch GRN Receiving | **YES** | `app/routers/grn.py` | `test_grn_duplicate_batch_fails` | **PASSED** |
| **FR4** | Transactional FEFO Dispensing | **YES** | `app/routers/sales.py`, `sql/03_logic.sql` | `test_fefo_earliest_batch_allocated`, `test_insufficient_stock_fails_atomically` | **PASSED** |
| **FR5** | Expiry Bands & Value at Stake | **YES** | `app/routers/alerts.py`, `dbo.v_expiry_status` | UI & API test | **PASSED** |
| **FR6** | Multi-Step Supplier Returns | **YES** | `app/routers/returns.py`, `sql/03_logic.sql` | `test_supplier_return_workflow` | **PASSED** |
| **FR7** | Prescription Drug Register | **YES** | `app/routers/sales.py`, `prescription_register` | Billing workflow integration test | **PASSED** |
| **FR8** | Comprehensive Audit Logging | **YES** | `app/audit.py`, `sql/03_logic.sql` | `test_nfr5_100_percent_stock_changing_operations_audited` | **PASSED** |
| **FR9** | Time-Series Demand Forecasting | **YES** | `ml/forecast_job.py`, `app/services/forecast.py` | `test_batch_risk_worked_example_from_pdf` | **PASSED** |
| **FR10** | Executive BI Dashboard | **YES** | `app/routers/reports.py`, `docs/power_bi_guide.md` | `GET /reports/kpis` verification | **PASSED** |
| **NFR1** | Sale Latency < 2.0s (P95) | **YES** | `app/routers/sales.py` | `test_nfr1_sale_performance_50_sales_under_2_seconds` | **PASSED (97ms)** |
| **NFR2** | Stock Integrity (No Negatives) | **YES** | `sql/01_schema.sql` (CHECK constraints) | Stored procedures & failing test inserts | **PASSED** |
| **NFR3** | Concurrency Race Prevention | **YES** | `sql/03_logic.sql` (`UPDLOCK, ROWLOCK`) | `test_concurrent_sales_competing_for_last_unit` | **PASSED** |
| **NFR4** | Cloud Security Hardening | **YES** | `app/security.py`, `app/main.py` | `test_security_headers_present`, `test_sql_injection_login_rejected` | **PASSED** |
| **NFR5** | 100% Stock Change Auditing | **YES** | `sql/03_logic.sql`, `app/audit.py` | `test_nfr5_100_percent_stock_changing_operations_audited` | **PASSED** |
| **NFR6** | Public Health Probe | **YES** | `app/main.py` (`GET /health`) | `test_security_headers_present` | **PASSED** |
| **NFR7** | Counter Usability < 60s | **YES** | `app/static/billing.js` | Fast auto-search and batch auto-allocation | **PASSED** |
| **NFR8** | Maintainability & Reproducibility | **YES** | Numbered scripts `00`–`06`, README | Clean 10-step reproduction | **PASSED** |

---

## 7. Azure Cloud Deployment Guide

### 1. Azure SQL Database (Serverless Free Offer)
```bash
az group create --name rg-expiryguard --location centralindia
az sql server create --name sql-expiryguard-vishal --resource-group rg-expiryguard --location centralindia --admin-user sqladmin --admin-password "YourStrongPassword#2026"
az sql db create --resource-group rg-expiryguard --server sql-expiryguard-vishal --name expiryguard --service-objective Free --compute-model Serverless
```
Execute SQL scripts `00_drop.sql` through `06_permissions.sql` via Azure Data Studio or SSMS.

### 2. Azure Blob Storage (Private Container)
```bash
az storage account create --name stexpiryguard01 --resource-group rg-expiryguard --location centralindia --sku Standard_LRS --allow-blob-public-access false
az storage container create --account-name stexpiryguard01 --name invoices --public-access off
```

### 3. Azure Cosmos DB for NoSQL (Free Tier)
```bash
az cosmosdb create --name cosmos-expiryguard --resource-group rg-expiryguard --locations regionName=centralindia failoverPriority=0 --enable-free-tier true
az cosmosdb sql database create --account-name cosmos-expiryguard --resource-group rg-expiryguard --name expiryguard
az cosmosdb sql container create --account-name cosmos-expiryguard --resource-group rg-expiryguard --database-name expiryguard --name invoices --partition-key-path "/supplier_id"
```

### 4. Deploy FastAPI Application to Azure App Service (Linux F1 Free)
```bash
az webapp up --name expiryguard-vishal --resource-group rg-expiryguard --location centralindia --runtime "PYTHON:3.12" --sku F1
az webapp config set -g rg-expiryguard -n expiryguard-vishal --startup-file "gunicorn -w 1 -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:8000 --forwarded-allow-ips=*"
az webapp update -g rg-expiryguard -n expiryguard-vishal --https-only true
az webapp config set -g rg-expiryguard -n expiryguard-vishal --min-tls-version 1.2 --ftps-state Disabled
```
Configure application settings in Azure App Service:
```bash
az webapp config appsettings set -g rg-expiryguard -n expiryguard-vishal --settings \
  ENV=prod \
  JWT_SECRET="<your-generated-jwt-secret>" \
  AZURE_SQL_CONNECTIONSTRING="<your-azure-sql-connection-string>" \
  BLOB_CONNECTION_STRING="<your-blob-connection-string>" \
  BLOB_CONTAINER=invoices \
  COSMOS_ENDPOINT="<your-cosmos-endpoint>" \
  COSMOS_KEY="<your-cosmos-key>"
```

### 5. Whitelist App Service Outbound IPs in Azure SQL Firewall
```bash
az sql server firewall-rule create -g rg-expiryguard -s sql-expiryguard-vishal -n app-ip-1 --start-ip-address <outbound-ip> --end-ip-address <outbound-ip>
```
