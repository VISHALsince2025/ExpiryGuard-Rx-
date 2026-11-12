# ExpiryGuard Rx: System Architecture & Design Decisions

## 1. System Component Diagram

```
+-----------------------------------------------------------------------------------+
|                                  Client Tier                                      |
|  [ Web Browser / Cashier Terminal ] <--- HTTPS ---> [ Single-Page Jinja2 UI / CSS ]|
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        Application Tier (Azure App Service)                       |
|   FastAPI Monolith (Uvicorn / Gunicorn)                                           |
|   - Security Middleware: CSP, HSTS, X-Frame-Options, Rate Limiting (SlowAPI)      |
|   - Authentication & RBAC Engine: Bcrypt Cost 12, Signed JWT, HttpOnly Cookies   |
|   - Routers:                                                                      |
|     * /auth          * /medicines     * /sales (FEFO)   * /returns                |
|     * /users         * /suppliers     * /grn            * /alerts & /reports      |
|   - Background Jobs: ml/forecast_job.py                                           |
+-----------------------------------------------------------------------------------+
              |                                 |                         |
              v                                 v                         v
+-----------------------------+  +---------------------------+  +-------------------+
|   Structured Data Layer     |  |   Document Storage Layer  |  |  Blob Storage     |
|   Azure SQL Database        |  |   Azure Cosmos DB         |  |  Azure Blob Store |
|   - 13 Tables, Strict FKs   |  |   - Partition Key:        |  |  - Private invoice|
|   - Pessimistic Locks       |  |     /supplier_id          |  |    scans (PDF/JPG)|
|   - Stored Procedures       |  |   - Semi-structured       |  |  - 5-minute SAS   |
|     (usp_create_sale)       |  |     invoice JSON & runs   |  |    temporary links|
|   - Audit Triggers          |  +---------------------------+  +-------------------+
+-----------------------------+
              ^
              | (Read-Only Import Mode)
+-----------------------------+
|   Analytics & BI Layer      |
|   Power BI Desktop          |
|   - Reads Aggregate SQL     |
|     Views (9 Core KPIs)     |
+-----------------------------+
```

---

## 2. Transaction Data Flow (FEFO Point-of-Sale Checkout)

1. **Authentication Check**: The counter browser sends the signed JWT `access_token` cookie with the request.
2. **Server-Side RBAC Enforcement**: `require_roles("Admin", "Pharmacist", "Counter")` extracts the caller identity from the token payload and validates permissions.
3. **Payload Validation**: Pydantic validates customer name, payment mode (`CASH`, `UPI`, `CARD`), and requested items list (`quantity >= 1`).
4. **Procedure Invocation**: `app/routers/sales.py` sets connection context and executes stored procedure `dbo.usp_create_sale` passing item JSON.
5. **Pessimistic Row Locking (`UPDLOCK, ROWLOCK`)**: Inside the database transaction:
   - Finds candidate active unexpired batches sorted strictly by `expiry_date ASC, batch_id ASC`.
   - Acquires update row locks, preventing concurrent terminal race conditions.
   - Iteratively deducts quantities from earliest expiring lots until the required item volume is fully satisfied.
   - If available unexpired stock is insufficient, triggers error code `50001`: rolls back the transaction, leaving stock untouched.
6. **Audit Attribution**: Database trigger `trg_batches_audit` intercepts batch modifications and writes old and new values to `dbo.audit_log`.
7. **Bill Return**: Returns completed `sale_id`. Cashier interface retrieves full line-item bill detailing allocated batches and prices.

---

## 3. Authentication & Account Lockout Flow

1. User submits login credentials over HTTPS.
2. System looks up user row via parameterized query (`WHERE username = ?`).
3. If user is absent, dummy bcrypt hash comparison executes to ensure constant-time response, mitigating username enumeration.
4. Checks `is_active` flag and `locked_until` timestamp. If locked, access is blocked.
5. Verifies password using `bcrypt.checkpw()`.
   - On mismatch: Increments `failed_attempts`. If failures reach 5, sets `locked_until = UTC_NOW + 15 minutes`. Records `LOGIN_FAIL` audit row. Returns generic error message: *"Invalid username or password"*.
   - On match: Clears `failed_attempts` and `locked_until`. Records `LOGIN_OK` in audit log. Signs 30-minute JWT with `sub` and `role`.
6. Sets `access_token` in an `HttpOnly`, `SameSite=Strict`, `Secure` (in prod) cookie. JavaScript cannot inspect this cookie.

---

## 4. Architectural Trade-offs & Rejected Alternatives

### Trade-Off 1: Strong Consistency vs. Eventual Consistency
- **Chosen**: Strong consistency with row-level locking (`UPDLOCK, ROWLOCK`) inside ACID database transactions.
- **Rejected**: Eventual consistency via message queues (e.g., RabbitMQ / Azure Service Bus) updating stock asynchronously.
- **Rationale**: In healthcare and pharmaceuticals, selling the last unit twice or dispensing an expired drug is catastrophic. Low peak counter concurrency in community pharmacies makes pessimistic locking virtually costless (sub-100ms latency) while guaranteeing absolute stock precision.

### Trade-Off 2: Monolith vs. Microservices
- **Chosen**: Single modular FastAPI monolith.
- **Rejected**: Multi-service architecture splitting inventory, billing, alert notifications, and user authentication into isolated microservices.
- **Rationale**: For an independent pharmacy system maintained by an engineering team, microservices introduce cross-service network boundaries, distributed transactions, deployment overhead, and failure modes with no performance gain. Code is segregated cleanly into routers and services to permit future extraction if required.

### Trade-Off 3: Polyglot Persistence (SQL + NoSQL + Blob) vs. Pure Relational
- **Chosen**: Relational Azure SQL for core ledger data; Azure Blob Storage for private file uploads; Azure Cosmos DB for semi-structured supplier invoice documents.
- **Rejected**: Storing binary files and arbitrary vendor schemas inside SQL Server `VARBINARY` / `NVARCHAR(MAX)` columns or running everything on MongoDB.
- **Rationale**: Inventory balances and financial bills demand relational foreign keys and ACID constraints. Invoices from different pharmaceutical distributors vary wildly in formatting, making flexible JSON document storage natural, while multi-megabyte PDF invoice scans belong in cheap cloud blob storage accessed via short-lived SAS tokens.

### Trade-Off 4: Synchronous Billing vs. Asynchronous Forecasting
- **Chosen**: Synchronous Point-of-Sale checkout; asynchronous nightly batch forecasting.
- **Rejected**: Running statistical time-series forecasting algorithms inline during cashier billing requests.
- **Rationale**: Counter checkout demands immediate sub-second response times. Machine learning time-series evaluations require analyzing 90-day histories and are executed as an isolated background job.

### Trade-Off 5: Live Database Queries vs. In-Memory Stock Caching
- **Chosen**: Direct database queries against indexed tables with zero in-memory caching of stock balances.
- **Rejected**: Redis or memcached caching for batch inventory balances.
- **Rationale**: Caching inventory counts introduces stale-read windows where two cashiers might view outdated stock counts and oversell near-expiry inventory. Because FEFO requires absolute real-time accuracy, stock balances are queried directly from the database engine.
