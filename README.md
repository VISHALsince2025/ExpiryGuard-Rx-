# ExpiryGuard Rx

**Cloud-Based Batch-Level Pharmacy Inventory Management & Expiry-Loss Prevention System**

ExpiryGuard Rx is a pharmacy inventory management system built with Python and FastAPI. It focuses on batch-level stock tracking, FEFO-based medicine dispensing, expiry risk monitoring, supplier management, transaction auditing, and machine-learning-based demand forecasting.

---

## 1. Project Overview

Independent pharmacies face financial losses and patient safety risks due to medicines expiring before they are sold.

**ExpiryGuard Rx** aims to address these challenges through automated inventory management, batch-level tracking, expiry monitoring, and predictive analytics.

### Key Features

- **Batch-Level Inventory Management:** Tracks individual medicine batches, quantities, costs, and expiry dates.
- **FEFO Dispensing:** First Expiry, First Out logic prioritizes batches with the earliest expiry dates.
- **Expiry Risk Detection:** Categorizes inventory into EXPIRED, RED, AMBER, and GREEN risk bands.
- **Medicine Management:** Supports medicine catalog management, search, and stock monitoring.
- **Goods Received Notes (GRN):** Records incoming stock and supplier invoice information.
- **Supplier Management:** Maintains supplier information and supports return workflows.
- **Point of Sale (POS):** Supports medicine dispensing and customer billing.
- **Prescription Register:** Maintains prescription-related records for applicable medicines.
- **Audit Logging:** Records important inventory and operational activities.
- **Demand Forecasting:** Uses time-series forecasting to estimate medicine demand and identify potential expiry risks.
- **Role-Based Access Control (RBAC):** Provides different permissions for different staff roles.
- **Cloud Integration:** Supports Azure SQL Database, Azure Cosmos DB, and Azure Blob Storage.
- **Business Intelligence:** Supports operational reporting and Power BI dashboards.

---

## 2. Technology Stack

| Category | Technologies |
|---|---|
| Backend | Python, FastAPI |
| Frontend | HTML, CSS, JavaScript, Jinja2 |
| Database | Azure SQL Database / Local Database |
| Cloud Document Storage | Azure Cosmos DB |
| Object Storage | Azure Blob Storage |
| Machine Learning | Python, Exponential Smoothing |
| Data Processing | SQL, Python |
| Authentication | JWT, bcrypt |
| Testing | Pytest |
| Business Intelligence | Microsoft Power BI |
| Deployment | Azure App Service |
| Version Control | Git, GitHub |

---

## 3. System Architecture

ExpiryGuard Rx follows a layered backend architecture with multiple storage services.

```text
                  CLIENT BROWSER
                        |
                      HTTPS
                        |
                        v
               FASTAPI APPLICATION
                        |
          +-------------+-------------+
          |             |             |
          v             v             v
      AZURE SQL     AZURE COSMOS   AZURE BLOB
      DATABASE         DB           STORAGE
          |             |             |
          |             |             |
       Relational     JSON         Invoice
        Records     Documents       Files
          |
          v
    BUSINESS REPORTS
          |
          v
      POWER BI

          |
          v
   MACHINE LEARNING
   DEMAND FORECASTING
   EXPIRY RISK ANALYSIS
```

### Storage Architecture

**1. Azure SQL Database**
- Relational database management.
- Normalized database schema.
- Primary and foreign key constraints.
- FEFO inventory operations.
- Stored procedures and database triggers.
- Transaction management and audit logging.

**2. Azure Cosmos DB**
- Semi-structured JSON document storage.
- Supplier invoice document management.
- Forecast execution summaries.
- Partitioning using `/supplier_id`.

**3. Azure Blob Storage**
- Scanned supplier invoices.
- Private document storage.
- Temporary SAS access links.

**4. Power BI**
- Operational reporting.
- Inventory analysis.
- Expiry monitoring.
- Business performance indicators.

---

## 4. User Roles and Permissions

ExpiryGuard Rx implements Role-Based Access Control (RBAC) with five different user roles.

| Role | Role ID | Responsibilities |
|---|---:|---|
| Admin | 1 | User administration, master data, pricing, and system management |
| Pharmacist | 2 | Stock receiving, invoice scanning, prescription verification, and return approvals |
| Counter | 3 | Customer billing and medicine dispensing |
| Purchase | 4 | Supplier management, reorder planning, and supplier returns |
| Auditor | 5 | Read-only access to audit logs and reconciliation reports |

**Demo credentials:** Refer to the project's seed configuration for the locally generated demo accounts. Never publish production passwords or real credentials in this repository.

---

## 5. Installation and Local Setup

Follow these steps to run ExpiryGuard Rx locally.

### Prerequisites

Install the following:

- Python 3.11 or 3.12
- Visual Studio Code
- Git
- pip
- PowerShell or Command Prompt

