export interface Project {
  id: string;
  code: string;
  name: string;
  description: string;
  fullDescription: string;
  icon: string;
  color: string;
  hoverBorderColor: string;
}

export const projects: Project[] = [
  {
    id: "dss",
    code: "DSS",
    name: "Social Security",
    description: "Benefits & pensions management registry.",
    fullDescription:
      "The Department of Social Security initiative is a strategic digital transformation designed to consolidate social security services into a single, user-centric ecosystem for simplified benefit management.",
    icon: "security",
    color: "#1d5fa8",
    hoverBorderColor: "hover:border-[#1d5fa8]/40",
  },
  {
    id: "ird",
    code: "IRD",
    name: "Inland Revenue",
    description: "Taxation and fiscal management services.",
    fullDescription:
      "The Inland Revenue Department portal centralizes taxation and fiscal management services, providing citizens and businesses with streamlined access to filing, payments, and compliance resources.",
    icon: "payments",
    color: "#9f403d",
    hoverBorderColor: "hover:border-[#9f403d]/40",
  },
  {
    id: "jobs-plus",
    code: "Jobs+",
    name: "Jobsplus",
    description: "National employment portal and training.",
    fullDescription:
      "Jobsplus is the national employment agency portal enabling workforce registration, job matching, training programme enrolment, and labour market analytics across all sectors.",
    icon: "work",
    color: "#2563eb",
    hoverBorderColor: "hover:border-blue-600/40",
  },
  {
    id: "1ss",
    code: "1SS",
    name: "Servizz.gov",
    description: "Single stop service hub for all citizens.",
    fullDescription:
      "Servizz.gov is the single-stop service hub providing citizens with unified access to government services, applications, and digital resources through one streamlined interface.",
    icon: "hub",
    color: "#5c5d78",
    hoverBorderColor: "hover:border-[#5c5d78]/40",
  },
  {
    id: "tm",
    code: "TM",
    name: "Transport Malta",
    description: "Licensing, permits and infrastructure.",
    fullDescription:
      "Transport Malta oversees all land, sea, and air transport licensing, permitting, and infrastructure planning, delivering integrated mobility services to citizens and operators.",
    icon: "directions_car",
    color: "#15803d",
    hoverBorderColor: "hover:border-green-700/40",
  },
  {
    id: "em",
    code: "EM",
    name: "Enemalta",
    description: "National energy grid and distribution.",
    fullDescription:
      "Enemalta manages the national energy grid, electricity generation, and distribution infrastructure, ensuring reliable power supply and sustainable energy transition programmes.",
    icon: "bolt",
    color: "#ea580c",
    hoverBorderColor: "hover:border-orange-600/40",
  },
  {
    id: "identita",
    code: "IDENTITA",
    name: "Identita",
    description: "Identity management and passport services.",
    fullDescription:
      "Identita is the national identity management agency responsible for identity cards, passport issuance, civil registration, and secure digital identity verification services.",
    icon: "badge",
    color: "#7e22ce",
    hoverBorderColor: "hover:border-purple-700/40",
  },
  {
    id: "vat",
    code: "VAT",
    name: "VAT Dept",
    description: "Commercial tax filing and tracking portal.",
    fullDescription:
      "The VAT Department portal enables businesses to manage value-added tax registration, filing, payments, and compliance tracking through a secure digital interface.",
    icon: "receipt_long",
    color: "#1e293b",
    hoverBorderColor: "hover:border-slate-800/40",
  },
  {
    id: "meyr",
    code: "MEYR",
    name: "Education",
    description: "Scholarships, exams and student services.",
    fullDescription:
      "The Ministry for Education, Youth and Research portal provides access to scholarships, examination management, student services, and educational institution coordination.",
    icon: "school",
    color: "#be185d",
    hoverBorderColor: "hover:border-pink-700/40",
  },
  {
    id: "bca",
    code: "BCA",
    name: "Building Authority",
    description: "Construction permits and safety registry.",
    fullDescription:
      "The Building and Construction Authority manages construction permits, building safety inspections, compliance certification, and the national building registry.",
    icon: "construction",
    color: "#f59e0b",
    hoverBorderColor: "hover:border-amber-500/40",
  },
  {
    id: "aacc",
    code: "AACC",
    name: "Active Ageing",
    description: "Elderly care and community services.",
    fullDescription:
      "The Active Ageing and Community Care agency coordinates elderly care programmes, community support services, home care, and social integration initiatives for senior citizens.",
    icon: "family_restroom",
    color: "#155e75",
    hoverBorderColor: "hover:border-cyan-800/40",
  },
  {
    id: "aw",
    code: "AW",
    name: "Animal Welfare",
    description: "Vet care, reporting and protection portal.",
    fullDescription:
      "The Animal Welfare division manages veterinary services, animal protection reporting, licensing of pet ownership, and enforcement of animal welfare regulations.",
    icon: "pets",
    color: "#475569",
    hoverBorderColor: "hover:border-slate-600/40",
  },
  {
    id: "me",
    code: "ME",
    name: "Malta Enterprise",
    description: "Business grants and economic support.",
    fullDescription:
      "Malta Enterprise is the national economic development agency providing business grants, investment incentives, innovation funding, and enterprise support programmes.",
    icon: "business",
    color: "#3730a3",
    hoverBorderColor: "hover:border-indigo-800/40",
  },
  {
    id: "rews",
    code: "REWS",
    name: "REWS",
    description: "Energy and water regulatory services.",
    fullDescription:
      "The Regulator for Energy and Water Services oversees utility regulation, consumer protection, renewable energy certification, and water quality management.",
    icon: "eco",
    color: "#115e59",
    hoverBorderColor: "hover:border-teal-800/40",
  },
];
