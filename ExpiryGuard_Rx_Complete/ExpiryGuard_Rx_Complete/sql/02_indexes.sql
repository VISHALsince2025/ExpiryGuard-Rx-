-- sql/02_indexes.sql
-- ExpiryGuard Rx: Performance indexes for FEFO lookup, expiry scans, searches, date reports, and audit trails

-- FEFO lookup: find earliest-expiring active batch of a medicine (used on every sale)
CREATE INDEX IX_batches_fefo ON dbo.batches (medicine_id, expiry_date) 
INCLUDE (qty_on_hand, selling_price, status);

-- Expiry scan and dashboards
CREATE INDEX IX_batches_expiry ON dbo.batches (expiry_date) 
INCLUDE (qty_on_hand, cost_price, status);

-- Search boxes
CREATE INDEX IX_med_brand ON dbo.medicines (brand_name);
CREATE INDEX IX_med_generic ON dbo.medicines (generic_name);

-- Reports by date, joins from bill to lines and batch to lines
CREATE INDEX IX_sales_time ON dbo.sales (sale_time);
CREATE INDEX IX_si_sale ON dbo.sale_items (sale_id);
CREATE INDEX IX_si_batch ON dbo.sale_items (batch_id);
CREATE INDEX IX_batches_grn ON dbo.batches (grn_id);

-- Audit searches
CREATE INDEX IX_audit_time ON dbo.audit_log (event_time);
CREATE INDEX IX_audit_record ON dbo.audit_log (table_name, record_id);
