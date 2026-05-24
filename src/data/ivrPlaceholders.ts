// Hardcoded UI placeholders for the IVR & Queue Analytics bundle.
//
// These reports are PLANNED but not yet built. They render as muted
// "Coming soon" cards inside the IVR section on the department / project
// detail pages. As each one is built for real, its entry here gets removed
// and the corresponding catalog row takes over.
//
// Why hardcoded instead of catalog rows?
//   - Keeps the policy system clean — admins can't accidentally attach
//     fake report_codes that don't have controllers behind them.
//   - Easy to remove: when a real report ships, delete its entry here and
//     the placeholder vanishes from every page that renders this list.
//
// The `ivr-trend-comparison` entry is special: a real backend exists
// (`/api/IvrTrends/comparison`) but the live page isn't wired yet, so it
// renders alongside the others as a placeholder with an extra "Live preview"
// link to the mock-data preview page used for senior review.

export type IvrPlaceholder = {
  code: string;
  name: string;
  description: string;
  icon: string;
  metricsCovered: string;
  /**
   * When set, the card is clickable and navigates here. Used for the
   * trend-comparison entry to surface the live mock-data preview.
   * Other placeholders leave this undefined → non-clickable cards with
   * a "Coming soon" tooltip.
   */
  previewHref?: string;
};

export const IVR_PLACEHOLDERS: IvrPlaceholder[] = [
  {
    // Code stays `ivr-trend-comparison` for URL / policy / attachment
    // compatibility; only the display name changes (migration 043 +
    // Program.cs registration). Amir 2026-05-20.
    code: "ivr-trend-comparison",
    name: "Inbound Trend & Comparison",
    description:
      "Year-over-year monthly comparison of offered and auto-handled calls. " +
      "Pivot table + daily trend chart with up to 3 comparison years.",
    icon: "trending_up",
    metricsCovered: "Offered, Auto-handled (metrics 10–11)",
    previewHref: "/preview/ivr-trend-comparison",
  },
  {
    // New stub beside Trend & Comparison (Amir 2026-05-20). Non-clickable
    // "Coming soon" card — no preview page wired yet. Promote to a clickable
    // card by adding `previewHref` once the preview lands.
    code: "forecasted-monthly-calls",
    name: "Forecasted Monthly Calls",
    description:
      "Projected monthly call volumes per project against agreed SLA " +
      "answered-vs-offered targets, surfaced for capacity planning.",
    icon: "query_stats",
    metricsCovered: "Metric 9 — SLA forecast",
  },
  // ── HIDDEN until the live backend ships — Amir 2026-05-13. Do NOT
  //    delete; uncomment when each report is ready.
  // {
  //   code: "ivr-funnel",
  //   name: "IVR Funnel",
  //   description:
  //     "Drop-off through the IVR — abandons during the menu, abandons in queue " +
  //     "post-IVR, and the rate of callers opting through to a CRO.",
  //   icon: "alt_route",
  //   metricsCovered: "Metrics 1, 2, 6",
  //   previewHref: "/preview/ivr-funnel",
  // },
  // {
  //   code: "repeat-contacts",
  //   name: "Repeat Contacts",
  //   description:
  //     "Caller behavior in a 72-hour window — same-number repeats per project, " +
  //     "unique-contact distribution by call frequency.",
  //   icon: "history",
  //   metricsCovered: "Metrics 3, 4, 5",
  // },
  // {
  //   code: "hourly-distribution",
  //   name: "Hourly Distribution",
  //   description:
  //     "Calls per hour across all projects and per project, with a peak vs " +
  //     "off-peak split for capacity-planning conversations.",
  //   icon: "schedule",
  //   metricsCovered: "Metrics 7, 8",
  //   previewHref: "/preview/hourly-distribution",
  // },
  // {
  //   code: "sla-forecast",
  //   name: "SLA Forecast",
  //   description:
  //     "Forecasted call volumes per project, projected against agreed SLA " +
  //     "answered-vs-offered targets.",
  //   icon: "insights",
  //   metricsCovered: "Metric 9",
  // },
];

// Section header metadata used by department / project pages when rendering
// the IVR group. Display label is intentionally a touch broader than just
// "IVR" so users grasp the scope on first read.
export const IVR_CATEGORY_META = {
  code: "ivr",
  label: "Inbound & Queue Analytics",
  blurb:
    "Inbound voice analytics — trend comparisons, IVR funnel, caller behavior, " +
    "hourly distribution, and SLA forecasts.",
  icon: "support_agent",
  // Treatment color used for icon wells and subtle accents inside the
  // section. Matches the brand accent so the IVR group reads as part of
  // Centrecom's primary surface area.
  accent: "#2EB2FF",
} as const;
