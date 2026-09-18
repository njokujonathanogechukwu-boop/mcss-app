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
  "privilege:read": ["SECRETARY", "COORDINATOR", "ELDER", "SERVANT", "VIEWER"],
  "privilege:write": ["SECRETARY", "COORDINATOR", "ELDER"],
  "forms:manage": ["SECRETARY", "COORDINATOR"],
  "boe:read": ["SECRETARY", "COORDINATOR", "ELDER"],
  "boe:write": ["SECRETARY", "COORDINATOR", "ELDER"],
  // Reproofs, removals, reinstatements and restrictions: elders only, and never
  // part of the meeting summary that goes round the body of elders.
  "standing:read": ["SECRETARY", "COORDINATOR", "ELDER"],
  "standing:write": ["SECRETARY", "COORDINATOR", "ELDER"],
  // The Life and Ministry Meeting School. The overseer the body of elders chose
  // gets these two and nothing else: he plans the midweek meeting and sees the
  // publisher list to plan it from, but not the reports, the contact details or
  // the elders' items. Elders read the schedule because they approve chairmen.
  "school:read": ["SECRETARY", "COORDINATOR", "ELDER", "SCHOOL_OVERSEER"],
  "school:write": ["SECRETARY", "COORDINATOR", "SCHOOL_OVERSEER"],
  "task:read": ["SECRETARY", "COORDINATOR", "ELDER", "SERVANT", "VIEWER"],
  "task:write": ["SECRETARY", "COORDINATOR", "ELDER", "SERVANT"],
  "announcement:read": ["SECRETARY", "COORDINATOR", "ELDER", "SERVANT", "VIEWER"],
  "announcement:write": ["SECRETARY", "COORDINATOR", "ELDER", "SERVANT"],
  // Self-approval: the secretary (or coordinator) both composes and approves.
  "announcement:approve": ["SECRETARY", "COORDINATOR"],
  // Outgoing mail uses one congregation mail account (Gmail via OAuth2, or
  // Resend), so only the two accounts that own the records may put anything out.
  "mail:send": ["SECRETARY", "COORDINATOR"],
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
  SCHOOL_OVERSEER: "Life and Ministry overseer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  SECRETARY: "Full access to every record, including imports and user accounts.",
  COORDINATOR: "Full access to every record, including imports and user accounts.",
  ELDER: "Reads all records, edits reports, attendance, bookings and elders' items.",
  SERVANT: "Edits reports, attendance and bookings. No access to elders' items.",
  VIEWER: "Reads rosters, attendance and the hall calendar. No contact details.",
  SCHOOL_OVERSEER:
    "Plans the midweek meeting and keeps the school's students. Sees the publisher list only — no reports, contact details or elders' items.",
};

/**
 * Where an account lands after signing in. The school overseer cannot open the
 * dashboard at all, so sending him there would only bounce him back.
 */
export function homeFor(role: Role | undefined): string {
  return role === "SCHOOL_OVERSEER" ? "/school" : "/dashboard";
}
