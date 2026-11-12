# ExpiryGuard Rx: Entity Relationship (ER) Diagram

This document models the 13 relational tables and their cardinalities for ExpiryGuard Rx in Mermaid syntax and text representation, directly derived from `sql/01_schema.sql`.

```mermaid
erDiagram
    roles ||--o{ users : "defines role_id (1:N)"
    users ||--o{ grn : "received_by (1:N)"
    users ||--o{ sales : "sold_by (1:N)"
    users ||--o{ supplier_returns : "created_by, approved_by (1:N)"
    users ||--o{ prescription_register : "recorded_by (1:N)"
    users ||--o{ audit_log : "user_id (1:N, optional)"
    
    categories ||--o{ medicines : "category_id (1:N)"
    medicines ||--o{ batches : "medicine_id (1:N)"
    medicines ||--o{ demand_forecasts : "medicine_id (1:N)"
    medicines ||--o{ prescription_register : "medicine_id (1:N)"
    
    suppliers ||--o{ grn : "supplier_id (1:N)"
    grn ||--o{ batches : "grn_id (1:N)"
    
    batches ||--o{ sale_items : "batch_id (1:N)"
    batches ||--o{ supplier_returns : "batch_id (1:N)"
    
    sales ||--o{ sale_items : "sale_id (1:N)"
    sales ||--o{ prescription_register : "sale_id (1:N)"

    roles {
        tinyint role_id PK
        nvarchar role_name UK
    }

    users {
        int user_id PK
        nvarchar username UK
        nvarchar full_name
        nvarchar email UK
        nvarchar password_hash
        tinyint role_id FK
        bit is_active
        int failed_attempts
        datetime2 locked_until
        datetime2 created_at
    }

    categories {
        int category_id PK
        nvarchar category_name UK
    }

    medicines {
        int medicine_id PK
        nvarchar brand_name
        nvarchar generic_name
        nvarchar strength
        nvarchar dosage_form
        int category_id FK
        int reorder_level
        bit requires_prescription
        bit is_active
    }

    suppliers {
        int supplier_id PK
        nvarchar supplier_name UK
        nvarchar phone
        nvarchar email
        nvarchar city
    }

    grn {
        int grn_id PK
        int supplier_id FK
        nvarchar invoice_number
        date invoice_date
        int received_by FK
        datetime2 received_at
        nvarchar invoice_blob
        nvarchar invoice_doc_id
    }

    batches {
        int batch_id PK
        int medicine_id FK
        int grn_id FK
        nvarchar batch_number
        date expiry_date
        int qty_received
        int qty_on_hand
        decimal cost_price
        decimal selling_price
        nvarchar status
    }

    sales {
        int sale_id PK
        int sold_by FK
        datetime2 sale_time
        nvarchar customer_name
        nvarchar payment_mode
    }

    sale_items {
        int sale_item_id PK
        int sale_id FK
        int batch_id FK
        int quantity
        decimal unit_price
    }

    prescription_register {
        int register_id PK
        int sale_id FK
        int medicine_id FK
        nvarchar patient_name
        nvarchar prescriber_name
        nvarchar prescriber_reg_no
        int recorded_by FK
        datetime2 recorded_at
    }

    supplier_returns {
        int return_id PK
        int batch_id FK
        int return_qty
        nvarchar reason
        nvarchar status
        nvarchar credit_note_no
        decimal credit_amount
        int created_by FK
        int approved_by FK
        date return_date
    }

    audit_log {
        bigint audit_id PK
        datetime2 event_time
        int user_id FK
        nvarchar action
        nvarchar table_name
        nvarchar record_id
        nvarchar old_value
        nvarchar new_value
        nvarchar ip_address
    }

    demand_forecasts {
        int forecast_id PK
        int medicine_id FK
        date forecast_date
        decimal predicted_daily_units
        nvarchar method
        decimal mae
    }
```

---

## Cardinality & Relationship Summary

- **roles (1) &rarr; users (N)**: Each user belongs to exactly one role; each role classifies multiple users.
- **categories (1) &rarr; medicines (N)**: Medicines belong to one therapeutic category.
- **suppliers (1) &rarr; grn (N)**: A wholesaler supplies multiple delivery invoices over time.
- **grn (1) &rarr; batches (N)**: A single goods received note can contain multiple batch lots.
- **medicines (1) &rarr; batches (N)**: A medicine has multiple received lots with differing expiry dates and acquisition costs.
- **sales (1) &rarr; sale_items (N) &larr; batches (1)**: Resolves the many-to-many relationship between customer bills and inventory batches. `sale_items` records the historical `unit_price` at transaction time.
- **batches (1) &rarr; supplier_returns (N)**: Returns link directly to physical batch lots without replicating supplier identity (reached via `batches -> grn -> suppliers`).
- **sales (1) &rarr; prescription_register (N) &larr; medicines (1)**: Prescriptions record patient and doctor credentials for statutory Schedule H/X dispensing.
- **users (1) &rarr; audit_log (N, nullable)**: Captures who performed state mutations. System actions or anonymous failures record `NULL` for `user_id`.
