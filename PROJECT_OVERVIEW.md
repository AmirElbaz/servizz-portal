# Servizz.gov Portal - Frontend Project Overview

## What This Is

A government services portal frontend built with **React 19 + TypeScript + Vite + Tailwind CSS v4**. The application is called **Servizz.gov** (branded as "Centrecom | Servizz.gov") and provides a unified interface for accessing multiple governmental agency projects, their departments, and reports.

All data is currently **mock/hardcoded** in `src/data/`. The backend API should replace these data sources.

---

## Tech Stack

- **React 19** with TypeScript
- **Vite 8** (build tool)
- **Tailwind CSS v4** (via `@tailwindcss/vite` plugin)
- **React Router v7** (client-side routing)
- **Recharts** (charts on report view page)
- Fonts: **Public Sans** (headlines), **Inter** (body)
- Icons: **Google Material Symbols Outlined** (loaded via CDN in `index.html`)

---

## Application Structure

### Routes

| Route | Page | Description |
|---|---|---|
| `/` | LoginPage | Two-tab login: "Username & Password" or "4-Digit PIN Code" |
| `/forgot-password` | ForgotPasswordPage | Password recovery form |
| `/dashboard` | DashboardPage | Hero section (featured project) + all projects grid/list |
| `/project/:projectId` | ProjectDetailPage | Project hero banner + departments grid |
| `/project/:projectId/department/:departmentId` | ReportsPage | Department pills + reports list |
| `/project/:projectId/department/:departmentId/report/:reportId` | ReportViewPage | Full report: widgets, charts, filters, paginated data table |

### Navigation Hierarchy

```
Login
  └─ Dashboard (all projects)
       └─ Project Detail (departments within a project)
            └─ Reports List (reports within a department)
                 └─ Report View (single report with data, charts, filters)
```

---

## Data Models

### Project

```typescript
interface Project {
  id: string;           // URL slug, e.g. "dss"
  code: string;         // Short code, e.g. "DSS"
  name: string;         // Display name, e.g. "Social Security"
  description: string;  // Short description for cards
  fullDescription: string; // Long description for hero banners
  icon: string;         // Material icon name (legacy, logos used now)
  logo: string;         // Path to logo PNG, e.g. "/logos/DSS.png"
  color: string;        // Hex theme color, e.g. "#2eb2ff"
  hoverBorderColor: string; // Tailwind hover class (legacy)
}
```

**Current projects (14):** DSS, IRD, Jobs+, 1SS, TM, EM, IDENTITA, VAT, MEYR, BCA, AACC, AW, ME, REWS

Each project has its own **theme color** that flows through the entire project detail and reports UI (hero gradient, accent buttons, selected states, chart colors).

### Department

```typescript
interface Department {
  id: string;   // e.g. "hr", "finance", "it"
  name: string; // e.g. "Human Resources"
  icon: string; // Material icon name
}
```

**Current departments (8):** HR, Operations, Finance, IT, Customer Support, Legal, Marketing, Procurement

Departments are shared across all projects (same 8 departments per project).

### Report

```typescript
interface Report {
  id: string;
  title: string;     // e.g. "Quarterly Budget Analysis"
  date: string;      // e.g. "Mar 24, 2024"
  meta: string;      // e.g. "2.4 MB PDF"
  metaIcon: string;  // Material icon name
  icon: string;      // Material icon for the report card
  iconBg: string;    // Tailwind bg class
  iconColor: string; // Tailwind text class
}
```

**Current reports (3):** Quarterly Budget Analysis, Audit Trail Report, Resource Allocation

Reports are shared across all departments (same 3 reports per department).

### Report Data Row (for the data table inside a report)

```typescript
interface ReportRow {
  date: string;
  region: string;
  category: string;           // Pension, Disability, Healthcare, Education, Housing, Unemployment
  subcategory: string;        // New Application, Renewal, Amendment, Appeal, Transfer
  beneficiaryId: string;
  beneficiaryName: string;
  status: string;             // Approved, Pending, Under Review, Escalated, Completed
  claimType: string;          // Individual, Family, Institutional, Emergency
  amountRequested: number;
  amountApproved: number;
  amountDisbursed: number;    // 0 means non-answered/not disbursed
  currency: string;           // "EUR"
  processingDays: number;
  assignedOfficer: string;
  department: string;
  priority: string;           // Low, Medium, High, Critical
  channel: string;            // Online, In-Person, Phone, Mail
  verificationStatus: string; // Verified, Pending Review, Requires Documents
  complianceScore: number;    // 70-100
  notes: string;
}
```