### Step 1: Clone the Repository

```bash
git clone https://github.com/VISHALsince2025/ExpiryGuard-Rx-.git
```

Navigate into the project:

```bash
cd ExpiryGuard-Rx-
```

### Step 2: Create a Virtual Environment

```bash
python -m venv .venv
```

### Step 3: Activate the Virtual Environment

**Windows PowerShell:**

```powershell
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks script execution, you can activate it using Command Prompt:

```cmd
.venv\Scripts\activate.bat
```

**Linux / macOS:**

```bash
source .venv/bin/activate
```

### Step 4: Install Dependencies

```bash
python -m pip install --upgrade pip
```

```bash
pip install -r requirements.txt
```

### Step 5: Configure Environment Variables

Create your local `.env` file using the example configuration:

```powershell
Copy-Item .env.example .env
```

Configure the required environment variables in `.env`.

**Important:** Never commit your `.env` file, database passwords, JWT secrets, or cloud access keys to GitHub.

### Step 6: Initialize the Database and Seed Data

Run the seed script:

```bash
python ml/seed.py
```

The documented seed configuration includes sample roles, medicines, suppliers, batches, and historical sales data.

### Step 7: Run the Demand Forecasting Job

```bash
python ml/forecast_job.py
```

This job performs demand forecasting and batch-level expiry risk calculations.

### Step 8: Run Automated Tests

```bash
pytest -v
```

### Step 9: Start the FastAPI Application

```bash
uvicorn app.main:app --reload --port 8000
```

### Step 10: Open the Application

Visit:

```text
http://localhost:8000
```

Log in using the locally configured demo account.

---

## 6. Repository Structure

```text
ExpiryGuard-Rx/
│
├── app/
│   ├── main.py
│   ├── config.py
│   ├── db.py
│   ├── security.py
│   ├── deps.py
│   ├── audit.py
│   │
│   ├── routers/
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── medicines.py
│   │   ├── suppliers.py
│   │   ├── grn.py
│   │   ├── sales.py
│   │   ├── returns.py
│   │   ├── alerts.py
│   │   ├── reports.py
│   │   ├── audit_view.py
│   │   └── pages.py
│   │
│   ├── services/
│   │   ├── blob.py
│   │   ├── cosmos.py
│   │   └── forecast.py
│   │
│   ├── templates/
│   └── static/
│
├── sql/
│   ├── 00_drop.sql
│   ├── 01_schema.sql
│   ├── 02_indexes.sql
│   ├── 03_logic.sql
│   ├── 04_notes.md
│   ├── 05_queries.sql
│   └── 06_permissions.sql
│
├── ml/
│   ├── generate_data.py
│   ├── seed.py
│   └── forecast_job.py
│
├── tests/
│   ├── test_auth.py
│   ├── test_rbac.py
│   ├── test_security.py
│   ├── test_sale.py
│   ├── test_grn_returns.py
│   ├── test_performance.py
│   ├── test_auditability.py
│   └── test_forecast.py
│
├── docs/
│
├── requirements.txt
├── pytest.ini
├── .env.example
├── .gitignore
└── README.md
```

---

## 7. Database Design

The documented database architecture contains 13 normalized tables.

| No. | Table | Purpose |
|---:|---|---|
| 1 | `roles` | System roles |
| 2 | `users` | Staff accounts and authentication |
| 3 | `categories` | Medicine categories |
| 4 | `medicines` | Medicine master catalog |
| 5 | `suppliers` | Supplier information |
| 6 | `grn` | Goods Received Notes |
| 7 | `batches` | Batch-level stock and expiry tracking |
| 8 | `sales` | Customer sales records |
| 9 | `sale_items` | Individual sale line items |
| 10 | `prescription_register` | Prescription-related records |
| 11 | `supplier_returns` | Supplier return records |
| 12 | `audit_log` | Operational audit records |
| 13 | `demand_forecasts` | Medicine demand predictions |

### Important Database Concepts

- Database normalization (3NF).
- Primary and foreign keys.
- CHECK and UNIQUE constraints.
- Database indexes.
- Transactions and concurrency control.
- Stored procedures.
- Database triggers.
- Audit logging.
- Inventory reconciliation.

### FEFO Logic

FEFO stands for **First Expiry, First Out**.

The system prioritizes medicine batches with the earliest expiry dates when dispensing stock.

Example:

| Batch | Expiry Date | Quantity |
|---|---|---:|
| B001 | January 2027 | 50 |
| B002 | March 2027 | 100 |
| B003 | June 2027 | 75 |

The system should prioritize B001 before B002 and B003, subject to stock availability and applicable dispensing rules.

### Inventory Reconciliation

The documented reconciliation logic checks the relationship:

```text
Closing Stock = Received Quantity - Sold Quantity - Returned Quantity
```

This helps identify inventory discrepancies.

---

## 8. Machine Learning and Predictive Analytics

ExpiryGuard Rx includes a demand forecasting module.

### Key Capabilities

- Historical sales analysis.
- Time-series demand forecasting.
- Exponential smoothing.
- Naive forecasting baseline.
- Mean Absolute Error (MAE) evaluation.
- Batch-level expiry risk calculations.
- Identification of potential unsold inventory.

### Forecasting Workflow

```text
Historical Sales Data
        |
        v
