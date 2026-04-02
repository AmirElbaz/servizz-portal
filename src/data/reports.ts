export interface Report {
  id: string;
  title: string;
  date: string;
  meta: string;
  metaIcon: string;
  icon: string;
  iconBg: string;
  iconColor: string;
}

export const reports: Report[] = [
  {
    id: "1",
    title: "Quarterly Budget Analysis",
    date: "Mar 24, 2024",
    meta: "2.4 MB PDF",
    metaIcon: "description",
    icon: "analytics",
    iconBg: "bg-primary-container",
    iconColor: "text-primary",
  },
  {
    id: "2",
    title: "Audit Trail Report",
    date: "Feb 18, 2024",
    meta: "Encrypted Access",
    metaIcon: "security",
    icon: "policy",
    iconBg: "bg-secondary-container",
    iconColor: "text-secondary",
  },
  {
    id: "3",
    title: "Resource Allocation",
    date: "Jan 12, 2024",
    meta: "Live Dashboard",
    metaIcon: "query_stats",
    icon: "monitoring",
    iconBg: "bg-tertiary-container",
    iconColor: "text-tertiary",
  },
];
