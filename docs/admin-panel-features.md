# Admin Panel — Features Walkthrough

A reference list of every user-facing feature, pattern, and polish item added
to the admin panel across Pass 1, Pass 2, and Pass 3. Use this as presentation
notes — each item has a short "what it is" and a "why it matters" line.

---

## 1. Rule-based access control (the core feature)

**What:** A policy/rule system that decides, per user, which projects,
departments, reports, and individual report columns are visible.

**How it works:** A user attaches to zero or more *policies*. Each policy
grants access to (project, department) pairs, specific reports inside those
pairs, and an allow-list of column keys per report. Effective access is the
*union* of everything the user's policies grant. Admins bypass all checks.

**Why it matters:** Sensitive columns (handling time, abandon delay, agent
IDs) can now be hidden per user without touching any code — everything is
data-driven and managed through the admin panel.

**Files:** Migration `docs/migrations/001_policy_tables.sql`, backend
`Services/PolicyService.cs`, frontend `src/pages/admin/**`.

---

## 2. Admin panel shell

**What:** A new `/admin` route tree with its own layout, sidebar navigation,
and 5 sections: Policies, Users, Departments, Project Structure, and the
Policy Editor.

**Why it matters:** All policy management is done through the UI — no SQL,
no server restarts, no config files. Admins just click around.

**Files:** `src/components/admin/AdminLayout.tsx`, `AdminSidebar.tsx`, and
the 5 pages under `src/pages/admin/`.

---

## 3. Admin-only route guard with live DB check

**What:** `/admin/**` routes are gated by `AdminOnly.tsx` on the client and
`[AdminOnly]` filter on the server. The server checks `users.is_admin` from
the database on every request — not from a JWT claim.

**Why it matters:** Demoting an admin takes effect on the next request. No
stale-claim window. The `is_admin` JWT claim was intentionally removed so no
future developer can accidentally trust it.

**Files:** `src/components/admin/AdminOnly.tsx` (frontend), backend
`Filters/AdminOnlyAttribute.cs` + `Services/PolicyService.cs`.

---

## 4. Report column schema from C# DTOs (zero manual schema seeding)

**What:** Each report's column list is *reflected* from a C# DTO class at
backend startup and stored in an in-memory registry. The admin UI fetches
this list via `GET /api/Catalog/reports/{code}/schema` when building a
policy.

**Why it matters:** Adding a new report is pure code — define a DTO, register
it in `Program.cs`, and the admin panel's column picker populates itself.
Drift between the API response and the policy picker is impossible.

**Files:** `Reports/Schema/ReportSchemaRegistry.cs`,
`Reports/Schema/ReportSchemaRegistrar.cs`, `Reports/Dtos/*`.

---

## 5. Feature-flag kill switch

**What:** `PolicyEnforcement:Enabled` in `appsettings.json`. When `false`,
every policy check short-circuits to "allow all" so the system can be
deployed without breaking existing users, then flipped on later.

**Why it matters:** Rollout safety. The entire policy system can be disabled
in seconds without a code change if a bug is found in production.

---

## 6. The Policy Editor — 3 independent tabs with dirty tracking

**What:** One screen for editing a policy. Three tabs — **Access**, **Columns**,
**Users** — each with its own Save button. A small amber dot appears next to
any tab that has unsaved local changes; a global "Unsaved changes" pill
appears next to the tab switcher when anything is dirty.

**Why it matters:** Admins can focus on one dimension at a time (grant
access, then decide which columns, then attach users) without losing
context. The dirty dots make it impossible to forget an unsaved tab.

**File:** `src/pages/admin/AdminPolicyEditorPage.tsx`.

---

## 7. Unsaved changes warning on browser close

**What:** If any policy editor tab is dirty, refreshing or closing the tab
triggers the browser's native "Leave site?" prompt.

**Why it matters:** An admin who accidentally clicks the close tab button
won't lose 15 minutes of checkbox work.

**File:** `src/pages/admin/AdminPolicyEditorPage.tsx` (`beforeunload` hook).

---

## 8. Optimistic concurrency (ETag + If-Match)

**What:** Every policy GET response carries an `ETag` header derived from
`updated_at`. Every PUT sends `If-Match` with the last seen ETag. The server
returns `412 Precondition Failed` when two admins edit the same policy at
once.

**Why it matters:** Two admins can't silently overwrite each other. The
second one to save gets a friendly "This policy was modified by another
admin. Reload the page to see their changes before saving." and has to
reload.

**Files:** backend `Controllers/AdminPoliciesController.cs` (ETag helpers),
frontend `src/services/admin.ts` (`requestWithEtag`, `ConcurrencyError`).

---

## 9. Save-button state machine (the green flash)

**What:** A reusable `<SaveButton>` component with four visual states:
- **Idle:** primary blue gradient, custom label
- **Saving:** primary gradient + spinning progress icon
- **Success:** emerald gradient + check icon, lasts 1.6 seconds
- **Back to idle**