Currently **200 mock rows** are generated randomly for date range 2024-01-01 to 2024-12-31.

---

## Key Features the Backend Needs to Support

### 1. Authentication
- **Username + Password + 4-digit PIN** login
- **4-Digit PIN Code** login (alternative method)
- Password reset flow (email-based)

### 2. Projects API
- `GET /projects` - List all projects
- `GET /projects/:id` - Single project details
- Each project needs: id, code, name, descriptions, logo URL, theme color

### 3. Departments API
- `GET /projects/:projectId/departments` - List departments for a project
- Each department needs: id, name, icon

### 4. Reports API
- `GET /projects/:projectId/departments/:departmentId/reports` - List reports
- `GET /projects/:projectId/departments/:departmentId/reports/:reportId` - Report metadata
- Each report needs: id, title, date, metadata

### 5. Report Data API
- `GET /projects/:projectId/departments/:departmentId/reports/:reportId/data` - Report row data
- **Query parameters the frontend sends:**
  - `dateFrom` (string, ISO date)
  - `dateTo` (string, ISO date)
  - `interval` (`daily` | `weekly` | `monthly`) - for chart aggregation
  - `metric` (`offered` | `answered` | `nonanswered`) - for chart data
  - `page` (number, 1-based)
  - `pageSize` (number: 5, 10, 15, or 20)
- **Expected response should include:**
  - `rows[]` - paginated report rows (20 columns per row, see ReportRow interface above)
  - `totalCount` - total number of filtered rows
  - `chartData[]` - aggregated data for the area chart: `{ label, value }`
  - `pieData[]` - aggregated data for the pie chart: `{ name, value }` grouped by category
  - `summary.totalApproved` - sum of amountApproved for filtered rows
  - `summary.totalDisbursed` - sum of amountDisbursed for filtered rows

### 6. Report Export
- `GET .../reports/:reportId/export` - Download filtered data as file (CSV/PDF)

---

## File Structure

```
src/
├── components/
│   ├── layout/
│   │   ├── TopNavBar.tsx         # Floating glass pill nav bar
│   │   ├── DashboardLayout.tsx   # Wrapper: nav + content + footer
│   │   └── Footer.tsx            # Auth and dashboard footer variants
│   └── ui/
│       └── Paginator.tsx         # Reusable paginator (page size: 5/10/15/20)
├── data/                         # ⚠️ MOCK DATA - replace with API calls
│   ├── projects.ts               # 14 projects
│   ├── departments.ts            # 8 departments + 14 sidebar departments
│   ├── reports.ts                # 3 report definitions
│   └── reportData.ts             # 200 mock rows + aggregation helpers
├── pages/
│   ├── LoginPage.tsx             # Two-tab auth (credentials / PIN code)
│   ├── ForgotPasswordPage.tsx    # Password recovery
│   ├── DashboardPage.tsx         # Hero + project grid/list with view toggle
│   ├── ProjectDetailPage.tsx     # Project banner + department cards
│   ├── ReportsPage.tsx           # Department pills + report cards
│   └── ReportViewPage.tsx        # Full report: widgets, charts, table, filters
├── App.tsx                       # Router configuration
├── main.tsx                      # Entry point
└── index.css                     # Tailwind theme + custom animations
```

---

## UI Design Notes

- **Per-project theming:** Each project has a `color` field. When viewing a project, its color becomes the accent throughout (hero gradient, buttons, selected states, chart fills). This is done via CSS custom property `--accent`.
- **Hero section on dashboard:** Shows the featured (first) project. Has a 3-phase scroll animation: full → compact → hidden (collapses into nav button).
- **Project/Reports hero banners:** Split layout with gradient panel (4/5) + white logo panel (1/5) with a bookmark ribbon accent.
- **Floating glass nav bar:** Uses `backdrop-filter: blur()` with `saturate()`. The project button morphs (gains gradient + logo) when the hero is collapsed.
- **Cards:** White cards with colored accent strips, hover lift animations, glow effects.
- **Paginator component** is reusable at `src/components/ui/Paginator.tsx`. Accepts `accentColor` to match any project theme.
- **Report View:** Has date range filters, interval toggle (daily/weekly/monthly), chart metric toggle (offered/answered/non-answered), area chart, donut pie chart, and a 20-column scrollable data table.
