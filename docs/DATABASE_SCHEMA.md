# Database Schema Documentation

## Overview

Database dirancang untuk mendukung aplikasi ERP multi-tenant dengan fitur:
- **Multi-Company**: 2-3 PT independent dengan data terissolasi
- **Role-Based Access Control**: Berbagai peran dengan permissions berbeda
- **Complete Transaction Trail**: Audit logging untuk setiap perubahan
- **Operational Flexibility**: Support workshop internal, supplier eksternal, dan kombinasi

---

## Core Entities

### 1. Authentication & Users

#### `users`
```sql
- id (UUID)
- email (UNIQUE)
- name
- password (bcryptjs hashed)
- isActive
- lastLogin
- createdAt, updatedAt, deletedAt (soft delete)
```

#### `user_sessions`
```sql
- id (UUID)
- userId (FK → users)
- token (UNIQUE JWT)
- expiresAt
```

#### `roles`
```sql
- id (UUID)
- name (UNIQUE) -- Owner, Sales, Purchasing, Operational, Finance, HR
- description
- isSystem (true untuk built-in roles)
```

#### `user_memberships`
```sql
- id (UUID)
- userId (FK → users)
- companyId (FK → companies)
- roleId (FK → roles)
- isActive
- Unique: [userId, companyId, roleId]
```

**Key Constraints**: 
- Soft deletes pada users untuk audit trail
- Memberships mendefinisikan akses per company per role

---

### 2. Organization & Companies

#### `companies`
```sql
- id (UUID)
- code (UNIQUE) -- PT-A, PT-B, PT-C
- name
- logo (URL/path)
- address, city, province, country, postalCode
- npwp (Tax ID)
- phone, email
- bankAccount, bankName
- currency (default: IDR)
- timezone (default: Asia/Jakarta)
- isActive
- createdAt, updatedAt, deletedAt (soft delete)
```

**Ownership**: 
- Setiap company memiliki independensi data
- Transaksi antar-PT harus explicit dan tracked

---

### 3. Master Data - Customers & Suppliers

#### `customers`
```sql
- id (UUID)
- companyId (FK → companies)
- code (UNIQUE per company) -- CUST-001, CUST-002
- name
- address, city, province, country, postalCode
- phone, email
- npwp (Tax ID)
- isActive
- createdAt, updatedAt, deletedAt (soft delete)
```

#### `customer_contacts`
```sql
- id (UUID)
- customerId (FK → customers)
- name, phone, email, position
- isDefault
- createdAt, updatedAt, deletedAt
```

#### `suppliers`
```sql
- id (UUID)
- companyId (FK → companies)
- code (UNIQUE per company) -- SUPP-001, SUPP-002
- name
- address, city, province, country, postalCode
- phone, email
- npwp (Tax ID)
- bankAccount, bankName
- isActive
- createdAt, updatedAt, deletedAt (soft delete)
```

#### `supplier_contacts`
```sql
- id (UUID)
- supplierId (FK → suppliers)
- name, phone, email, position
- isDefault
- createdAt, updatedAt, deletedAt
```

**Isolation**: 
- Customers/Suppliers per-company isolation
- Tapi directory bersama dalam grup untuk referensi

---

### 4. Products & Inventory

#### `product_categories`
```sql
- id (UUID)
- name
- description
- isActive
```

#### `units`
```sql
- id (UUID)
- code (UNIQUE) -- M, KG, PCS
- name
- description
- isActive
```

#### `products`
```sql
- id (UUID)
- companyId (FK → companies)
- categoryId (FK → product_categories)
- sku (UNIQUE per company) -- SKU per company
- name
- description
- unitId (FK → units)
- standardPrice (DECIMAL 19,2)
- isActive
- createdAt, updatedAt, deletedAt
```

#### `warehouses`
```sql
- id (UUID)
- companyId (FK → companies)
- code (UNIQUE per company) -- WH-01, WS-01 (Workshop)
- name
- type (warehouse | workshop)
- description
- address
- isActive
- createdAt, updatedAt, deletedAt
```

#### `locations`
```sql
- id (UUID)
- warehouseId (FK → warehouses)
- code (UNIQUE per warehouse) -- RAK-A1, RAK-A2
- name
- description
- isActive
```

#### `stocks`
```sql
- id (UUID)
- warehouseId (FK → warehouses)
- locationId (FK → locations, nullable)
- productId (FK → products)
- quantity (DECIMAL 19,4)
- minimumStock (DECIMAL 19,4)
- lastCountedAt
- Unique: [warehouseId, locationId, productId]
```

