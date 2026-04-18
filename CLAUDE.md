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
  `bg-surface-container-high`, etc. No raw `#1d5fa8`, no arbitrary Tailwind
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

## What NOT to do

- Do not add toast notifications without asking.
- Do not add new UI libraries (Radix, shadcn, Material UI, etc.). The app is
  hand-coded Tailwind and that's a deliberate choice.
- Do not introduce `position: fixed` for layout primitives. Use flex layouts
  for sticky footer patterns — see `AdminLayout`.
- Do not use placeholders as a substitute for labels or helper text. Every
  input must have a label; format hints go in helper text below the input.

## Conventions — file layout

- Admin pages: `src/pages/admin/Admin{Name}Page.tsx`
- Admin-only components: `src/components/admin/{Name}.tsx`
- Admin API calls: `src/services/admin.ts`
- Shared hooks: `src/hooks/`
- Default export for pages, named exports acceptable for components/hooks.
