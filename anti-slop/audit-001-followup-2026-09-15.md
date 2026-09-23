# antislop Audit 001 — Follow-up (items 1-8 fixed)

Fixed on 2026-09-15, approved scope: findings 1-8 from `audit-001-2026-09-15.md`. Items 9, 10, 11, and finding A (login security) were left untouched, as agreed.

## What changed

1. **R-24 Dead navigation** — created real pages: [app/sales/page.tsx](app/sales/page.tsx), [app/supply-chain/page.tsx](app/supply-chain/page.tsx), [app/operational/page.tsx](app/operational/page.tsx) (index pages linking to the existing real sub-pages), and honest "Segera hadir" placeholders for [app/finance/page.tsx](app/finance/page.tsx), [app/hr/page.tsx](app/hr/page.tsx), [app/reports/page.tsx](app/reports/page.tsx), [app/settings/page.tsx](app/settings/page.tsx) — all 7 sidebar links now resolve, none 404.

2. **R-26 Dead buttons** — [app/dashboard/page.tsx](app/dashboard/page.tsx): "Buat Penawaran Baru" now routes to `/sales/quotations/new` (real, functional). "Lihat Pesanan", "Buat Invoice", "Kelola Proyek" are `disabled` with a visible "Segera hadir" tag and a `// TODO` comment naming what needs to exist first (SalesOrder / Invoice / Project models already exist in schema, UI doesn't yet).

3. **R-38/R-23 Fabricated company name** — [app/dashboard/page.tsx](app/dashboard/page.tsx) and [components/dashboard-layout.tsx](components/dashboard-layout.tsx) now fetch the real company via `/api/companies` (the same pattern already used elsewhere in the app) instead of the hardcoded "PT Maju Jaya Kontainer". Verified live: now shows "PT. Anda", matching the seeded record.

4. **R-38 Fabricated system status** — [app/dashboard/page.tsx](app/dashboard/page.tsx): removed the unconditional "Database: Connected" / "Data Sync: Synced" claims. The card now shows only "Authentication", derived from the real session status.

5. **R-03 Mobile responsiveness** — [components/dashboard-layout.tsx](components/dashboard-layout.tsx): sidebar is now off-canvas by default under the `md` breakpoint, opens as a full overlay with a backdrop via a hamburger button in the top bar, closes on backdrop click or on navigating. Desktop behavior (collapse to icon rail) is unchanged. Verified at 375px width: no overflow, overlay opens/closes correctly, closes automatically after picking a menu item.

6. **R-02 Em dash placeholders** — replaced `"—"` with `"-"` in all 6 locations: [app/sales/rfq/page.tsx](app/sales/rfq/page.tsx), [app/operational/products/page.tsx](app/operational/products/page.tsx), [app/supply-chain/suppliers/page.tsx](app/supply-chain/suppliers/page.tsx) (×2), [app/sales/quotations/page.tsx](app/sales/quotations/page.tsx), [app/sales/customers/page.tsx](app/sales/customers/page.tsx).

7. **R-01 Gradient without purpose** — [app/health/page.tsx](app/health/page.tsx): blue-indigo gradient replaced with the app's actual slate identity (matches the login page).

8. **R-04 Decorative emoji** — [app/dashboard/page.tsx](app/dashboard/page.tsx): all emoji (➕📋💰🔧ℹ️🎯📅📚) replaced with `lucide-react` icons, matching the icon language used everywhere else in the app.

## Verification (R-35)

- `npx tsc --noEmit`: no errors.
- `npm run build`: compiled successfully, all 35 routes generated including the 7 new pages.
- Clicked through in a running dev instance: Dashboard → Sales → Customers (real seeded data), Dashboard → Supply Chain → Suppliers, Dashboard → Finance (Segera hadir, no 404). Company name and "Logged in to" text both correctly read "PT. Anda". Status Sistem card shows only Authentication: Active.
- Mobile viewport (375×812): sidebar hidden by default, hamburger opens it as an overlay, closes on backdrop click and on menu selection, no horizontal overflow.
- Table em-dash fix confirmed live on the Suppliers list (empty "Bank" column now shows `-`).
- Deployed to production (`vercel --prod`); `/dashboard`, `/sales`, `/finance` all return 307 (redirect to login when unauthenticated), confirming the routes exist and no longer 404.

## Left untouched (not in the approved scope)

- #9 (internal roadmap notes shown on the dashboard)
- #10 (generic JSX section-marker comments)
- #11 (stale comment in `app/sales/customers/new/page.tsx`)
- Finding A (login page pre-fills real admin credentials — flagged as a security issue, not an antislop rule)
