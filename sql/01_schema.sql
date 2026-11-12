-- sql/01_schema.sql (T-SQL for Azure SQL Database / SQL Server)
-- ExpiryGuard Rx: 13 Tables with primary keys, foreign keys, CHECK constraints, UNIQUE constraints

-- 1. Roles table
CREATE TABLE dbo.roles (
    role_id TINYINT NOT NULL CONSTRAINT PK_roles PRIMARY KEY,
    role_name NVARCHAR(30) NOT NULL CONSTRAINT UQ_roles_name UNIQUE
);

-- 2. Users table
CREATE TABLE dbo.users (
    user_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_users PRIMARY KEY,
    username NVARCHAR(50) NOT NULL CONSTRAINT UQ_users_username UNIQUE,
    full_name NVARCHAR(100) NOT NULL,
    email NVARCHAR(120) NOT NULL CONSTRAINT UQ_users_email UNIQUE,
    password_hash NVARCHAR(100) NOT NULL, -- bcrypt output is 60 characters
    role_id TINYINT NOT NULL CONSTRAINT FK_users_role REFERENCES dbo.roles(role_id),
    is_active BIT NOT NULL CONSTRAINT DF_users_active DEFAULT 1,
    failed_attempts INT NOT NULL CONSTRAINT DF_users_failed DEFAULT 0,
    locked_until DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_users_created DEFAULT SYSUTCDATETIME()
);

-- 3. Categories table
CREATE TABLE dbo.categories (
    category_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_categories PRIMARY KEY,
    category_name NVARCHAR(80) NOT NULL CONSTRAINT UQ_categories_name UNIQUE
);

-- 4. Medicines table
CREATE TABLE dbo.medicines (
    medicine_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_medicines PRIMARY KEY,
    brand_name NVARCHAR(120) NOT NULL,
    generic_name NVARCHAR(120) NOT NULL,
    strength NVARCHAR(40) NOT NULL,
    dosage_form NVARCHAR(30) NOT NULL,
    category_id INT NOT NULL CONSTRAINT FK_med_category REFERENCES dbo.categories(category_id),
    reorder_level INT NOT NULL CONSTRAINT CK_med_reorder CHECK (reorder_level >= 0),
    requires_prescription BIT NOT NULL CONSTRAINT DF_med_rx DEFAULT 0,
    is_active BIT NOT NULL CONSTRAINT DF_med_active DEFAULT 1,
    CONSTRAINT UQ_med_identity UNIQUE (brand_name, strength, dosage_form)
);

-- 5. Suppliers table
CREATE TABLE dbo.suppliers (
    supplier_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_suppliers PRIMARY KEY,
    supplier_name NVARCHAR(120) NOT NULL CONSTRAINT UQ_suppliers_name UNIQUE,
    phone NVARCHAR(20) NULL,
    email NVARCHAR(120) NULL,
    city NVARCHAR(60) NULL
);

-- 6. Goods Received Note (GRN) table
CREATE TABLE dbo.grn (
    grn_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_grn PRIMARY KEY,
    supplier_id INT NOT NULL CONSTRAINT FK_grn_supplier REFERENCES dbo.suppliers(supplier_id),
    invoice_number NVARCHAR(50) NOT NULL,
    invoice_date DATE NOT NULL,
    received_by INT NOT NULL CONSTRAINT FK_grn_user REFERENCES dbo.users(user_id),
    received_at DATETIME2 NOT NULL CONSTRAINT DF_grn_received DEFAULT SYSUTCDATETIME(),
    invoice_blob NVARCHAR(300) NULL, -- blob name of the scanned invoice (unstructured)
    invoice_doc_id NVARCHAR(64) NULL, -- id of the invoice JSON document in Cosmos DB (semi-structured)
    CONSTRAINT UQ_grn_supplier_invoice UNIQUE (supplier_id, invoice_number)
);

-- 7. Batches table
CREATE TABLE dbo.batches (
    batch_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_batches PRIMARY KEY,
    medicine_id INT NOT NULL CONSTRAINT FK_batch_medicine REFERENCES dbo.medicines(medicine_id),
    grn_id INT NOT NULL CONSTRAINT FK_batch_grn REFERENCES dbo.grn(grn_id),
    batch_number NVARCHAR(40) NOT NULL,
    expiry_date DATE NOT NULL,
    qty_received INT NOT NULL CONSTRAINT CK_batch_received CHECK (qty_received > 0),
    qty_on_hand INT NOT NULL CONSTRAINT CK_batch_onhand CHECK (qty_on_hand >= 0),
    cost_price DECIMAL(10,2) NOT NULL CONSTRAINT CK_batch_cost CHECK (cost_price >= 0),
    selling_price DECIMAL(10,2) NOT NULL CONSTRAINT CK_batch_sell CHECK (selling_price >= 0),
    status NVARCHAR(12) NOT NULL CONSTRAINT DF_batch_status DEFAULT 'ACTIVE'
        CONSTRAINT CK_batch_status CHECK (status IN ('ACTIVE','EXPIRED','RETURNED','WRITTEN_OFF')),
    CONSTRAINT UQ_batch_identity UNIQUE (medicine_id, batch_number),
    CONSTRAINT CK_batch_not_more CHECK (qty_on_hand <= qty_received)
);

