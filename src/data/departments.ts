export interface Department {
  id: string;
  name: string;
  icon: string;
}

export const departments: Department[] = [
  { id: "hr", name: "Human Resources", icon: "badge" },
  { id: "operations", name: "Operations", icon: "settings_suggest" },
  { id: "finance", name: "Finance", icon: "account_balance_wallet" },
  { id: "it", name: "Information Technology", icon: "terminal" },
  { id: "support", name: "Customer Support", icon: "support_agent" },
  { id: "legal", name: "Legal", icon: "gavel" },
  { id: "marketing", name: "Marketing", icon: "campaign" },
  { id: "procurement", name: "Procurement", icon: "shopping_cart" },
];

export interface SidebarDepartment {
  id: string;
  name: string;
  icon: string;
}

export const sidebarDepartments: SidebarDepartment[] = [
  { id: "health", name: "Health", icon: "medical_services" },
  { id: "education", name: "Education", icon: "school" },
  { id: "social", name: "Social", icon: "group" },
  { id: "finance", name: "Finance", icon: "payments" },
  { id: "transport", name: "Transport", icon: "directions_car" },
  { id: "environment", name: "Environment", icon: "eco" },
  { id: "justice", name: "Justice", icon: "gavel" },
  { id: "energy", name: "Energy", icon: "bolt" },
  { id: "employment", name: "Employment", icon: "business_center" },
  { id: "housing", name: "Housing", icon: "cottage" },
  { id: "family", name: "Family", icon: "family_restroom" },
  { id: "tourism", name: "Tourism", icon: "explore" },
  { id: "agriculture", name: "Agriculture", icon: "agriculture" },
  { id: "identity", name: "Identity", icon: "public" },
];
