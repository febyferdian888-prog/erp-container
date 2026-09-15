# 🚀 Getting Started - ERP Application

## ⚡ Quick Start (5 minutes)

### 1. Prerequisites Check
```bash
node --version    # Should be v18+
npm --version     # Should be v10+
```

### 2. Start Development Server
```bash
npm install       # Install dependencies (if not done)
npm run dev       # Start dev server at http://localhost:3000
```

### 3. Login to Dashboard
- URL: http://localhost:3000
- Email: `admin@erp.local`
- Password: `admin123`
- Click Login → See Dashboard

---

## 📋 What's Ready Now

### ✅ Fully Working
- Authentication (login/logout)
- Dashboard with sidebar navigation
- UI component library (Button, Input, Card)
- Responsive design (mobile-friendly)
- Database schema (50+ tables)
- Seed data loaded

### ⏳ Coming Next
- Master data CRUD (Customers, Suppliers, Products)
- Sales module (RFQ, Quotation, Invoice)
- Tables with sorting/filtering

---

## 🎯 Core Features

### Dashboard
- Welcome section
- 4 stat cards (Orders, Revenue, Overdue, Projects)
- Quick action buttons
- System status
- Navigation to all modules

### Navigation Menu
| Menu | Path | Status |
|------|------|--------|
| Dashboard | /dashboard | ✅ Done |
| Sales | /sales | ⏳ Coming |
| Supply Chain | /supply-chain | ⏳ Coming |
| Operational | /operational | ⏳ Coming |
| Finance | /finance | ⏳ Coming |
| HR | /hr | ⏳ Coming |
| Reports | /reports | ⏳ Coming |
| Settings | /settings | ⏳ Coming |

---

## 🛠️ Useful Commands

```bash
# Development
npm run dev              # Start dev server

# Database
npm run db:push        # Push schema changes
npm run db:seed        # Load/reload demo data
npm run db:studio      # Open Prisma GUI (edit data)

# Build & Production
npm run build          # Build for production
npm start              # Start production server

# Code Quality
npm run lint           # Run ESLint
```

---

## 📁 Important Files to Know

| File | Purpose |
|------|---------|
| `app/dashboard/page.tsx` | Dashboard home page |
| `app/auth/login/page.tsx` | Login page |
| `components/dashboard-layout.tsx` | Sidebar + layout |
| `components/ui/` | Reusable UI components |
| `prisma/schema.prisma` | Database design |
| `lib/auth.ts` | Authentication logic |
| `docs/` | Documentation folder |

---

## 🔐 Security Notes

- Passwords hashed with bcryptjs
- JWT sessions via NextAuth
- Company data isolated
- All data in PostgreSQL database
- Audit logging ready

**IMPORTANT**: Create `.env.local` with:
```
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="generate-random-string"
```

---

## 🎓 Learning Path

### Day 1: Setup & Explore
- [ ] Setup database (follow SETUP_INSTRUCTIONS.md)
- [ ] Run dev server
- [ ] Login to dashboard
- [ ] Explore sidebar navigation

### Day 2: Understand Architecture
- [ ] Read `IMPLEMENTATION_PLAN.md`
- [ ] Read `docs/DATABASE_SCHEMA.md`
- [ ] Review `components/ui/` folder
- [ ] Check `lib/auth.ts`

### Day 3: Build First Feature
- [ ] Create Customer list page
- [ ] Add Customer API endpoint
- [ ] Build CRUD form
- [ ] Test end-to-end

### Day 4+: Expand Features
- [ ] Add Supplier management
- [ ] Build Sales module
- [ ] Implement Purchase order
- [ ] Add Reports

---

## 🐛 Common Issues

### "Cannot find module 'next-auth'"
```bash
npm install --save next-auth
```

### "connect ECONNREFUSED" (Database)
```bash
# Verify PostgreSQL running
psql -U postgres -d erp_container_db -c "SELECT 1"
```

### "Prisma Client not found"
```bash
rm -rf node_modules/.prisma
npx prisma generate
npm install
```

---

## 📚 Documentation Map

```
Root Level:
├── README.md                    # Overview
├── SETUP_INSTRUCTIONS.md        # Step-by-step setup
├── GETTING_STARTED.md           # This file
├── IMPLEMENTATION_PLAN.md       # Full roadmap
├── IMPLEMENTATION_STATUS.md     # Current progress
├── PHASE1_UI_SUMMARY.md         # UI components done
│
docs/ folder:
├── DATABASE_SCHEMA.md           # Database design
├── UI_COMPONENTS.md             # Component guide
├── ACCESS_CONTROL.md            # Permissions (TODO)
└── BUSINESS_RULES.md            # Business logic (TODO)
```