#### `stock_movements`
```sql
- id (UUID)
- warehouseId (FK → warehouses)
- productId (FK → products)
- unitId (FK → units)
- referenceType (PO, InvoiceOut, Adjustment, BOMUsage, etc.)
- referenceId (reference ID)
- quantity (DECIMAL 19,4)
- type (IN, OUT, ADJUSTMENT)
- reason (Penerimaan, Return, Scrap, etc.)
- notes
- createdBy (user ID)
- createdAt, updatedAt
```

**Key Concepts**:
- Stocks calculated dari stock_movements (audit trail)
- Tidak ada direct stock updates, hanya melalui movements
- Reservations dapat dicatat via movements dengan type RESERVED

---

### 5. Sales Module

#### `rfqs` (Request for Quotation)
```sql
- id (UUID)
- companyId (FK → companies)
- customerId (FK → customers)
- number (UNIQUE per company) -- RFQ-2024-001
- title, description
- requestDate, targetDate
- status (draft, sent, quoted, closed, cancelled)
- notes
- createdBy, createdAt, updatedAt, deletedAt
```

#### `rfq_items`
```sql
- id (UUID)
- rfqId (FK → rfqs)
- lineNumber
- description, quantity, unit
- notes
- Unique: [rfqId, lineNumber]
```

#### `quotations`
```sql
- id (UUID)
- companyId (FK → companies)
- customerId (FK → customers)
- rfqId (FK → rfqs, nullable)
- number (UNIQUE per company) -- QT-2024-001
- revisionNumber (default: 1)
- quotationDate, expiryDate
- paymentTerms (DP 30%, Progress 40%, Final 30%)
- validityDays (default: 14)
- status (draft, sent, accepted, rejected, expired, cancelled)
- notes
- createdBy, createdAt, updatedAt, deletedAt
```

#### `quotation_items`
```sql
- id (UUID)
- quotationId (FK → quotations)
- lineNumber
- description, quantity, unit
- unitPrice (DECIMAL 19,2)
- subtotal (DECIMAL 19,2) -- qty * unitPrice
- notes
- Unique: [quotationId, lineNumber]
```

#### `quotation_revisions`
```sql
- id (UUID)
- quotationId (FK → quotations)
- revisionNumber
- changes (JSON diff)
- changedBy, changedAt
- Unique: [quotationId, revisionNumber]
```

#### `sales_orders`
```sql
- id (UUID)
- companyId (FK → companies)
- customerId (FK → customers)
- quotationId (FK → quotations, nullable)
- poNumber (customer PO number)
- poDate
- soNumber (UNIQUE per company) -- SO-2024-001
- projectId (FK → projects, nullable)
- status (draft, confirmed, partial_delivered, delivered, invoiced, cancelled)
- deliveryDate
- notes
- createdBy, createdAt, updatedAt, deletedAt
```

#### `sales_order_items`
```sql
- id (UUID)
- soId (FK → sales_orders)
- lineNumber
- description, quantity, unit
- unitPrice (DECIMAL 19,2)
- subtotal (DECIMAL 19,2)
- notes
- Unique: [soId, lineNumber]
```

**Key Rules**:
- Quotation → Sales Order harus dari customer PO
- Satu PO dapat multiple deliveries & invoices
- Status tracking terpisah: approval, fulfillment, billing, payment

---

### 6. Operational Module - Projects

#### `projects`
```sql
- id (UUID)
- companyId (FK → companies)
- customerId (FK → customers, nullable)
- soId (FK → sales_orders, nullable)
- projectNumber (UNIQUE per company) -- PRJ-2024-001
- projectName
- description
- executionMethod (supplier | internal_workshop | combination)
- startDate, targetEndDate, actualEndDate
- budget (DECIMAL 19,2)
- status (planned, in_progress, on_hold, completed, cancelled)
- responsible (user ID)
- notes
- createdBy, createdAt, updatedAt, deletedAt
```

#### `project_stages`
```sql
- id (UUID)
- projectId (FK → projects)
- stageNumber
- stageName (Persiapan, Struktur, Interior, Instalasi, Pengecatan, QC)
- description
- progressWeight (bobot untuk progress %)
- status (pending, in_progress, completed, on_hold)
- actualStartDate, actualEndDate
- Unique: [projectId, stageNumber]
```

#### `work_orders` (SPK)
```sql
- id (UUID)
- companyId (FK → companies)
- projectId (FK → projects)
- orderNumber (UNIQUE per company) -- SPK-2024-001
- title, description
- status (draft, released, in_progress, completed, cancelled)
- startDate, targetEndDate, actualEndDate
- notes
- createdBy, createdAt, updatedAt, deletedAt
```

#### `boms` (Bill of Materials)
```sql
- id (UUID)
- projectId (FK → projects)
- bomNumber
- version (default: 1)
- title, description
- status (draft, active, superseded)
- createdBy, approvedBy, approvedAt
- createdAt, updatedAt, deletedAt
- Unique: [projectId, bomNumber, version]
```

