import type { Role } from "@prisma/client";

export const PERMISSIONS = {
  "publisher:read": ["SECRETARY", "COORDINATOR", "ELDER", "SERVANT", "VIEWER"],
  "publisher:readContact": ["SECRETARY", "COORDINATOR", "ELDER", "SERVANT"],
  "publisher:write": ["SECRETARY", "COORDINATOR"],
  "publisher:delete": ["SECRETARY", "COORDINATOR"],
  "group:read": ["SECRETARY", "COORDINATOR", "ELDER", "SERVANT", "VIEWER"],
  "group:write": ["SECRETARY", "COORDINATOR"],
  "report:read": ["SECRETARY", "COORDINATOR", "ELDER", "SERVANT"],
  "report:write": ["SECRETARY", "COORDINATOR", "ELDER", "SERVANT"],
  "attendance:read": ["SECRETARY", "COORDINATOR", "ELDER", "SERVANT", "VIEWER"],
  "attendance:write": ["SECRETARY", "COORDINATOR", "ELDER", "SERVANT"],
  "booking:read": ["SECRETARY", "COORDINATOR", "ELDER", "SERVANT", "VIEWER"],
  "booking:request": ["SECRETARY", "COORDINATOR", "ELDER", "SERVANT", "VIEWER"],
  "booking:decide": ["SECRETARY", "COORDINATOR", "ELDER"],
  "boe:read": ["SECRETARY", "COORDINATOR", "ELDER"],
  "boe:write": ["SECRETARY", "COORDINATOR", "ELDER"],
  "import:run": ["SECRETARY", "COORDINATOR"],
  "export:run": ["SECRETARY", "COORDINATOR", "ELDER"],
  "user:manage": ["SECRETARY", "COORDINATOR"],
  "audit:read": ["SECRETARY", "COORDINATOR"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  SECRETARY: "Secretary",
  COORDINATOR: "Coordinator",
  ELDER: "Elder",
  SERVANT: "Ministerial servant",
  VIEWER: "Read only",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  SECRETARY: "Full access to every record, including imports and user accounts.",
  COORDINATOR: "Full access to every record, including imports and user accounts.",
  ELDER: "Reads all records, edits reports, attendance, bookings and elders' items.",
  SERVANT: "Edits reports, attendance and bookings. No access to elders' items.",
  VIEWER: "Reads rosters, attendance and the hall calendar. No contact details.",
};