Data Preparation
        |
        v
Demand Forecasting
        |
        v
Forecast Evaluation
        |
        v
Batch-Level Risk Analysis
        |
        v
Expiry Risk Insights
```

The goal is to help pharmacies make better purchasing, stocking, and inventory management decisions.

---

## 9. Functional and Non-Functional Requirements

### Functional Requirements

| ID | Requirement |
|---|---|
| FR1 | Authentication and account lockout |
| FR2 | Medicine master management |
| FR3 | Multi-batch stock receiving |
| FR4 | FEFO-based dispensing |
| FR5 | Expiry alerts and inventory risk |
| FR6 | Supplier return management |
| FR7 | Prescription register |
| FR8 | Audit logging |
| FR9 | Time-series demand forecasting |
| FR10 | Business intelligence reporting |

### Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR1 | Sales transaction performance |
| NFR2 | Inventory integrity |
| NFR3 | Concurrency control |
| NFR4 | Application security |
| NFR5 | Stock-change auditability |
| NFR6 | Application health monitoring |
| NFR7 | Counter usability |
| NFR8 | Maintainability and reproducibility |

Refer to the `tests/` and `docs/` directories for implementation details and verification procedures. Performance and compliance results should be considered verified only when reproduced in the target environment.

---

## 10. Azure Cloud Deployment

The architecture is designed to support the following Azure services:

1. Azure SQL Database – Relational database.
2. Azure Blob Storage – Scanned invoice storage.
3. Azure Cosmos DB for NoSQL – Document storage.
4. Azure App Service – FastAPI application hosting.
5. Microsoft Power BI – Business intelligence and reporting.

### Azure Prerequisites

- Azure subscription.
- Azure CLI.
- Appropriate resource permissions.
- Configured database and storage credentials.
- Application environment variables.

### Deployment Preparation

Authenticate with Azure:

```bash
az login
```

Select the appropriate subscription:

```bash
az account show
```

Create a resource group:

```bash
az group create --name rg-expiryguard --location centralindia
```

Further deployment commands and configuration details should be maintained in the project documentation.

**Note:** Azure service availability, pricing, free-tier eligibility, quotas, and deployment options can change. Verify current Azure documentation before deploying resources.

---

## 11. Security Considerations

Security is an important part of pharmacy inventory management.

The project documentation describes the following security mechanisms:

- Password hashing using bcrypt.
- JWT-based authentication.
- Role-Based Access Control.
- SQL injection protection.
- Login attempt restrictions.
- Secure environment configuration.
- Private invoice storage.
- Temporary SAS access links.
- Security headers.
- Inventory operation audit logging.

### Security Best Practices

- Never upload `.env` files.
- Never expose database credentials.
- Never publish production passwords.
- Use strong JWT secrets.
- Apply least-privilege access.
- Validate uploaded files.
- Use HTTPS in production.
- Rotate compromised credentials immediately.

---

## 12. Future Enhancements

Potential future improvements include:

- Advanced machine learning forecasting models.
- More accurate expiry-loss prediction.
- Automated supplier reorder recommendations.
- OCR-based invoice data extraction.
- Barcode and QR code scanning.
- Mobile application integration.
- Multi-branch pharmacy support.
- Real-time inventory synchronization.
- Advanced analytics and reporting.
- Automated notifications for critical expiry alerts.

---

## 13. Project Objectives

The main objectives of ExpiryGuard Rx are:

1. Reduce medicine expiry-related inventory losses.
2. Improve pharmacy stock visibility.
3. Enforce systematic FEFO dispensing.
4. Improve inventory accuracy.
5. Strengthen operational accountability.
6. Support data-driven purchasing decisions.
7. Apply machine learning to pharmacy inventory management.
8. Explore cloud-based enterprise application architecture.

---

## 14. Author

**Developed by: Vishal**

B.Tech – Computer Science and Engineering  
Specialization: Artificial Intelligence and Machine Learning

GitHub: [@VISHALsince2025](https://github.com/VISHALsince2025)

Project Repository: [ExpiryGuard Rx](https://github.com/VISHALsince2025/ExpiryGuard-Rx-)

---

## 15. License

No license has been specified yet. All rights are reserved by the project owner unless a license is added to this repository.

---

**ExpiryGuard Rx – Smarter Inventory. Safer Dispensing. Reduced Expiry Losses.**