#### `bom_items`
```sql
- id (UUID)
- bomId (FK → boms)
- productId (FK → products)
- unitId (FK → units)
- lineNumber
- quantity (DECIMAL 19,4)
- unitPrice (DECIMAL 19,2)
- notes
- Unique: [bomId, lineNumber]
```

**Concepts**:
- Project dapat punya multiple execution methods
- Stages untuk tracking progress
- Work orders untuk detail pekerjaan
- BOMs untuk material planning & tracking

---

### 7. Purchase Module

#### `purchase_orders`
```sql
- id (UUID)
- companyId (FK → companies)
- supplierId (FK → suppliers)
- projectId (FK → projects, nullable)
- poNumber (UNIQUE per company) -- PO-2024-001
- poDate, deliveryDate
- paymentTerms
- notes
- status (draft, sent, confirmed, partial_received, received, invoiced, cancelled)
- createdBy, createdAt, updatedAt, deletedAt
```

#### `purchase_order_items`
```sql
- id (UUID)
- poId (FK → purchase_orders)
- productId (FK → products, nullable)
- lineNumber
- description, quantity, unit
- unitPrice (DECIMAL 19,2)
- subtotal (DECIMAL 19,2)
- receivedQty (DECIMAL 19,4) -- untuk partial receipt
- invoicedQty (DECIMAL 19,4) -- untuk partial invoicing
- notes
- Unique: [poId, lineNumber]
```

#### `goods_receipts` (GR)
```sql
- id (UUID)
- companyId (FK → companies)
- poId (FK → purchase_orders)
- receiptNumber (UNIQUE per company) -- GR-2024-001
- receiptDate
- status (draft, received, inspected, accepted, rejected)
- notes
- createdBy, createdAt, updatedAt, deletedAt
```

#### `goods_receipt_items`
```sql
- id (UUID)
- grId (FK → goods_receipts)
- poItemId (nullable reference to PO item)
- productId (FK → products, nullable)
- quantity (DECIMAL 19,4)
- unit
- condition (good | defect | partial)
- notes
- createdAt, updatedAt
```

**Key Features**:
- PO tracking (qty, received qty, invoiced qty)
- Partial receipt support
- Quality check basic (condition field)
- GR creates stock movements automatically

---

### 8. Finance Module

#### `invoices` (Customer)
```sql
- id (UUID)
- companyId (FK → companies)
- customerId (FK → customers)
- soId (FK → sales_orders, nullable)
- invoiceNumber (UNIQUE per company) -- INV-2024-001
- invoiceDate, dueDate
- paymentTerms
- status (draft, sent, partial_paid, paid, overdue, cancelled)
- totalAmount (DECIMAL 19,2)
- taxAmount (DECIMAL 19,2)
- grandTotal (DECIMAL 19,2)
- paidAmount (DECIMAL 19,2)
- notes
- createdBy, createdAt, updatedAt, deletedAt
```

#### `invoice_items`
```sql
- id (UUID)
- invoiceId (FK → invoices)
- lineNumber
- description, quantity, unit
- unitPrice (DECIMAL 19,2)
- subtotal (DECIMAL 19,2)
- notes
- Unique: [invoiceId, lineNumber]
```

#### `bills` (Supplier)
```sql
- id (UUID)
- companyId (FK → companies)
- supplierId (FK → suppliers)
- poId (FK → purchase_orders, nullable)
- billNumber (UNIQUE per company) -- BILL-2024-001
- billDate, dueDate
- paymentTerms
- status (draft, received, partial_paid, paid, overdue, cancelled)
- totalAmount (DECIMAL 19,2)
- taxAmount (DECIMAL 19,2)
- grandTotal (DECIMAL 19,2)
- paidAmount (DECIMAL 19,2)
- notes
- createdBy, createdAt, updatedAt, deletedAt
```

#### `payments`
```sql
- id (UUID)
- companyId (FK → companies)
- referenceType (Invoice | Bill)
- referenceId
- paymentNumber (UNIQUE per company) -- PAY-2024-001
- paymentDate
- amount (DECIMAL 19,2)
- method (cash | transfer | check)
- bankAccount, notes
- status (recorded, cleared, reversed)
- createdBy, createdAt, updatedAt
```

#### `payment_allocations`
```sql
- id (UUID)
- paymentId (FK → payments)
- invoiceId (FK → invoices, nullable)
- billId (FK → bills, nullable)
- amount (DECIMAL 19,2)
- createdAt, updatedAt
```

**Key Concepts**:
- Saldo invoice calculated dari payments (tidak checkbox)
- Partial payments supported via allocations
- Payment reversals untuk audit trail
- Tax amount terpisah dari amount

---

### 9. Accounting Module

