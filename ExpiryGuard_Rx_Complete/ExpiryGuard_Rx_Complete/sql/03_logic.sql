-- sql/03_logic.sql
-- ExpiryGuard Rx: Function, Views, Trigger, and Stored Procedures

-- -------------------------------------------------------------
-- 1. Helper Function: Today's date in India (IST)
-- -------------------------------------------------------------
CREATE OR ALTER FUNCTION dbo.fn_today() RETURNS DATE
AS BEGIN
    RETURN CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'India Standard Time' AS DATE);
END;
GO

-- -------------------------------------------------------------
-- 2. Transactional & Operational Views
-- -------------------------------------------------------------

-- View: v_expiry_status (Categorizes active/expired stock into EXPIRED, RED, AMBER, GREEN bands)
CREATE OR ALTER VIEW dbo.v_expiry_status AS
SELECT 
    b.batch_id, 
    m.medicine_id, 
    m.brand_name, 
    m.strength, 
    b.batch_number,
    b.expiry_date,
    DATEDIFF(DAY, dbo.fn_today(), b.expiry_date) AS days_left,
    b.qty_on_hand,
    CAST(b.qty_on_hand * b.cost_price AS DECIMAL(12,2)) AS stock_cost_value,
    CASE 
        WHEN b.expiry_date <= dbo.fn_today() THEN 'EXPIRED'
        WHEN DATEDIFF(DAY, dbo.fn_today(), b.expiry_date) <= 30 THEN 'RED'
        WHEN DATEDIFF(DAY, dbo.fn_today(), b.expiry_date) <= 90 THEN 'AMBER'
        ELSE 'GREEN' 
    END AS expiry_band
FROM dbo.batches b
JOIN dbo.medicines m ON m.medicine_id = b.medicine_id
WHERE b.qty_on_hand > 0 AND b.status IN ('ACTIVE','EXPIRED');
GO

-- View: v_sale_bill (Summarizes individual bills by items, units and total revenue)
CREATE OR ALTER VIEW dbo.v_sale_bill AS
SELECT 
    s.sale_id, 
    s.sale_time, 
    s.sold_by, 
    s.payment_mode,
    SUM(si.quantity) AS units,
    SUM(si.quantity * si.unit_price) AS total_amount
FROM dbo.sales s
JOIN dbo.sale_items si ON si.sale_id = s.sale_id
GROUP BY s.sale_id, s.sale_time, s.sold_by, s.payment_mode;
GO

-- -------------------------------------------------------------
-- 3. Analytics & Power BI Views
-- -------------------------------------------------------------

-- View: v_sales_daily (Daily unit sales and revenue per medicine)
CREATE OR ALTER VIEW dbo.v_sales_daily AS
SELECT 
    CAST(s.sale_time AT TIME ZONE 'UTC' AT TIME ZONE 'India Standard Time' AS DATE) AS sale_date,
    b.medicine_id, 
    SUM(si.quantity) AS units, 
    SUM(si.quantity * si.unit_price) AS revenue
FROM dbo.sales s
JOIN dbo.sale_items si ON si.sale_id = s.sale_id
JOIN dbo.batches b ON b.batch_id = si.batch_id
GROUP BY CAST(s.sale_time AT TIME ZONE 'UTC' AT TIME ZONE 'India Standard Time' AS DATE), b.medicine_id;
GO

-- View: v_expiry_loss_monthly (Monthly unsold units and cost loss from expired stock)
CREATE OR ALTER VIEW dbo.v_expiry_loss_monthly AS
SELECT 
    FORMAT(expiry_date, 'yyyy-MM') AS expiry_month,
    SUM(qty_on_hand * cost_price) AS loss_value,
    SUM(qty_on_hand) AS units_lost
FROM dbo.batches
WHERE expiry_date <= dbo.fn_today() AND qty_on_hand > 0
GROUP BY FORMAT(expiry_date, 'yyyy-MM');
GO

-- View: v_supplier_returns (Returns report by supplier, reason, status, units and credit amount)
CREATE OR ALTER VIEW dbo.v_supplier_returns AS
SELECT 
    sp.supplier_name, 
    r.status, 
    r.reason, 
    r.return_qty, 
    COALESCE(r.credit_amount, 0) AS credit_amount, 
    r.return_date
FROM dbo.supplier_returns r
JOIN dbo.batches b ON b.batch_id = r.batch_id
JOIN dbo.grn g ON g.grn_id = b.grn_id
JOIN dbo.suppliers sp ON sp.supplier_id = g.supplier_id;
GO

-- View: v_forecast_latest (Most recent daily forecast demand per medicine)
CREATE OR ALTER VIEW dbo.v_forecast_latest AS
SELECT 
    f.medicine_id, 
    m.brand_name, 
    f.predicted_daily_units, 
    f.method, 
    f.mae, 
    f.forecast_date
FROM dbo.demand_forecasts f
JOIN dbo.medicines m ON m.medicine_id = f.medicine_id
WHERE f.forecast_date = (
    SELECT MAX(forecast_date) 
    FROM dbo.demand_forecasts 
    WHERE medicine_id = f.medicine_id
);
GO

