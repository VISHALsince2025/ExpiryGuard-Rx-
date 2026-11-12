# Role-Based Access Control (RBAC) Permissions Matrix

In ExpiryGuard Rx, Role-Based Access Control determines authorization based strictly on assigned job functions rather than individual identity. Every protected endpoint enforces server-side verification using the `require_roles(...)` dependency.

## Permission Matrix

| Capability / Functionality | Admin (1) | Pharmacist (2) | Counter (3) | Purchase (4) | Auditor (5) | Enforcing Backend Route |
|---|:---:|:---:|:---:|:---:|:---:|---|
| **Manage Users & Role Assignment** | **Y** | &mdash; | &mdash; | &mdash; | &mdash; | `GET, POST, PATCH /users` |
| **Medicines: View Master Catalog** | **Y** | **Y** | **R** | **R** | **R** | `GET /medicines` |
| **Medicines: Create & Update Master** | **Y** | **Y** | &mdash; | &mdash; | &mdash; | `POST, PATCH /medicines` |
| **Suppliers: View Wholesalers** | **Y** | **R** | &mdash; | **Y** | **R** | `GET /suppliers` |
| **Suppliers: Create & Update Wholesalers** | **Y** | &mdash; | &mdash; | **Y** | &mdash; | `POST, PATCH /suppliers` |
| **Receive Stock (GRN & Inward Batches)** | **Y** | **Y** | &mdash; | &mdash; | **R** | `POST /grn`, `GET /grn` |
| **Upload Invoice Scan** | **Y** | **Y** | &mdash; | &mdash; | &mdash; | `POST /grn/{id}/invoice` |
| **View Invoice Scan Link (SAS)** | **Y** | **Y** | &mdash; | &mdash; | **R** | `GET /grn/{id}/invoice-link` |
| **Change Batch Price or Status** | **Y** | **Y** | &mdash; | &mdash; | &mdash; | `PATCH /batches/{id}` |
| **Dispense Stock & Create Sale (FEFO)** | **Y** | **Y** | **Y** | &mdash; | **R** | `POST /sales`, `GET /sales` |
| **Prescription-Only Drug Register** | **Y** | **Y** | &mdash; | &mdash; | **R** | `POST /sales/{id}/prescription` |
| **Supplier Returns: Raise Return** | **Y** | **Y** | &mdash; | **Y** | &mdash; | `POST /returns` |
| **Supplier Returns: Approve & Deduct Stock** | **Y** | **Y** | &mdash; | &mdash; | &mdash; | `POST /returns/{id}/approve` |
| **Supplier Returns: Record Credit Note** | **Y** | &mdash; | &mdash; | **Y** | &mdash; | `PATCH /returns/{id}/credit` |
| **Expiry Alerts & Demand Risk Forecast** | **Y** | **Y** | **R** | **Y** | **R** | `GET /alerts/expiry`, `GET /forecast/{id}` |
| **Executive Reports & KPIs** | **Y** | **Y** | &mdash; | **Y** | **R** | `GET /reports/kpis` |
| **Compliance Audit Trail** | **Y** | &mdash; | &mdash; | &mdash; | **R** | `GET /audit` |

**Legend:**
- **Y**: Full Execution / Write / Approval Permission
- **R**: Read-Only Access
- **&mdash;**: Strictly Forbidden (Server returns HTTP 403 Forbidden)