#### `chart_of_accounts`
```sql
- id (UUID)
- companyId (FK → companies)
- accountCode (UNIQUE per company) -- 1000, 1100, etc.
- accountName
- accountType (Asset, Liability, Equity, Revenue, Expense)
- isActive
- createdAt, updatedAt, deletedAt
```

#### `journal_entries`
```sql
- id (UUID)
- companyId (FK → companies)
- entryNumber (UNIQUE per company) -- JE-2024-001
- entryDate
- description
- status (draft, posted, reversed)
- reversedId (jika ini reversal entry)
- createdBy, postedBy, postedAt
- createdAt, updatedAt
```

#### `journal_lines`
```sql
- id (UUID)
- journalId (FK → journal_entries)
- accountCode
- description
- debitAmount (DECIMAL 19,2)
- creditAmount (DECIMAL 19,2)
- createdAt, updatedAt
```

**Rules**:
- Journal harus seimbang (total debit = total credit)
- Reversals untuk correction, bukan deletion
- Posting locks period untuk audit

---

### 10. HR Module

#### `employees`
```sql
- id (UUID)
- companyId (FK → companies)
- employeeNumber (UNIQUE per company) -- EMP-2024-001
- name, email, phone
- address, city, province, country, postalCode
- dateOfBirth, gender, maritalStatus
- department, position
- status (active, inactive, resigned)
- hireDate, resignDate
- notes
- isActive
- createdAt, updatedAt, deletedAt
```

#### `timesheets`
```sql
- id (UUID)
- employeeId (FK → employees)
- projectId (FK → projects, nullable)
- workDate
- hoursWorked (DECIMAL 5,2)
- taskDescription, notes
- createdAt, updatedAt
```

#### `leaves`
```sql
- id (UUID)
- employeeId (FK → employees)
- leaveType (Annual, Sick, Personal, etc.)
- startDate, endDate, days
- reason
- status (pending, approved, rejected, cancelled)
- approvedBy, approvedAt
- notes
- createdAt, updatedAt
```

#### `reimbursements`
```sql
- id (UUID)
- employeeId (FK → employees)
- projectId (FK → projects, nullable)
- reimbursementNumber (UNIQUE per company) -- REIMB-2024-001
- submissionDate
- category (Transport, Meal, Accommodation, Other)
- amount (DECIMAL 19,2)
- notes
- status (pending, approved, rejected, paid)
- approvedBy, approvedAt
- createdAt, updatedAt
```

---

### 11. Cross-Cutting: Audit & Attachments

#### `attachments`
```sql
- id (UUID)
- referenceType (RFQ, Quotation, SalesOrder, Project, etc.)
- referenceId
- fileName
- fileSize (bytes)
- fileType (image, pdf, doc, etc.)
- filePath (S3 path or local)
- uploadedBy, uploadedAt
- createdAt, updatedAt, deletedAt
- Index: [referenceType, referenceId]
```

#### `audit_logs`
```sql
- id (UUID)
- userId (FK → users, nullable)
- entityType (User, Company, Product, Invoice, etc.)
- entityId
- action (CREATE, UPDATE, DELETE)
- oldValue (JSON)
- newValue (JSON)
- description
- ipAddress
- createdAt
- Index: [userId, entityType, entityId, createdAt]
```

#### `approvals`
```sql
- id (UUID)
- referenceType (Quotation, PurchaseOrder, etc.)
- referenceId
- approverRole (role required)
- status (pending, approved, rejected)
- approvedBy (user ID), approvedAt
- notes
- createdAt, updatedAt
- Index: [referenceType, referenceId, approverRole, status]
```

---

## Key Design Principles

1. **Soft Deletes**: Gunakan `deletedAt` untuk historical tracking
2. **Audit Trail**: Setiap transaksi penting tercatat
3. **Decimal for Money**: Gunakan `DECIMAL(19,2)` untuk uang
4. **Company Isolation**: Setiap query check `companyId`
5. **Transaction Atomicity**: Perubahan kompleks dalam transaction
6. **No Hardcoded Status**: Enum di code, bukan database
7. **Relationships Explicit**: Foreign keys & indexes jelas

---

## Indexes Strategy

Indexes pada:
- Foreign keys (automatic with FK constraints)
- Frequently searched columns (email, code, number)
- Status columns (for filtering)
- Date ranges (createdAt, invoiceDate, etc.)
- Composite indexes untuk queries umum

---

## Constraints & Validation

- Email uniqueness (users.email)
- Company-scoped codes (UNIQUE per company)
- Payment allocations total ≤ invoice amount
- Invoice status transitions (tidak semua transition valid)
- Journal balance (debit = credit)

---

**Last Updated**: 2026-09-15  
**Prisma Version**: Latest  
**Database**: PostgreSQL 12+