---

## 🎨 UI Component Quick Guide

### Using Components
```tsx
// Button
import { Button } from "@/components/ui/button"
<Button variant="default">Click</Button>

// Input
import { Input } from "@/components/ui/input"
<Input type="email" placeholder="Email" />

// Card
import { Card, CardContent } from "@/components/ui/card"
<Card><CardContent>Content</CardContent></Card>
```

### Dashboard Layout
```tsx
import { DashboardLayout } from "@/components/dashboard-layout"

export default function MyPage() {
  return (
    <DashboardLayout>
      Your page content here
    </DashboardLayout>
  )
}
```

---

## 🔍 Exploring the Database

### Via Prisma Studio (GUI)
```bash
npm run db:studio
# Opens http://localhost:5555
# Visual interface to browse & edit data
```

### Via SQL
```bash
psql -U postgres -d erp_container_db

# List all tables
\dt

# View users
SELECT * FROM users;

# View companies
SELECT code, name FROM companies;
```

---

## 📊 Technology Stack

```
Frontend:
  - Next.js 14 (App Router)
  - React 19
  - TypeScript
  - Tailwind CSS v4
  - Lucide React (icons)

Backend:
  - Next.js API routes
  - NextAuth.js (auth)

Database:
  - PostgreSQL 12+
  - Prisma ORM

Development:
  - Node.js v18+
  - npm/yarn
```

---

## ✨ Next Major Features (Roadmap)

### Tahap 2: Sales Module
- Request for Quotation (RFQ)
- Quotation management
- Sales orders
- Customer invoices
- Payment tracking

### Tahap 3: Purchasing
- Purchase requests
- Purchase orders
- Goods receipt
- Supplier invoices

### Tahap 4: Operational
- Projects & work orders
- Workshop management
- Quality control
- Material tracking

### Tahap 5: Finance
- Accounting entries
- Financial reports
- Bank reconciliation

### Tahap 6: HR
- Employee management
- Payroll
- Leave management
- Attendance

---

## 💡 Pro Tips

1. **Use Prisma Studio** to explore data visually
   ```bash
   npm run db:studio
   ```

2. **Check TypeScript types** for all data
   - Better IDE autocomplete
   - Catch errors early

3. **Use responsive classes** for mobile
   ```tsx
   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
   ```

4. **Import from indexes** for cleaner code
   ```tsx
   // Good
   import { Button, Input, Card } from "@/components/ui"
   
   // Also OK but less clean
   import { Button } from "@/components/ui/button"
   ```

5. **Use Lucide icons** for consistency
   ```tsx
   import { ShoppingCart, DollarSign, Users } from "lucide-react"
   ```

---

## 🤝 Working with Components

### Create New Component
```tsx
// components/my-component.tsx
"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export function MyComponent() {
  return (
    <Card>
      <Button>Click me</Button>
    </Card>
  )
}
```

### Use in Page
```tsx
// app/my-page/page.tsx
import { MyComponent } from "@/components/my-component"

export default function Page() {
  return <MyComponent />
}
```

---

## 📱 Testing on Mobile

### In Browser DevTools
1. Press F12 to open DevTools
2. Click mobile device icon (or Ctrl+Shift+M)
3. Select device or custom size

### Result
- Sidebar collapses automatically
- Cards stack vertically
- Touch-friendly buttons
- Readable text

---

## 🎯 Your First Task

### Suggested: Build Customer List Page

**Steps:**
1. Create file `app/sales/customers/page.tsx`
2. Add DashboardLayout
3. Create simple table showing customers
4. Add "Add Customer" button
5. Test navigation from sidebar

**Time**: ~30 minutes

---

## 📞 Need Help?

1. Check relevant documentation in `docs/` folder
2. Search code for similar examples
3. Read component code in `components/ui/`
4. Check `IMPLEMENTATION_PLAN.md` for architecture

---

## ✅ Success Checklist

After setup, you should be able to:
- [ ] Run `npm run dev` without errors
- [ ] Login with `admin@erp.local` / `admin123`
- [ ] See dashboard with sidebar
- [ ] Click menu items (they navigate)
- [ ] Sidebar collapses on mobile
- [ ] Database connected (stats cards load)
- [ ] No console errors (F12)

If all ✓, you're ready to build features!

---

**Ready to start?** → Run `npm run dev` and visit http://localhost:3000 🎉

**Want details?** → Read `SETUP_INSTRUCTIONS.md` or `IMPLEMENTATION_PLAN.md`

**Building features?** → Check `docs/UI_COMPONENTS.md` for component reference
