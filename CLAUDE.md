# Servizz Portal — Frontend Rules

This file is auto-loaded into context at the start of every Claude Code
session in this repository. It encodes non-obvious rules derived from a
critical UI/UX review of the admin panel. Treat every rule here as a hard
requirement unless the user explicitly overrides it for a specific task.

## Never use `alert()`, `confirm()`, or `prompt()`

- Browser-native dialogs break the design language, block the thread, and
  cannot be styled. They are banned for error feedback, confirmation, or
  any user-facing flow.
- For error display: render an inline `<ErrorBanner>` (see
  `src/components/admin/ErrorBanner.tsx`) at the top of the affected page
  or inside a modal's message area. Every admin page holds an `actionError`
  state that gets set on failure and cleared on success or next action.
- For confirmation: use `<ConfirmDialog>` (which itself uses the a11y-safe
  `<Modal>`). Never use native `confirm()`.
- If you need a toast-style transient notification, ask the user first —
  they explicitly ruled out toasts for this project.

## Modals must be accessible

- `src/components/admin/Modal.tsx` must always render with `role="dialog"`,
  `aria-modal="true"`, and `aria-labelledby` pointing at its title element.
- Focus must move into the modal on open (first focusable element or the
  close button) and return to the trigger element on close.
- Tab / Shift+Tab must cycle within the modal (focus trap). The existing
  Modal.tsx implements this — do not replace it with a lighter-weight
  version that omits the trap.
- The close button must have `aria-label="Close dialog"` (not just an icon).
- Body scroll must be locked while the modal is open.
- ESC closes the modal (already wired — keep it).
- Backdrop click closes too, BUT if the modal contains form inputs that can
  be dirty, the parent must pass `onBeforeClose` which returns `false` when
  dirty, then show a secondary `<ConfirmDialog>` "Discard unsaved changes?".
  See `AdminDepartmentsPage.tsx` for the reference implementation.

## SaveButton must surface errors to the caller

- `src/components/admin/SaveButton.tsx` must accept an `onError` callback.
  If the caller does not pass `onError`, the button logs the error and
  still returns to idle — but the save has silently failed, which is a
  UX hazard. Every existing caller passes `onError` → sets the page's
  `actionError` state → renders the banner.
- The button's internal state machine (idle → saving → success → idle)
  resets to idle on error. The 1.6-second emerald success flash only fires
  on a successful `await onSave()` — errors bypass it.
- When `onSave` throws `Error("validation")` or an error whose message
  starts with "validation", the `onError` handler should skip rendering a
  user-visible banner (inline field errors are already shown). Other errors
  are displayed via the banner.

## Dirty-check any modal with form input

- When a user is typing into a modal and clicks the backdrop, presses ESC,
  or clicks X, their work must not disappear silently. The parent must
  track an `initialForm` snapshot on modal open, compute `isDirty()` before
  close, and show a secondary "Discard unsaved changes?" `<ConfirmDialog>`.
- Reference implementation: `src/pages/admin/AdminDepartmentsPage.tsx`'s
  edit/create modal. Follow its pattern exactly when adding new form modals.
- Modals that show only read-only content or checkboxes tied directly to
  backend state (e.g., the user ↔ policy attach modal) do not need the
  dirty-check — they already auto-save or have an explicit Save button.

## Match the app theme — never raw hex, never ad-hoc colors

- The theme lives in `src/index.css` under `@theme`. Use only the defined
  CSS variables: `bg-primary`, `text-on-surface-variant`, `border-error`,
  `bg-surface-container-high`, etc. No raw `#2eb2ff`, no arbitrary Tailwind
  colors like `bg-blue-500`.
- Exceptions: `ViewBadge.tsx` uses Tailwind's color scales for its hash-picked
  palette. That is the only place arbitrary color scales are permitted — and
  only because the palette must generate distinct colors for arbitrary view
  names. Any other use of `bg-blue-*`, `bg-amber-*`, etc. is a style bug.
- Error state: red comes from `text-error` / `bg-error/8` / `border-error/20`.
- Success state (transient): emerald gradient for the SaveButton success
  flash only. Do not introduce green elsewhere without asking.

## Typography

- Headlines (`h1`, `h2`, `h3`, page titles, modal titles): `font-headline`
  which resolves to Public Sans.
- Body and labels: Inter (default body font, no class needed).
- Uppercase mini-labels (form labels, section headers above cards): pattern
  is `text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant/60`.
- Do not introduce new font families.
- Do not use font sizes smaller than 10px for interactive text. 9px is
  reserved for badge chips only and even there it may fail WCAG AA — Pass 2
  bumps it to 10–11px.