Errors are routed through an optional `onError` callback — never silently
swallowed. Validation errors are recognized separately and skipped.

**Why it matters:** Admins get instant, unambiguous feedback. The emerald
flash confirms the save took hold; failed saves can't look identical to
successful ones anymore.

**File:** `src/components/admin/SaveButton.tsx`.

---

## 10. Inline error banners instead of native `alert()`

**What:** Every `alert()` call in the admin panel was replaced with a
reusable `<ErrorBanner>` component rendered inline at the top of the
affected page or inside the modal that triggered the error. The banner has
`role="alert"` and `aria-live="assertive"` for screen readers.

**Why it matters:** Native alerts block the main thread, break the design
language, and can't be styled. Banners stay in the app's editorial voice
and are dismissable.

**File:** `src/components/admin/ErrorBanner.tsx`.

---

## 11. Accessible Modal primitive

**What:** The `Modal` component was rewritten to meet basic dialog
accessibility:
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` wired to the title
- Focus moves into the modal on open, returns to the trigger on close
- Tab / Shift+Tab cycles within the modal (focus trap)
- Body scroll lock while open
- ESC and backdrop click both close via the same path
- Close button has `aria-label="Close dialog"`

**Why it matters:** Screen reader users can now navigate the admin panel.
Tab keys no longer escape into the page behind the modal.

**File:** `src/components/admin/Modal.tsx`.

---

## 12. Dirty-check on form modals (discard confirmation)

**What:** When a user types into the Department modal and tries to close it
(backdrop click, ESC, X button, Cancel), a secondary `<ConfirmDialog>`
appears: "Discard unsaved changes?" Only a destructive confirm actually
closes.

**Why it matters:** Nobody loses form work to a stray click. The pattern
uses the Modal's `onBeforeClose` gate so it's easy to add to any future
form modal.

**File:** `src/pages/admin/AdminDepartmentsPage.tsx`.

---

## 13. Required-field visual system

**What:** A small red asterisk (`<RequiredMark>`) next to required labels.
Inline error messages below the field with a red icon and tinted input
border on validation failure. Errors clear as the user types.

**Why it matters:** Required fields are obvious before the user hits Save,
and the validation error is adjacent to the offending field — no searching
around.

**Files:** `src/components/admin/RequiredMark.tsx`, used in
`AdminDepartmentsPage` and `AdminPolicyEditorPage`.

---

## 14. Icon upload for departments

**What:** Department icons can be uploaded as PNG/JPG/WebP files (up to
500KB). A preview shows in the modal, the file is stored in
`Assets/department-icons/` on the backend, and the filename is stored in
the `departments.icon` column. The Material Symbols name field is kept as
a fallback for quick icon picks.

**Why it matters:** Admins can brand each department with a proper logo or
icon image without asking a developer to add files to the repo.

**Files:** backend `Controllers/AdminDepartmentsController.cs` (upload +
hardened temp-then-commit write path), frontend
`src/components/DepartmentIcon.tsx` (smart renderer that picks img vs
Material Symbols based on value).

---

## 15. Skeleton loading states

**What:** Every admin page shows a skeleton layout while data is loading,
instead of a flat "Loading…" text. Tables get skeleton rows, card grids
get skeleton cards, master/detail pages get skeleton project list +
skeleton detail panel.

**Why it matters:** The perceived load time is lower, and the loading state
feels like part of the app instead of a placeholder stub.

**File:** `src/components/admin/Skeleton.tsx` (primitives + composed helpers).

---

## 16. Optimistic updates on the Project Structure page

**What:** Clicking a department or report placement checkbox updates the UI
immediately, then fires the save in the background. If the save fails, the
UI reverts to the previous state and an error banner appears.

**Why it matters:** Ticking 10 checkboxes in a row is now instant instead of
locked-and-reloading between every click.

**File:** `src/pages/admin/AdminStructurePage.tsx`.

---

## 17. Color-coded view badges in the Columns tab

**What:** Each report column in the Policy Editor's Columns tab shows
colored chips labelling which views it belongs to (raw, grouped, summary,
etc.). A legend at the top of each report's section lists the views and
column counts. Colors are picked from a fixed 8-color palette by hashing
the view name — consistent within a session, and generic for any future
report's view names.

**Why it matters:** Admins can see at a glance which columns appear in the
raw dump vs the aggregated views, and pick their policy accordingly.

**File:** `src/components/admin/ViewBadge.tsx`.

---

## 18. Login gate with admin icon in the top nav

**What:** The `admin_panel_settings` icon in the TopNavBar is rendered only
when the logged-in user is an admin. Non-admins never see it; admins click
it to jump to `/admin/policies`.

**Why it matters:** Discoverable from anywhere in the app, invisible to
everyone else. No secret URLs needed.

**File:** `src/components/layout/TopNavBar.tsx`.

---

## 19. Dashboard empty/error state for non-admin users

**What:** When a non-admin logs in and either (a) has no projects granted or
(b) the API returns an error, they see a card with an explanation and three
buttons: Retry, Open Admin (admins only), and Sign out. Previously the
dashboard hung forever on a "Loading…" spinner.

**Why it matters:** Users get a clear, actionable message instead of a
frozen page when they're missing grants or the backend is down.

**File:** `src/pages/DashboardPage.tsx`.

---

## 20. Policy-data SQL intersection (the bypass fix)

**What:** Every skillset report endpoint that accepts an optional `project`
query param now intersects the SQL WHERE clause with the caller's allowed
project names when the param is omitted. Previously a non-admin could
fetch data from every project by simply dropping the `?project=` filter.

**Why it matters:** The biggest stop-ship bug found in the backend review.
Without this fix, the entire policy system was cosmetic — a user with any
grant could read everything.

**File:** `Controllers/SkillsetReportController.cs` (`BuildProjectFilterAsync`).

---

## 21. Mobile collapsible sidebar

**What:** On screens narrower than the `lg` breakpoint (~1024px), the admin
sidebar collapses into a floating action button at the bottom-right. Tap it
and an off-canvas drawer slides in from the left with the admin section
list. Tapping a NavLink or the backdrop closes the drawer automatically;
ESC also closes it.

**Why it matters:** The admin panel is fully usable on a phone. No more
wasted vertical space at the top of every page.

**File:** `src/components/admin/AdminLayout.tsx`.

---

## 22. Mobile card fallback for admin tables

**What:** The Users and Departments tables render a stacked card list below
the `md` breakpoint (~768px) instead of forcing horizontal scroll. Each
card shows the same data in a readable vertical layout with the same
action buttons.

**Why it matters:** Tables that would be unusable on a phone (6 columns
doesn't fit in 375px) now show one card per row with everything visible.

**Files:** `src/pages/admin/AdminUsersPage.tsx`,
`src/pages/admin/AdminDepartmentsPage.tsx`.

---

## 23. Policy card action hierarchy

**What:** On the Policies list, the Edit button is now a prominent
full-width primary-gradient button with an edit icon. The Delete button is
a compact icon-only button with `aria-label`. Accidentally deleting a
policy is much harder.

**Why it matters:** The previous equal-weight layout invited accidental
deletes on a dense grid. Now the primary action dominates visually and
Delete requires deliberate aim.

**File:** `src/pages/admin/AdminPoliciesPage.tsx`.

---

## 24. Rules persistence via CLAUDE.md files

**What:** Two `CLAUDE.md` files live at the roots of the backend and
frontend repos. They encode the security, accessibility, and UX rules
distilled from a critical architect/designer review — things like "never
use `alert()`", "every form modal needs a dirty-check", "report queries
must intersect with the caller's allowed projects".

**Why it matters:** Future work on either repo automatically respects the
rules. Any AI assistant (or human developer reading `CLAUDE.md`) will see
them before touching code, so the same bugs are unlikely to come back.

**Files:** `CLAUDE.md` at both repo roots.

---

## 25. Miscellaneous quality work

- **Backend N+1 fix:** `AdminPoliciesController.List` rewrite with CTEs
  instead of 4 correlated subqueries per row
- **Backend fast-path:** `PolicyService.FilterRowsAsync` short-circuits the
  per-row dictionary allocation when the allowed column set covers every
  key in the row
- **Icon upload hardening:** write-then-commit ordering, `Path.GetFileName`
  validation on the old icon before `Path.Combine`, orphan cleanup on DB
  failure, SVG removed from the allow-list (XSS vector)
- **ViewBadge contrast bump:** darker text (`*-800` on `*-100`) and larger
  font sizes for WCAG AA compliance
- **Consistent helper text:** format rules always visible on required fields
  instead of appearing only after validation errors

---

## Open items not yet shipped (intentional, documented)

- **Audit log:** not implemented per explicit user direction. If ever needed,
  the plan is a `policy_audit` table with `(actor_user_id, action, target,
  before_json, after_json, at)` written from each admin endpoint.
- **Rate limiting on `/api/Auth/login`:** BCrypt's cost factor provides
  some resistance; not a priority for an internal-network deployment.
- **Two-database split:** locally the `Default` and `Catalog` connection
  strings point at the same PostgreSQL. The `user_policies.user_id` foreign
  key only works in that configuration. A true split deployment would need
  a migration rewrite plus a nightly reconciliation job.
- **Secrets rotation:** the Postgres password and JWT signing key need to be
  rotated and moved out of `appsettings.json` into environment variables or
  user secrets before any non-local deployment. Git history also needs to
  be scrubbed.
