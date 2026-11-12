-- sql/00_drop.sql
-- Drops all ExpiryGuard Rx database objects in reverse dependency order

-- Drop stored procedures
DROP PROCEDURE IF EXISTS dbo.usp_approve_return;
DROP PROCEDURE IF EXISTS dbo.usp_create_sale;

-- Drop trigger (batches table drop will drop it, but explicit drop is safe)
DROP TRIGGER IF EXISTS dbo.trg_batches_audit;

-- Drop views
DROP VIEW IF EXISTS dbo.v_forecast_latest;
DROP VIEW IF EXISTS dbo.v_supplier_returns;
DROP VIEW IF EXISTS dbo.v_expiry_loss_monthly;
DROP VIEW IF EXISTS dbo.v_sales_daily;
DROP VIEW IF EXISTS dbo.v_sale_bill;
DROP VIEW IF EXISTS dbo.v_expiry_status;

-- Drop function
DROP FUNCTION IF EXISTS dbo.fn_today;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS dbo.demand_forecasts;
DROP TABLE IF EXISTS dbo.audit_log;
DROP TABLE IF EXISTS dbo.supplier_returns;
DROP TABLE IF EXISTS dbo.prescription_register;
DROP TABLE IF EXISTS dbo.sale_items;
DROP TABLE IF EXISTS dbo.sales;
DROP TABLE IF EXISTS dbo.batches;
DROP TABLE IF EXISTS dbo.grn;
DROP TABLE IF EXISTS dbo.suppliers;
DROP TABLE IF EXISTS dbo.medicines;
DROP TABLE IF EXISTS dbo.categories;
DROP TABLE IF EXISTS dbo.users;
DROP TABLE IF EXISTS dbo.roles;
