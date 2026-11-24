# Revime — Admin Dashboard (`apps/admin`)

The central administrative and moderation interface for **Revime**, built to satisfy **Chapter 8 (Dashboard Administrateur)** of the client's Cahier des charges.

This workspace provides operations teams with live monitoring, platform governance, content moderation, dispute arbitration, catalog management, and analytical reporting across the marketplace.

---

## 1. Architecture & Tech Stack

- **Framework:** [Next.js 16 (App Router)](https://nextjs.org) with React 19 and TypeScript.
- **Styling:** Custom Revime Design System utilizing pure CSS variables (`--ink`, `--paper`, `--navy`, `--line`, `--accent`, `--r-card`, `--r-pill`). Fully responsive, zero heavy external UI component bloat.
- **Visualization:** Hand-crafted, responsive SVG chart components (`FinancialTrendsChart.tsx`) with zero charting library dependencies.
- **Authentication & Authorization:** Better Auth session proxying with `AdminRoleGuard` and `@Audit` action logging.
- **Testing:** [Vitest](https://vitest.dev) for fast unit and DOM tests, including strict route-seam coverage gates (`admin-route-coverage.spec.ts`) preventing dead frontend routes or mismatched HTTP methods.

---

## 2. Chapter 8 Implementation Coverage (100% Complete)

Every sub-section of Chapter 8 of the Cahier des Charges is implemented in full:

| Section | Domain | Path | Key Capabilities |
|---|---|---|---|
| **§8.1** | **Vue d'ensemble** | `/` | 22 live KPIs (users, repairers, demandes, offers, payments, disputes), system context (Stripe test mode detection, recent activity window), and full audit log trail (`AdminAuditLog`). |
| **§8.2** | **Gestion des utilisateurs** | `/utilisateurs`, `/utilisateurs/[id]` | Account directory, multi-factor search, role & ban filtering, user detail fiche, suspension/reactivation, account deletion with PII tombstones, and impersonation audit bridge. |
| **§8.3** | **Gestion des réparateurs** | `/verifications` | Réparateur directory, SIREN/SIRET registry verification queue, document inspection, badge management (`BASIC`, `IDENTITY`, `BUSINESS`), verification revocation and restoration. |
| **§8.4** | **Gestion des demandes** | `/demandes`, `/demandes/[id]` | Real-time demand queue, category reassignment, triage, administrative hiding/unhiding, and deletion with mandatory reason tracking. |
| **§8.5** | **Gestion des offres** | `/offres` | Offer moderation and intelligence, market price comparison against competing quotes, linked demand context, and administrative withdrawal/deletion with reason logging. |
| **§8.6** | **Gestion des paiements** | `/paiements` | Financial KPI cards (GMV, protection fees, escrow holdings, refunds), transaction log, tooltip escrow breakdowns, and dispute triggers. |
| **§8.7** | **Gestion des litiges** | `/litiges` | Dispute queue, 3-tab slide-over inspection drawer (financial escrow, user cards, Boxtal shipment legs, messaging transcripts), and 3-way arbitration (`resolveRelease`, `resolveRefund`, `resolveDismiss`). |
| **§8.8** | **Gestion des signalements** | `/signalements` | Conversation reports queue, severity evaluation, reporter/reported user context, sanctions, assign/resolve workflows. |
| **§8.9** | **Catégories, marques, modèles** | `/categories` | Hierarchical taxonomy administration (root categories and subcategories), immediate `USABLE_CATEGORY` propagation, brand and model catalog CRUD with multi-category scoping. |
| **§8.10** | **Statistiques** | `/statistiques` | 9 core platform performance indicators across multi-period scopes (`7d`, `30d`, `90d`, `12m`, `all`) with trend comparisons, interactive SVG line charts, category breakdowns, response latency distributions, French department geo rankings, and active repairer leaderboard. |

---

## 3. Operational Routes & Specialized Workspaces

In addition to the 10 Cahier des Charges sections, the admin workspace includes specialized operational tooling:

- **`/attention` (Commandes à surveiller):** Monitors at-risk repair orders, tracking expiration timers and automated funds release conditions.
- **`/colis` (Étiquettes colis):** Boxtal shipping parcel label issuance, tracking numbers, and delivery failure retry triggers.
- **`/remboursement` (Remboursements manuels):** Manual refunds queue with safety controls and Stripe refund synchronisation.
- **`/login`:** Secure administrative authentication entry point with session lock-down.

---

## 4. The 9 Mandated Statistics Indicators (§8.10)

Accessible at `/statistiques`:

1. **Nombre de réparations par catégorie:** Distribution and volume of completed repairs by root category.
2. **Répartition géographique des demandes:** French department density based on 5-digit postal codes (01–95, 2A/2B, and DOM-TOM 971–976).
3. **Temps moyen de réponse:** Elapsed time from request publication to the first repairer offer (average, median, and bucket distributions: <1h, 1h–24h, >24h, sans offre).
4. **Taux d'acceptation des offres:** Percentage of submitted repair quotes accepted by clients (`accepted / total * 100`).
5. **Catégories les plus populaires:** Ranking of demand categories by volume, quote activity, and conversion rate.
6. **Réparateurs les plus actifs:** Leaderboard of top 10 repairers by quotes sent, orders won, revenue generated, and client ratings.
7. **Évolution des inscriptions:** Longitudinal growth of new client and repairer accounts.
8. **Chiffre d'affaires généré (GMV):** Gross transaction volume processed across the platform.
9. **Commissions de la plateforme:** Net platform revenue earned via buyer protection fees.

---

## 5. Security & Traceability

- **Role Gate:** Every admin route is protected by `AdminRoleGuard`. Only users with the `ADMIN` role can access backend endpoints.
- **Audit Logging:** All mutations are intercepted by `AdminAuditInterceptor` and recorded in `AdminAuditLog` with operator ID, IP, user-agent, and French action descriptors.
- **Route Seams:** Verified by `apps/api/test/admin-route-coverage.spec.ts` which statically analyzes all frontend `fetch()` paths against `AdminController` routes.
- **Dependency Injection Gates:** Tested by `apps/api/test/admin-module-di.spec.ts` to ensure all NestJS providers carry `@Injectable()` and constructor reflection metadata.

---

## 6. Running & Testing

### Development Server
```bash
npm run dev --workspace=@revime/admin
```
Navigate to [http://localhost:3000](http://localhost:3000).

### Unit & DOM Tests
```bash
npm run test --workspace=@revime/admin
```

### Typecheck
```bash
npm run typecheck --workspace=@revime/admin
```

### Production Build
```bash
npm run build --workspace=@revime/admin
```
