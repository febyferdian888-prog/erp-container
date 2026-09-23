# antislop Audit 001 — Follow-up 2 (items 9-11 fixed)

Fixed on 2026-09-15, approved scope: findings 9-11 from `audit-001-2026-09-15.md`. Finding A (login security) remains untouched.

## What changed

**#9 — C-3, internal roadmap notes on the dashboard.** Removed the entire "Informasi Sistem" card from [app/dashboard/page.tsx](app/dashboard/page.tsx) ("Tahap Implementasi", "Next Phase", pointer to `docs/`). That content is dev/PM scaffolding, not something a sales or finance user needs every time they log in. Unused icon imports (`Info`, `Target`, `CalendarClock`, `BookOpen`) were removed with it.

**#10 — antislop-code, generic comments.** Scope guardrail respected throughout: only comments were touched, no executable code, logic, or JSX structure changed. Two categories:

- **Empty-label JSX section markers** (`{/* Header */}`, `{/* Search */}`, `{/* Table */}`, `{/* Form Actions */}`, `{/* Basic Info */}`, etc.) removed from: [app/dashboard/page.tsx](app/dashboard/page.tsx), [components/dashboard-layout.tsx](components/dashboard-layout.tsx), [app/supply-chain/suppliers/page.tsx](app/supply-chain/suppliers/page.tsx), [app/supply-chain/suppliers/form.tsx](app/supply-chain/suppliers/form.tsx), [app/sales/rfq/page.tsx](app/sales/rfq/page.tsx), [app/sales/customers/page.tsx](app/sales/customers/page.tsx), [app/sales/customers/form.tsx](app/sales/customers/form.tsx), [app/sales/quotations/page.tsx](app/sales/quotations/page.tsx), [app/sales/quotations/form.tsx](app/sales/quotations/form.tsx), [app/operational/products/page.tsx](app/operational/products/page.tsx), [app/operational/products/form.tsx](app/operational/products/form.tsx), [components/ui/index.ts](components/ui/index.ts).
- **Workflow-narration / restating-the-obvious comments** removed from: [app/api/admin/setup/route.ts](app/api/admin/setup/route.ts) (`// Create Units`, `// Create Categories`, ... 9 in total), [app/api/companies/route.ts](app/api/companies/route.ts), [app/api/customers/route.ts](app/api/customers/route.ts) (3), [app/api/customers/[id]/route.ts](app/api/customers/[id]/route.ts) (2), [app/api/rfqs/route.ts](app/api/rfqs/route.ts) (2), [app/api/quotations/route.ts](app/api/quotations/route.ts), [app/sales/rfq/new/page.tsx](app/sales/rfq/new/page.tsx), [app/sales/quotations/form.tsx](app/sales/quotations/form.tsx) (2), [lib/auth.ts](lib/auth.ts).

**Deliberately kept** (per antislop-code's "Not a Ban" list — these explain something the code doesn't already show):
- `app/api/payments/route.ts:85` — `// Update invoice paid amount`, explains a side effect of recording a payment.
- `app/api/customers/[id]/route.ts` — `// Soft delete`, clarifies that a handler named `DELETE` doesn't actually hard-delete the row.
- `app/api/quotations/[id]/route.ts:70` — `// Delete old items and create new ones`, documents a deliberate replace-all update strategy that isn't obvious from the code shape alone.
- `app/sales/customers/new/page.tsx:20,23` — explain the real, still-current hardcoded single-company assumption.
- 3 `// TODO` comments on the dashboard's disabled Quick Action buttons — these carry the information needed to know when each one can be re-enabled.

**#11 — stale comment.** Removed the inaccurate `// Fallback: will need to create /api/companies endpoint` in [app/sales/customers/new/page.tsx:35](app/sales/customers/new/page.tsx#L35) — that endpoint already exists and is called two lines above. The two comments above it (explaining the hardcoded single-company assumption) were left as-is; they're accurate and valuable.

## Verification (R-35)

- `npx tsc --noEmit`: no errors.
- `npm run build`: compiled successfully, all 35 routes generated, unchanged from the previous build.
- Ran the app, navigated to `/dashboard`: renders correctly, "Informasi Sistem" card is gone, page ends cleanly after "Status Sistem", company name still resolves to "PT. Anda", no visual regression.
- Deployed to production (`vercel --prod`); `/dashboard` returns 307 (redirect to login), confirming the route still works.

## Left untouched

- Finding A (login page pre-fills real admin credentials) — flagged as a security issue outside antislop's rule set, not requested for this pass.
- A pre-existing unrelated issue noticed in passing while reading `app/api/customers/route.ts` (not part of any numbered finding, not fixed): the `POST` handler's membership lookup uses `roleId: ""` as part of a composite-key `where` clause with the comment "Will be filled by DB constraint" — that comment was left alone since it's attached to logic, and the guardrail for this pass was comments-only. Worth a look separately if customer creation is silently failing authorization checks.
