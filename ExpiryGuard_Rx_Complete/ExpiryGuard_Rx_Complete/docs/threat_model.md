# Security Architecture & Threat Model

This threat model outlines potential attack vectors against ExpiryGuard Rx, evaluated consequences, implemented mitigations, and residual risk disclosures.

## 1. Threat Matrix

| Threat Category | Attack Vector | Potential Impact | Mitigation Architecture & Enforcing Component |
|---|---|---|---|
| **SQL Injection (SQLi)** | Attacker inputs SQL code (e.g. `' OR '1'='1`) into login or medicine search fields. | Unauthorized authentication bypass, data exfiltration, database tampering. | 100% Parameterized queries with `?` bind parameters; stored procedures; restricted least-privilege database user (`eg_app`) with `DENY DELETE`. |
| **Cross-Site Scripting (XSS)** | Malicious script stored in medicine brand name, generic name, or customer text. | Session cookie theft, DOM hijacking, administrative session abuse. | Automatic Jinja2 contextual HTML escaping (strict prohibition of `\|safe` filter); Content-Security-Policy (CSP) disallowing inline scripts; HttpOnly cookies. |
| **Broken Object-Level Authorization (BOLA)** | Counter staff directly calls `POST /grn`, `GET /users`, or `POST /returns/{id}/approve`. | Unauthorized stock creation, privilege escalation, fraudulent financial approvals. | Server-side `require_roles(...)` dependency checks on every endpoint. Frontend button hiding is purely cosmetic; authorization is enforced at backend. |
| **Credential Brute-Force** | High-frequency password guessing against staff usernames. | Account takeover, unauthorized dispensing. | Salted bcrypt password hashing (cost factor 12); automatic lockout after 5 consecutive failures for 15 minutes; constant-time dummy hash on non-existent users; SlowAPI rate limiting. |
| **Unauthorized DB Access** | Remote entity connects directly to Azure SQL port 1433 over the internet. | Total data exposure and structural tampering. | Azure SQL Server IP firewall allowing exclusively App Service outbound IP addresses and whitelisted administrative IPs; connection encryption enforced (`Encrypt=yes`). |
| **Malicious File Upload** | Attacker uploads web shell (`.php`, `.py`, `.exe`) disguised as a supplier invoice scan. | Remote code execution, persistent malware hosting, XSS via file delivery. | Magic signature byte inspection (`%PDF`, `\x89PNG`, `\xff\xd8\xff`); 5 MB size ceiling; cryptographically random UUID blob names; private blob container; time-bounded SAS tokens (5 min). Files are never served from app origin. |
| **Session & Token Tampering** | Attacker tampers with JWT payload or replays old token. | Impersonation of administrative role. | HS256 HMAC signing with 48-byte cryptographically random secret (`JWT_SECRET`); strict 30-minute expiration; `HttpOnly`, `SameSite=Strict`, `Secure` cookie attributes. |
| **Cross-Site Request Forgery (CSRF)** | Third-party malicious site triggers actions in authenticated cashier browser. | Fraudulent stock dispensing, unwanted updates. | `SameSite=Strict` cookie enforcement; state-changing endpoints consume JSON payloads requiring browser preflight requests. |
| **Information & Secret Disclosure** | Error pages or stack traces leaking SQL syntax, connection strings, or system paths. | Reconnaissance enabling secondary attacks. | Generic user-facing exception messages; interactive documentation (`/docs`, `/openapi.json`) disabled in production (`ENV=prod`); secrets isolated in environment variables. |
| **Insider Tampering & Fraud** | Staff member silently changes inventory counts or price and attempts to delete traces. | Undetected theft, compliance failure. | Database trigger `trg_batches_audit` writing all modifications to `dbo.audit_log`; append-only permissions (`DENY UPDATE, DELETE ON dbo.audit_log TO eg_app`); automated Q12 reconciliation. |
| **Repository Secret Leak** | Developer accidentally commits cloud credentials or connection strings to git. | Cloud resource compromise. | Comprehensive `.gitignore` covering `.env`, certificates, and `.pbix` files; pre-commit verification. |

---

## 2. Honest Residual Risk Disclosures

1. **Multi-Factor Authentication (MFA)**: MFA is not currently implemented; reliance is placed on strict password rules (minimum 8 characters, bcrypt cost 12) and 5-attempt automated lockout.
2. **Web Application Firewall (WAF)**: Enterprise WAF (such as Azure Front Door WAF) is a premium paid cloud offering not included in free-tier student plans.
3. **Role Revocation Window**: Signed JWT role changes take effect when the token expires (30 minutes) or upon re-authentication. For instant revocation, blacklisting or real-time database role lookups can be configured.