-- -------------------------------------------------------------
-- 4. Trigger: Audit log for any batch qty, price or status change
-- -------------------------------------------------------------
CREATE OR ALTER TRIGGER dbo.trg_batches_audit ON dbo.batches
AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.audit_log (user_id, action, table_name, record_id, old_value, new_value)
    SELECT 
        TRY_CAST(SESSION_CONTEXT(N'user_id') AS INT),
        'BATCH_UPDATE', 
        'batches', 
        CAST(i.batch_id AS NVARCHAR(40)),
        CONCAT('qty=', d.qty_on_hand, ';price=', d.selling_price, ';status=', d.status),
        CONCAT('qty=', i.qty_on_hand, ';price=', i.selling_price, ';status=', i.status)
    FROM inserted i
    JOIN deleted d ON d.batch_id = i.batch_id
    WHERE i.qty_on_hand <> d.qty_on_hand
       OR i.selling_price <> d.selling_price
       OR i.status <> d.status;
END;
GO

-- -------------------------------------------------------------
-- 5. Stored Procedure: FEFO Billing (usp_create_sale)
-- -------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.usp_create_sale
    @sold_by INT,
    @customer_name NVARCHAR(100) = NULL,
    @payment_mode NVARCHAR(10),
    @items NVARCHAR(MAX), -- JSON: [{"medicine_id":1,"quantity":30}, ...]
    @sale_id INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON; -- Any runtime error automatically rolls back entire transaction
    BEGIN TRY
        BEGIN TRAN;
        -- Set session context so trigger captures user_id
        EXEC sp_set_session_context @key = N'user_id', @value = @sold_by;

        INSERT INTO dbo.sales (sold_by, customer_name, payment_mode)
        VALUES (@sold_by, @customer_name, @payment_mode);
        SET @sale_id = SCOPE_IDENTITY();

        DECLARE @med INT, @need INT, @take INT, @batch INT, @avail INT, @price DECIMAL(10,2);
        DECLARE item_cur CURSOR LOCAL FAST_FORWARD FOR
            SELECT medicine_id, quantity
            FROM OPENJSON(@items) WITH (
                medicine_id INT '$.medicine_id', 
                quantity INT '$.quantity'
            );

        OPEN item_cur;
        FETCH NEXT FROM item_cur INTO @med, @need;

        WHILE @@FETCH_STATUS = 0
        BEGIN
            WHILE @need > 0
            BEGIN
                SET @batch = NULL;
                -- Pick earliest-expiring unexpired batch with stock.
                -- UPDLOCK and ROWLOCK prevent concurrent sales from deducting the same inventory row.
                SELECT TOP (1) 
                    @batch = batch_id, 
                    @avail = qty_on_hand, 
                    @price = selling_price
                FROM dbo.batches WITH (UPDLOCK, ROWLOCK)
                WHERE medicine_id = @med 
                  AND status = 'ACTIVE'
                  AND qty_on_hand > 0 
                  AND expiry_date > dbo.fn_today()
                ORDER BY expiry_date ASC, batch_id ASC;

                IF @batch IS NULL
                    THROW 50001, N'Insufficient unexpired stock for a requested medicine.', 1;

                SET @take = CASE WHEN @avail < @need THEN @avail ELSE @need END;

                UPDATE dbo.batches 
                SET qty_on_hand = qty_on_hand - @take 
                WHERE batch_id = @batch;

                INSERT INTO dbo.sale_items (sale_id, batch_id, quantity, unit_price)
                VALUES (@sale_id, @batch, @take, @price);

                SET @need = @need - @take;
            END;

            FETCH NEXT FROM item_cur INTO @med, @need;
        END;

        CLOSE item_cur; 
        DEALLOCATE item_cur;

        INSERT INTO dbo.audit_log (user_id, action, table_name, record_id, new_value)
        VALUES (@sold_by, 'SALE_CREATED', 'sales', CAST(@sale_id AS NVARCHAR(40)), @items);

        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END;
GO

-- -------------------------------------------------------------
-- 6. Stored Procedure: Approve Supplier Return (usp_approve_return)
-- -------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.usp_approve_return
    @return_id INT, 
    @approved_by INT
AS
BEGIN
    SET NOCOUNT ON; 
    SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRAN;
        EXEC sp_set_session_context @key = N'user_id', @value = @approved_by;

        DECLARE @batch INT, @qty INT, @status NVARCHAR(10);
        SELECT @batch = batch_id, @qty = return_qty, @status = status
        FROM dbo.supplier_returns WITH (UPDLOCK) 
        WHERE return_id = @return_id;

        IF @batch IS NULL 
            THROW 50010, N'Return not found.', 1;
        IF @status <> 'PENDING' 
            THROW 50011, N'Return already processed.', 1;

        -- Deduct returned quantity from batch stock (CHECK constraint blocks negative)
        UPDATE dbo.batches 
        SET qty_on_hand = qty_on_hand - @qty 
        WHERE batch_id = @batch;

        UPDATE dbo.supplier_returns 
        SET status = 'APPROVED', approved_by = @approved_by
        WHERE return_id = @return_id;

        INSERT INTO dbo.audit_log (user_id, action, table_name, record_id, old_value, new_value)
        VALUES (@approved_by, 'RETURN_APPROVED', 'supplier_returns', CAST(@return_id AS NVARCHAR(40)), 'PENDING', 'APPROVED');

        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END;
GO