## Icons

- Use Material Symbols Outlined via `<span className="material-symbols-outlined">name</span>`.
- Department icons specifically: use `<DepartmentIcon icon={value} size={...} />`
  from `src/components/DepartmentIcon.tsx`. It handles both uploaded image
  filenames and Material Symbols names transparently.
- Never inline a `material-symbols-outlined` span with `{dept.icon}` content —
  it breaks the moment the value is an uploaded filename. Use `<DepartmentIcon>`.

## Empty states and errors are first-class

- Every list page must have an explicit empty state. Flat "Loading…" text
  that never resolves is a production bug (we shipped one in `DashboardPage`
  early and it hung for non-admins with no grants).
- Pattern: distinguish `isLoading` from `error` from `empty` from `hasData`,
  and render a distinct UI for each. See `src/pages/DashboardPage.tsx` lines
  47–89 for the reference empty/error card.
- Every fetch hook should expose an `error` field alongside data and loading
  (see `useDashboardData`), not swallow errors into `console.error`.

## Admin authorization

- `src/components/admin/AdminOnly.tsx` guards admin routes by reading
  `user?.isAdmin` from the auth context (which is backed by localStorage).
  This is a cosmetic gate — the backend re-enforces on every admin endpoint.
- A user with a tampered `localStorage.user` can technically render admin
  pages, but every API call from those pages will 403. Do not rely on the
  client guard for security.

## TopNavBar admin icon

- The `admin_panel_settings` icon is only rendered when `user?.isAdmin === true`.
  It is placed before the user's name and the logout button. Do not move it
  to compete visually with the notification bell; they must read as distinct
  actions.

## Consistency across admin pages

- Admin layout is `<AdminLayout>` which reuses `<TopNavBar>` and `<Footer>`.
  It is a flex column with `min-h-screen` — the main area grows to pin the
  footer to the viewport bottom when content is short. Do not re-implement
  the layout per-page.
- Sidebar is `<AdminSidebar>` with a fixed list of sections. Add new sections
  only via the `items` array in that file.
- Save semantics: pages either auto-save on toggle (`AdminStructurePage`) or
  require explicit save via `<SaveButton>` (every other admin page). Do not
  mix both on the same page. Explicit save is the default unless auto-save is
  clearly the better UX for the specific interaction.
- Tables for admin lists (Users, Departments) use the existing table patterns
  in those files. They do not yet use the `Paginator` component — if a table
  grows past ~30 rows, wire up Paginator to match `ReportViewPage`.

## Required fields

- Use `<RequiredMark>` component for the red asterisk next to the label.
- Validation runs on save attempt (not on blur). Show inline error below
  the field with a small `material-symbols-outlined` error icon and
  `text-error` text. Red-tint the input border via a conditional class swap
  (`border-error/50 focus:border-error/60` vs the default).
- Clear the field's error as the user types (`onChange` should reset
  `errors[fieldName]` to undefined).
- `RequiredMark` needs `aria-hidden="true"` (it is currently). Pair it with
  `aria-required="true"` on the input itself — Pass 2 enforces this.

## Responsive

- Mobile sidebar behavior on `/admin/**` is currently a full-width stack on
  top of content (bad UX). Pass 3 adds a collapsible drawer.
- Tables use `overflow-x-auto` on small screens. Pass 3 adds card fallbacks.
- Until those passes ship, do not design new admin pages that require
  horizontal scrolling on mobile.

## Report-style pages must use `<ReportPageHeader>`

- Every report viewer (`ReportViewPage`, IVR previews, Hourly Distribution,
  any future report page) renders its header through
  `src/components/reports/ReportPageHeader.tsx`. Do not hand-roll the
  breadcrumb + title + identity-tile layout inside a page component.
- The header always shows an identity tile that prefers the project logo
  (`project.logo` from the catalog) and falls back to the department icon
  via `<DepartmentIcon>` for dept-direct URLs with no project. Placement
  is responsive: on desktop (≥ sm) it sits at 80–96px between the title
  block and the action buttons, separated from the buttons by a thin
  vertical divider. On mobile (column stack) it shrinks to 56px and sits
  inline-left of the title. Don't relocate the tile per-page — every report
  page wears the same identity treatment.
- Breadcrumb pieces are composed via the exported
  `<BreadcrumbLink>`, `<BreadcrumbStatic>`, `<BreadcrumbChevron>`,
  `<BreadcrumbCurrent>` helpers from the same file. Don't inline the
  `text-on-surface-variant/50 hover:text-on-surface` styling — every divergence
  causes drift.