-- 8. Sales table
CREATE TABLE dbo.sales (
    sale_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_sales PRIMARY KEY,
    sold_by INT NOT NULL CONSTRAINT FK_sales_user REFERENCES dbo.users(user_id),
    sale_time DATETIME2 NOT NULL CONSTRAINT DF_sales_time DEFAULT SYSUTCDATETIME(),
    customer_name NVARCHAR(100) NULL,
    payment_mode NVARCHAR(10) NOT NULL CONSTRAINT CK_sales_pay CHECK (payment_mode IN ('CASH','UPI','CARD'))
);

-- 9. Sale Items table
CREATE TABLE dbo.sale_items (
    sale_item_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_sale_items PRIMARY KEY,
    sale_id INT NOT NULL CONSTRAINT FK_si_sale REFERENCES dbo.sales(sale_id),
    batch_id INT NOT NULL CONSTRAINT FK_si_batch REFERENCES dbo.batches(batch_id),
    quantity INT NOT NULL CONSTRAINT CK_si_qty CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CONSTRAINT CK_si_price CHECK (unit_price >= 0),
    CONSTRAINT UQ_si_sale_batch UNIQUE (sale_id, batch_id)
);

-- 10. Prescription Register table
CREATE TABLE dbo.prescription_register (
    register_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rx_register PRIMARY KEY,
    sale_id INT NOT NULL CONSTRAINT FK_rx_sale REFERENCES dbo.sales(sale_id),
    medicine_id INT NOT NULL CONSTRAINT FK_rx_med REFERENCES dbo.medicines(medicine_id),
    patient_name NVARCHAR(100) NOT NULL, -- dummy names only
    prescriber_name NVARCHAR(100) NOT NULL,
    prescriber_reg_no NVARCHAR(40) NOT NULL,
    recorded_by INT NOT NULL CONSTRAINT FK_rx_user REFERENCES dbo.users(user_id),
    recorded_at DATETIME2 NOT NULL CONSTRAINT DF_rx_time DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_rx_sale_med UNIQUE (sale_id, medicine_id)
);

-- 11. Supplier Returns table
CREATE TABLE dbo.supplier_returns (
    return_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_returns PRIMARY KEY,
    batch_id INT NOT NULL CONSTRAINT FK_ret_batch REFERENCES dbo.batches(batch_id),
    return_qty INT NOT NULL CONSTRAINT CK_ret_qty CHECK (return_qty > 0),
    reason NVARCHAR(12) NOT NULL CONSTRAINT CK_ret_reason CHECK (reason IN ('NEAR_EXPIRY','EXPIRED','DAMAGED','RECALL')),
    status NVARCHAR(10) NOT NULL CONSTRAINT DF_ret_status DEFAULT 'PENDING'
        CONSTRAINT CK_ret_status CHECK (status IN ('PENDING','APPROVED','CREDITED')),
    credit_note_no NVARCHAR(40) NULL,
    credit_amount DECIMAL(12,2) NULL CONSTRAINT CK_ret_credit CHECK (credit_amount IS NULL OR credit_amount >= 0),
    created_by INT NOT NULL CONSTRAINT FK_ret_creator REFERENCES dbo.users(user_id),
    approved_by INT NULL CONSTRAINT FK_ret_approver REFERENCES dbo.users(user_id),
    return_date DATE NOT NULL CONSTRAINT DF_ret_date DEFAULT CAST(SYSUTCDATETIME() AS DATE)
);

-- 12. Audit Log table
CREATE TABLE dbo.audit_log (
    audit_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_audit PRIMARY KEY,
    event_time DATETIME2 NOT NULL CONSTRAINT DF_audit_time DEFAULT SYSUTCDATETIME(),
    user_id INT NULL CONSTRAINT FK_audit_user REFERENCES dbo.users(user_id),
    action NVARCHAR(40) NOT NULL,
    table_name NVARCHAR(60) NOT NULL,
    record_id NVARCHAR(40) NULL,
    old_value NVARCHAR(MAX) NULL,
    new_value NVARCHAR(MAX) NULL,
    ip_address NVARCHAR(45) NULL
);

-- 13. Demand Forecasts table
CREATE TABLE dbo.demand_forecasts (
    forecast_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_forecasts PRIMARY KEY,
    medicine_id INT NOT NULL CONSTRAINT FK_fc_med REFERENCES dbo.medicines(medicine_id),
    forecast_date DATE NOT NULL,
    predicted_daily_units DECIMAL(10,2) NOT NULL CONSTRAINT CK_fc_pred CHECK (predicted_daily_units >= 0),
    method NVARCHAR(30) NOT NULL,
    mae DECIMAL(10,2) NULL,
    CONSTRAINT UQ_fc_med_date UNIQUE (medicine_id, forecast_date)
);

-- Seed initial roles (1: Admin, 2: Pharmacist, 3: Counter, 4: Purchase, 5: Auditor)
INSERT INTO dbo.roles (role_id, role_name) VALUES
    (1, 'Admin'),
    (2, 'Pharmacist'),
    (3, 'Counter'),
    (4, 'Purchase'),
    (5, 'Auditor');
