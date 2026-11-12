# Database Architecture Notes & 3NF Justification

## 1. Relational Schema Normalization (3NF Justification)

In Third Normal Form (3NF):
- **1NF**: Every cell contains atomic (scalar) values.
- **2NF**: All non-key attributes are fully functionally dependent on the entire primary key.
- **3NF**: Non-key columns depend only on the candidate key and exhibit no transitive dependencies.

### Entity Decomposition Breakdown
- **`roles` / `users`**: Role names are stored strictly once in `dbo.roles`. The `dbo.users` table holds foreign key `role_id`. Role name mutation occurs in exactly one row without cascading updates.
- **`categories` / `medicines`**: Category descriptions reside exclusively in `dbo.categories`. The `dbo.medicines` entity stores only intrinsic pharmaceutical facts (brand name, generic name, strength, dosage form).
- **`suppliers` / `grn`**: Wholesaler contact attributes (name, phone, email, city) reside in `dbo.suppliers`. Goods Received Notes (`dbo.grn`) store invoice references and receipt metadata tied by `supplier_id`.
- **`batches`**: Each record isolates a discrete physical delivery lot: batch identifier, expiry timestamp, acquired quantities, and unit pricing. Medicine identity is referenced via `medicine_id` without textual repetition.
- **`sale_items`**: One line per lot dispensed per invoice. `unit_price` captures an immutable historical snapshot at the precise time of dispensing, safeguarding financial accuracy against future master price revisions.
- **`supplier_returns`**: Retains foreign link to `batch_id`. Wholesaler relationships are resolved naturally via `batches -> grn -> suppliers`, preventing redundant denormalized vendor linkages.

### Deliberately Computed Values (Not Stored)
To eliminate duplicate representation and anomalies:
- **Bill Total**: Computed dynamically via `dbo.v_sale_bill` aggregate view from `sale_items`.
- **Stock by Medicine**: Computed dynamically via `SUM(qty_on_hand)` over unexpired active batches.
- **Days to Expiry**: Evaluated dynamically using `DATEDIFF(DAY, dbo.fn_today(), expiry_date)`.

---

## 2. Controlled Denormalization Defense: `batches.qty_on_hand`

`dbo.batches.qty_on_hand` stores a live balance. Strictly, inventory balance can be derived as:
$$\text{qty\_on\_hand} = \text{qty\_received} - \sum(\text{sold}) - \sum(\text{returned})$$

### Rationale for Controlled Denormalization:
1. **Dispensing Performance & Hot-Path Latency**: Pharmacy sales counters demand sub-millisecond stock availability checks. Computing dynamic sums across millions of historical transaction rows during peak counter dispensing induces table-scan bottlenecks.
2. **Deterministic Pessimistic Row Locking**: Row-level locking on a single integer column (`UPDLOCK, ROWLOCK`) ensures atomic serializability during high-frequency concurrent checkout.

### Four Defensive Guarantees:
1. **CHECK Constraints**: 
   - `CK_batch_onhand`: `qty_on_hand >= 0` (strictly stops negative inventory).
   - `CK_batch_not_more`: `qty_on_hand <= qty_received` (prevents phantom stock creation).
2. **Transaction Boundaries**: Balance reductions occur exclusively inside ACID transactions (`dbo.usp_create_sale` and `dbo.usp_approve_return`).
3. **Automated Audit Trigger**: `dbo.trg_batches_audit` intercepts every column update and writes prior/posterior balances to `dbo.audit_log`.
4. **Automated Reconciliation**: Query Q12 executes continuous reconciliation between physical balance and transaction ledger.

---

## 3. Concurrency & Isolation Strategy
- **`UPDLOCK, ROWLOCK`**: Used in stored procedures to prevent race conditions (lost updates) when two counter terminals attempt to dispense the final available unit simultaneously. The second transaction waits until the first commits or aborts.
- **`SESSION_CONTEXT(N'user_id')`**: Propagates authenticated application user context down to database engine triggers for audit attribution.