- The `actions` slot is just a `<div className="shrink-0">` — callers
  wrap their own flex layout inside (so each page can express its own
  dim-when-no-data / loading-spinner / button-state logic without the
  shared component growing flags).
- When adding a new report page: copy any existing call site
  (`ReportViewPage` is the canonical reference because it handles both URL
  shapes), pass `project={project}` + `dept={dept}` + an `accentColor`,
  and the identity tile, breadcrumb wiring, and title styling come for
  free.

## Number formatting — always via `fmt` (en-US, full digits)

- Every displayed number goes through `src/utils/fmt.ts`. Never call
  `.toLocaleString()` on a number, never `String(n)` for a numeric field,
  never `n.toFixed()` directly in JSX. (`.toLocaleString()` *is* fine on
  `Date` objects — that's date formatting, not number formatting.)
- Locale is locked to `en-US` so output is always thousand-separated
  with ASCII digits regardless of browser locale. An Arabic-locale browser
  must not render Arabic-Indic digits.
- API:
  - `fmt.int(n)`           → `1,234` (integers, never abbreviated)
  - `fmt.dec(n, places=1)` → `95.2`  (default 1 decimal place)
  - `fmt.pct(ratio, p=1)`  → `95.2%` (input is 0..1)
  - `fmt.pctFromPercent(95.2)` → `95.2%` (input is already a percent value)
  - `fmt.compact(n)`       → `12.3K` (CHART AXES ONLY)
  - `fmt.auto(v)`          → integer/decimal autodetect for generic cells
- `null`, `undefined`, `NaN`, non-finite → `"—"`. Callers do not have to
  special-case empty.
- **Full digits everywhere except chart Y-axes.** Tiles, tooltips, table
  cells, table totals, KPI eyebrows, sub-labels — all show `10,000`. Only
  Recharts `<YAxis tickFormatter={fmt.compact} />` is allowed to render
  `10K` / `1.2M` for readability of tight axis labels. Never abbreviate
  anywhere else (no "10K calls" in a KPI tile).
- The generic report-table cell renderer (`formatCellValue` in
  `ReportViewPage.tsx`) automatically routes `typeof val === "number"`
  through `fmt`. This means every SQL-report numeric column gets commas
  for free — do not add per-column number-formatting workarounds.
- UI item counts (file counts, dirty-field counts, "5 of 12 records") can
  stay as raw `{n}` interpolation. They're typically `< 100`; commas would
  be visual noise. But anything that originates from analytics / report
  data MUST go through `fmt`.

## What NOT to do

- Do not add toast notifications without asking.
- Do not add new UI libraries (Radix, shadcn, Material UI, etc.). The app is
  hand-coded Tailwind and that's a deliberate choice.
- Do not introduce `position: fixed` for layout primitives. Use flex layouts
  for sticky footer patterns — see `AdminLayout`.
- Do not use placeholders as a substitute for labels or helper text. Every
  input must have a label; format hints go in helper text below the input.

## Global layout rules (mandatory)

These apply to every layout component and the app's router. Don't ship a
new page or layout that violates them.

- **Sticky footer scaffold.** Every layout wraps its children in
  `min-h-screen flex flex-col`, gives `<main>` `flex-1`, and renders the
  `<Footer>` after `<main>`. The Footer pins to the viewport bottom when
  page content is short and flows naturally after content when it isn't.
  Canonical reference: `DashboardLayout.tsx`. Don't reach for
  `position: fixed`, `pb-screen`, or `min-h-[80vh]` hacks — the flex
  scaffold is the only correct fix because it adapts to any viewport.
- **POP scroll restoration.** The `<ScrollRestoration />` component
  mounted in `App.tsx` (inside `<BrowserRouter>`, before `<Routes>`)
  handles every page: browser Back/Forward returns to the saved scroll
  position for that history entry; new navigations scroll to top.
  Positions are keyed by `location.key` in `sessionStorage`, and
  `window.history.scrollRestoration = "manual"` is set on mount so the
  browser's native behavior doesn't fight ours. Don't reintroduce a
  per-path `ScrollToTop` — restoration is keyed by history entry, not
  path.

## Conventions — file layout

- Admin pages: `src/pages/admin/Admin{Name}Page.tsx`
- Admin-only components: `src/components/admin/{Name}.tsx`
- Admin API calls: `src/services/admin.ts`
- Shared hooks: `src/hooks/`
- Default export for pages, named exports acceptable for components/hooks.
