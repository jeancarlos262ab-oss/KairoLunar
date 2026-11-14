export const NAV_ITEMS = ["HOME", "SITES", "SKY", "TERRAIN", "CALENDAR", "LEARN"] as const;
export type NavItem = (typeof NAV_ITEMS)[number];
