# Relational Database Normalization: 3NF Proof & Schema Defense

## 1. Third Normal Form (3NF) Compliance Proof

A database schema is in Third Normal Form (3NF) if and only if:
1. It is in First Normal Form (1NF): Every attribute contains only atomic, indivisible values, and there are no repeating groups.
2. It is in Second Normal Form (2NF): It is in 1NF, and every non-prime attribute is fully functionally dependent on any candidate key (no partial functional dependencies).
3. It is in Third Normal Form (3NF): It is in 2NF, and every non-prime attribute is non-transitively dependent on every candidate key. Informally: *"Every non-key attribute must provide a fact about the key, the whole key, and nothing but the key."*

### Table-by-Table 3NF Analysis

| Table | Candidate Key(s) | Non-Key Columns | 3NF Justification |
|---|---|---|---|
| `roles` | `role_id`, `role_name` | None | Trivial 3NF. Master definition of system permissions. |
| `users` | `user_id`, `username`, `email` | `full_name`, `password_hash`, `role_id`, `is_active`, `failed_attempts`, `locked_until`, `created_at` | Non-key columns describe facts about the user identity only. Role details are reached via foreign key `role_id`. |
| `categories` | `category_id`, `category_name` | None | Trivial 3NF. Isolates therapeutic drug classes. |
| `medicines` | `medicine_id`, `(brand_name, strength, dosage_form)` | `generic_name`, `category_id`, `reorder_level`, `requires_prescription`, `is_active` | All attributes depend solely on the medicine identity. Category name is reached via foreign key, avoiding transitive duplication. |
| `suppliers` | `supplier_id`, `supplier_name` | `phone`, `email`, `city` | Stores vendor contact facts exclusively. |
| `grn` | `grn_id`, `(supplier_id, invoice_number)` | `invoice_date`, `received_by`, `received_at`, `invoice_blob`, `invoice_doc_id` | Represents delivery invoice metadata. Supplier attributes remain in `suppliers`. |
| `batches` | `batch_id`, `(medicine_id, batch_number)` | `grn_id`, `expiry_date`, `qty_received`, `qty_on_hand`, `cost_price`, `selling_price`, `status` | Each row models an individual received physical lot. Pricing sits on the batch because pharmaceutical MRP and cost vary by delivery. |
| `sales` | `sale_id` | `sold_by`, `sale_time`, `customer_name`, `payment_mode` | Invoice header facts. Total units and invoice sums are intentionally computed dynamically via views to prevent redundant state. |
| `sale_items` | `sale_item_id`, `(sale_id, batch_id)` | `quantity`, `unit_price` | Resolves the many-to-many relationship between sales and batches. `unit_price` captures an immutable historical price at transaction time. |
| `prescription_register` | `register_id`, `(sale_id, medicine_id)` | `patient_name`, `prescriber_name`, `prescriber_reg_no`, `recorded_by`, `recorded_at` | Statutory prescription log entries for Schedule H/X dispensing. |
| `supplier_returns` | `return_id` | `batch_id`, `return_qty`, `reason`, `status`, `credit_note_no`, `credit_amount`, `created_by`, `approved_by`, `return_date` | Isolates returned stock items. Supplier relationships are derived via `batches -> grn -> suppliers`. |
| `audit_log` | `audit_id` | `event_time`, `user_id`, `action`, `table_name`, `record_id`, `old_value`, `new_value`, `ip_address` | Immutable event log capturing audit snapshots. |
| `demand_forecasts` | `forecast_id`, `(medicine_id, forecast_date)` | `predicted_daily_units`, `method`, `mae` | ML prediction outputs per medicine and forecast date. |

---

## 2. Controlled Denormalization Defense: `batches.qty_on_hand`

### The Examination Defense
Strict Third Normal Form purity suggests `qty_on_hand` could be eliminated and derived dynamically on every read:
$$\text{qty\_on\_hand} = \text{qty\_received} - \sum(\text{sold\_quantity}) - \sum(\text{returned\_quantity})$$

We have deliberately retained `qty_on_hand` as a stored column. In academic vivas and enterprise system design, this is termed **controlled denormalization**.

### Technical Rationale:
1. **Low Latency on Hot Dispensing Paths**: Performing aggregate SUM subqueries over historical sale items during live customer checkout induces severe table-scan locks and unacceptable latency at high volumes.
2. **Deterministic Pessimistic Row Locking**: A single integer column can be locked atomically with `UPDLOCK, ROWLOCK` during concurrent checkout.

### Four Safeguards Guaranteeing Integrity:
1. **CHECK Constraints**:
   - `CK_batch_onhand`: `qty_on_hand >= 0` (guarantees stock never drops below zero).
   - `CK_batch_not_more`: `qty_on_hand <= qty_received` (prevents phantom stock expansion).
2. **Strict Transaction Boundaries**: Stock is updated only within ACID procedures (`usp_create_sale` and `usp_approve_return`).
3. **Automated Audit Trigger**: Trigger `trg_batches_audit` intercepts all updates and records old and new balances to `dbo.audit_log`.
4. **Reconciliation Query Q12**: Query Q12 evaluates physical balance against ledger calculations. In our automated test suite and production verification, **Query Q12 consistently returns exactly zero rows**.
