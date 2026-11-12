# ExpiryGuard Rx: Cloud Security Verification Checklist

| # | Security Control | Implementation Description | Status | Evidence / Verification Target |
|---|---|---|---|---|
| **1** | Passwords hashed with bcrypt | Passwords salted and hashed with bcrypt cost factor 12. Only 60-character hashes starting with `$2b$12$` stored in database. | **PASSED** | `app/security.py`, `tests/test_auth.py` |
| **2** | Role check on every route | Fast dependency injection `require_roles(...)` validates authenticated role on all routes. | **PASSED** | `app/deps.py`, `docs/rbac_matrix.md`, `tests/test_rbac.py` |
| **3** | HTTPS only & TLS 1.2+ | Forced HTTPS redirection, TLS 1.2 minimum version, HSTS `max-age=31536000` header, FTPS disabled on App Service. | **PASSED** | `app/main.py`, `tests/test_security.py` |
| **4** | Zero secrets in repository | `.gitignore` active from initial commit, `.env.example` contains variable names only; real credentials stored in Azure App Settings. | **PASSED** | `.gitignore`, `.env.example` |
| **5** | Server-side input validation | Pydantic models validate data types, regex patterns, integer bounds, and date windows; database CHECK constraints act as second defense. | **PASSED** | `app/routers/grn.py`, `tests/test_security.py` |
| **6** | Parameterized SQL only | Every query uses `?` bind placeholders; zero string-concatenated SQL queries. Stored procedures for transaction execution. | **PASSED** | `app/routers/auth.py`, `sql/05_queries.sql`, `tests/test_security.py` |
| **7** | Output escaping & CSP | Jinja2 auto-escapes all template variables; strict `Content-Security-Policy` header blocks inline scripts and eval; zero `\|safe` filters on user input. | **PASSED** | `app/main.py`, `app/templates/`, `tests/test_security.py` |
| **8** | Database firewall allow-list | Azure SQL Server firewall configured to accept traffic exclusively from App Service outbound IPs and approved laptop IP. | **PASSED** | `docs/architecture.md`, `sql/06_permissions.sql` |
| **9** | Least-privilege DB user | App connects as `eg_app` user with `GRANT SELECT, INSERT, UPDATE` and explicit `DENY DELETE` and `DENY UPDATE, DELETE ON dbo.audit_log`. | **PASSED** | `sql/06_permissions.sql` |
| **10** | Comprehensive audit logging | `dbo.audit_log` records authentication successes/failures, stock changes, price corrections, and returns with user attribution. | **PASSED** | `app/audit.py`, `sql/03_logic.sql`, `tests/test_auditability.py` |
| **11** | Upload validation & private storage | Magic signature bytes checked for PDF, PNG, JPG; 5 MB size cap; stored in private Azure Blob container with 5-minute SAS temporary links. | **PASSED** | `app/security.py`, `app/services/blob.py` |
| **12** | Account lockout & rate limiting | 5 failed login attempts trigger 15-minute account lockout; SlowAPI protects login endpoint against brute-force attacks. | **PASSED** | `app/routers/auth.py`, `tests/test_auth.py` |
| **13** | Formal threat model | Complete Threat, Attack, Impact, Mitigation matrix documented. | **PASSED** | `docs/threat_model.md` |
| **14** | Production hides docs and errors | Interactive OpenAPI documentation (`/docs`, `/openapi.json`) hidden in production (`ENV=prod`); generic user error messages prevent info disclosure. | **PASSED** | `app/main.py`, `app/routers/auth.py` |
