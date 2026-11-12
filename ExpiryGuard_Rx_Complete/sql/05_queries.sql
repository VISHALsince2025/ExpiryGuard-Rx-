-- sql/05_queries.sql
-- ExpiryGuard Rx: Core business queries and verification suite (Q1 to Q12)

-- -------------------------------------------------------------
-- Q1 INNER JOIN: Current stock by medicine and batch, earliest expiry first (Stock screen)
-- -------------------------------------------------------------
SELECT m.brand_name, m.strength, b.batch_number, b.expiry_date, b.qty_on_hand
FROM dbo.batches b
INNER JOIN dbo.medicines m ON m.medicine_id = b.medicine_id
WHERE b.qty_on_hand > 0 AND b.status = 'ACTIVE'
ORDER BY m.brand_name, b.expiry_date;

-- -------------------------------------------------------------
-- Q2 LEFT JOIN: Active medicines with no stock at all (Reorder candidates)
-- -------------------------------------------------------------
SELECT m.medicine_id, m.brand_name, m.strength
FROM dbo.medicines m
LEFT JOIN dbo.batches b ON b.medicine_id = m.medicine_id AND b.qty_on_hand > 0 AND b.status = 'ACTIVE'
WHERE m.is_active = 1 AND b.batch_id IS NULL;

-- -------------------------------------------------------------
-- Q3 GROUP BY + HAVING + Aggregation: Fast movers in the last 30 days (at least 50 units sold)
-- -------------------------------------------------------------
SELECT m.medicine_id, m.brand_name, SUM(si.quantity) AS units_30d
FROM dbo.sale_items si
JOIN dbo.sales s ON s.sale_id = si.sale_id
JOIN dbo.batches b ON b.batch_id = si.batch_id
JOIN dbo.medicines m ON m.medicine_id = b.medicine_id
WHERE s.sale_time >= DATEADD(DAY, -30, SYSUTCDATETIME())
GROUP BY m.medicine_id, m.brand_name
HAVING SUM(si.quantity) >= 50
ORDER BY units_30d DESC;

-- -------------------------------------------------------------
-- Q4 SUBQUERY: Medicines whose total stock is below their reorder level
-- -------------------------------------------------------------
SELECT m.brand_name, m.reorder_level,
    (SELECT COALESCE(SUM(b.qty_on_hand), 0) 
     FROM dbo.batches b
     WHERE b.medicine_id = m.medicine_id AND b.status = 'ACTIVE') AS on_hand
FROM dbo.medicines m
WHERE m.is_active = 1
  AND (SELECT COALESCE(SUM(b.qty_on_hand), 0) 
       FROM dbo.batches b
       WHERE b.medicine_id = m.medicine_id AND b.status = 'ACTIVE') < m.reorder_level;

-- -------------------------------------------------------------
-- Q5 VIEW: Batches in the red band (Alert screen)
-- -------------------------------------------------------------
SELECT * 
FROM dbo.v_expiry_status 
WHERE expiry_band IN ('EXPIRED', 'RED') 
ORDER BY days_left;

-- -------------------------------------------------------------
-- Q6 AGGREGATION: Expiry loss by month (Unsold units at expiry, at cost price)
-- -------------------------------------------------------------
SELECT FORMAT(expiry_date, 'yyyy-MM') AS expiry_month,
       SUM(qty_on_hand * cost_price) AS loss_value
FROM dbo.batches
WHERE expiry_date <= dbo.fn_today() AND qty_on_hand > 0
GROUP BY FORMAT(expiry_date, 'yyyy-MM')
ORDER BY expiry_month;

-- -------------------------------------------------------------
-- Q7 INSERT: Add a supplier (Run as admin)
-- -------------------------------------------------------------
INSERT INTO dbo.suppliers (supplier_name, phone, city) 
VALUES (N'Demo Wholesale Pharma', '9000000001', N'Varanasi');

-- -------------------------------------------------------------
-- Q8 UPDATE: Correct a batch's selling price (Audit trigger fires)
-- -------------------------------------------------------------
EXEC sp_set_session_context @key = N'user_id', @value = 1;
UPDATE dbo.batches SET selling_price = 24.50 WHERE batch_id = 1;
SELECT TOP (3) * FROM dbo.audit_log ORDER BY audit_id DESC;

-- -------------------------------------------------------------
-- Q9 DELETE: Remove an unreferenced supplier vs. one with deliveries
-- -------------------------------------------------------------
-- Deletion allowed (no delivery references):
DELETE FROM dbo.suppliers WHERE supplier_name = N'Demo Wholesale Pharma';
-- Deletion blocked (FK reference in grn table raises foreign key error):
-- DELETE FROM dbo.suppliers WHERE supplier_id = 1;

-- -------------------------------------------------------------
-- Q10 SUPPLIER RETURN RATE: Rupee credit vs value received
-- -------------------------------------------------------------
SELECT sp.supplier_name,
       SUM(r.return_qty) AS units_returned,
       SUM(COALESCE(r.credit_amount, 0)) AS credit_received
FROM dbo.supplier_returns r
JOIN dbo.batches b ON b.batch_id = r.batch_id
JOIN dbo.grn g ON g.grn_id = b.grn_id
JOIN dbo.suppliers sp ON sp.supplier_id = g.supplier_id
GROUP BY sp.supplier_name
ORDER BY units_returned DESC;

-- -------------------------------------------------------------
-- Q11 CASHIER PERFORMANCE: Monthly sales and volume by staff member
-- -------------------------------------------------------------
SELECT u.full_name, COUNT(*) AS bills, SUM(v.total_amount) AS revenue
FROM dbo.v_sale_bill v
JOIN dbo.users u ON u.user_id = v.sold_by
WHERE v.sale_time >= DATEADD(MONTH, -1, SYSUTCDATETIME())
GROUP BY u.full_name
ORDER BY revenue DESC;

-- -------------------------------------------------------------
-- Q12 RECONCILIATION: qty_on_hand must equal received - sold - returned.
-- Expected result: ZERO rows returned.
-- -------------------------------------------------------------
SELECT b.batch_id, b.qty_received, 
       COALESCE(s.sold, 0) AS sold, 
       COALESCE(r.ret, 0) AS returned, 
       b.qty_on_hand
FROM dbo.batches b
LEFT JOIN (
    SELECT batch_id, SUM(quantity) AS sold 
    FROM dbo.sale_items 
    GROUP BY batch_id
) s ON s.batch_id = b.batch_id
LEFT JOIN (
    SELECT batch_id, SUM(return_qty) AS ret 
    FROM dbo.supplier_returns
    WHERE status IN ('APPROVED', 'CREDITED') 
    GROUP BY batch_id
) r ON r.batch_id = b.batch_id
WHERE b.qty_received - COALESCE(s.sold, 0) - COALESCE(r.ret, 0) <> b.qty_on_hand;
