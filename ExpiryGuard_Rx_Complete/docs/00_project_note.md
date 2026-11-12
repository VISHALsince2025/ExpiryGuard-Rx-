# ExpiryGuard Rx: Project Executive Note

**Title:** ExpiryGuard Rx: A Cloud-Based Batch-Level Inventory and Expiry-Loss Prevention System for Independent Pharmacies  
**Prepared For:** Vishal  
**Date:** Sunday, 11 October 2026  

---

## 1. Problem Statement
Retail community pharmacies suffer substantial annual inventory write-offs caused by undisciplined dispensing practices, lack of batch-level visibility, and manual paper-based tracking. Expired pharmaceuticals either become complete capital losses or pose catastrophic clinical safety risks to patients if dispensed accidentally.

## 2. Target Users
1. **Admin (Owner / Super-User)**: Oversees pharmacy operations, audits logs, configures master prices and user permissions.
2. **Pharmacist (Dispensing & Stock Officer)**: Receives stock (GRN), uploads wholesaler scans, verifies doctor prescriptions, approves supplier returns.
3. **Counter Staff (Cashier)**: Operates fast point-of-sale billing enforcing FEFO (First Expiry, First Out) rules.
4. **Purchase Officer**: Manages wholesaler suppliers, identifies stock-out candidates below reorder level, initiates expiry returns, and logs credit notes.
5. **Auditor (Regulatory / Read-Only)**: Inspects immutable audit trails, reconciled stock ledgers, and compliance records.

## 3. Core Functional Pillars
1. **Zero-Trust RBAC & Session Management**: Server-side role enforcement on every endpoint, bcrypt salted password hashing (cost 12), HttpOnly SameSite=Strict cookies, and automated 5-strike account lockouts.
2. **Batch-Level Receiving & Goods Received Notes (GRN)**: Atomic multi-batch receipt recording invoice headers, individual expiry dates, acquisition costs, and scanned invoices in private cloud storage.
3. **Transactional FEFO Point-of-Sale**: Deterministic First Expiry, First Out stock deduction inside a single ACID database transaction with pessimistic row-locking (`UPDLOCK, ROWLOCK`), guaranteeing no stock shortages or overselling.
4. **Active Expiry Risk & Return Workflow**: Color-coded categorization (EXPIRED, RED $\le$30d, AMBER $\le$90d, GREEN) and a multi-step supplier return approval workflow.
5. **Predictive Analytics & Power BI Dashboard**: Time-series exponential smoothing demand projection computing units and rupee value at risk, complemented by 9 operational business intelligence KPIs.

## 4. Architectural Boundaries (Explicit Scope)
- **Included**: Batch tracking, FEFO dispensing, prescription-only registers, supplier returns, audit logs, blob storage for invoices, Cosmos DB for semi-structured documents, ML demand forecasting, Power BI data views.
- **Excluded**: Real payment gateways, hardware barcode scanners, SMS/WhatsApp gateways, multi-branch inter-warehouse transfer, mobile native apps.
