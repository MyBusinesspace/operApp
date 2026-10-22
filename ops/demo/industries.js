export const INDUSTRIES = [
  {
    id: "construction",
    label: "Construction",
    blurb: "Sites, MEP work orders, plant & project billing",
    accent: "#4f46e5",
  },
  {
    id: "healthcare",
    label: "Healthcare",
    blurb: "Clinics, biomedical assets, shifts & maintenance",
    accent: "#0d9488",
  },
  {
    id: "facilities",
    label: "Facilities",
    blurb: "Service tickets, contracts, multi-site FM",
    accent: "#d97706",
  },
];

export function getIndustry(id) {
  return INDUSTRIES.find((i) => i.id === id) || INDUSTRIES[0];
}
