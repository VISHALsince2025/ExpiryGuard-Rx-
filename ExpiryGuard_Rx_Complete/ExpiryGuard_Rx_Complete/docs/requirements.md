# Functional & Non-Functional Requirements Specification

## 1. Functional Requirements (FR)

| ID | Requirement Name | Description & Verification Criteria |
|---|---|---|
| **FR1** | **Authentication & Session RBAC** | Users authenticate using username and password. The server issues a signed JWT session cookie (`HttpOnly`, `SameSite=Strict`, `Secure` in prod) and enforces server-side role validation on every endpoint. Failed logins are rate-limited and locked after 5 attempts for 15 minutes. |
| **FR2** | **Medicine & Master Catalog Management** | Authorized staff (Admin, Pharmacist) create, update, search, and soft-delete medicines, therapeutic categories, and suppliers with full server-side validation. |
| **FR3** | **Goods Received Note (GRN) Inward** | Pharmacists record multi-batch deliveries (batch number, expiry date, received quantity, unit cost, MRP) in a single atomic database transaction, and upload scanned supplier invoice documents. |
| **FR4** | **Transactional FEFO Billing** | Dispensing selects stock exclusively from the earliest-expiring unexpired batches first. A single sale line can span multiple consecutive batches. If inventory is short, the entire bill rolls back atomically without modifying stock. |
| **FR5** | **Expiry Banding & Value at Risk** | The system segments inventory into four distinct expiry bands: `EXPIRED` (past today), `RED` ($\le$ 30 days), `AMBER` ($\le$ 90 days), and `GREEN` (> 90 days), calculating total stock capital at stake. |
| **FR6** | **Supplier Return Workflow** | Staff initiate returns for near-expiry or damaged lots; a pharmacist reviews and approves the return, transactionally deducting stock; purchase officers record supplier credit notes. |
| **FR7** | **Prescription-Only Drug Register** | Dispensing prescription-controlled medicines (Schedule H/X) prompts the statutory register capturing patient name, prescribing doctor, and council registration number (synthetic data). |
| **FR8** | **Comprehensive Audit Logging** | Every critical mutation (stock deduction, batch update, user modification, return approval, authentication failure) writes an immutable record to `dbo.audit_log` detailing who, when, table, old value, new value, and client IP. |
| **FR9** | **Predictive Demand & Batch Risk** | A scheduled forecasting job evaluates time-series sales velocity, models daily demand, and computes projected unsold units and rupee value at risk per batch. |
| **FR10** | **Executive Analytics Dashboard** | Provides 9 core business intelligence KPIs tracking monthly expiry write-offs, fast/slow movers, daily revenue velocity, supplier return rates, and low-stock reorder shortages. |

---

## 2. Non-Functional Requirements (NFR)

| ID | Quality Attribute | Measurable Target & Verification Proof |
|---|---|---|
| **NFR1** | **Performance** | A multi-line sale completes in under 2.0 seconds at the 95th percentile on awake compute. Proved via automated timing benchmark of 50 consecutive sales (Achieved: Mean 50.5ms, P95 97.1ms). |
| **NFR2** | **Data Integrity** | Inventory balance can never become negative (`qty_on_hand >= 0`) and cannot exceed received stock (`qty_on_hand <= qty_received`). Enforced by database CHECK constraints. |
| **NFR3** | **Consistency & Concurrency** | Two counter terminals attempting to dispense the final available unit simultaneously cannot both succeed. Evaluated via concurrent asynchronous checkout test verifying exactly one 201 Created and one 409 Conflict. |
| **NFR4** | **Security** | HTTPS communication, passwords salted and hashed using bcrypt cost 12, zero secrets committed to git, and strict Content-Security-Policy headers preventing cross-site scripting (XSS). |
| **NFR5** | **Auditability** | 100% of stock-changing operations create an immutable entry in `dbo.audit_log`. Proved by comparing audit count growth against transaction executions. |
| **NFR6** | **Availability & Resilience** | Public health probe endpoint (`/health`) returns `{status: "ok"}` for cloud liveness and traffic routing. |
| **NFR7** | **Usability** | Streamlined counter checkout workflow allows an operator to complete a multi-line transaction in under 60 seconds with live auto-search and batch auto-allocation. |
| **NFR8** | **Maintainability** | Clean modular architecture, raw parameterized SQL without bulky ORM overhead, numbered re-runnable SQL migration scripts (`00` to `06`), and local reproduction in under 10 commands. |
