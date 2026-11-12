-- sql/06_permissions.sql
-- ExpiryGuard Rx: Least-privilege application database user configuration
-- Run this as administrator/db_owner. Replace placeholder password before executing.

CREATE USER eg_app WITH PASSWORD = '<<generate-with-a-password-manager>>';

-- 1. Grant Data Manipulation and Execution privileges
GRANT SELECT, INSERT, UPDATE ON SCHEMA::dbo TO eg_app;
GRANT EXECUTE ON SCHEMA::dbo TO eg_app;

-- 2. Strictly DENY physical deletion (app utilizes soft deletes via is_active = 0)
DENY DELETE ON SCHEMA::dbo TO eg_app;

-- 3. Strictly DENY modification and deletion on the audit log (append-only ledger)
DENY UPDATE, DELETE ON dbo.audit_log TO eg_app;
