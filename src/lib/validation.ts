import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Enter a valid date")
  .transform((v) => (v ? new Date(v) : null));

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine((v) => v === null || z.string().email().safeParse(v).success, "Enter a valid email");

export const publisherSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  gender: z.enum(["MALE", "FEMALE"]),
  dateOfBirth: optionalDate,
  baptismDate: optionalDate,
  isBaptized: z.coerce.boolean(),
  isAnointed: z.coerce.boolean(),
  appointment: z.enum(["PUBLISHER", "MINISTERIAL_SERVANT", "ELDER"]),
  pioneerStatus: z.enum(["NONE", "AUXILIARY", "REGULAR", "SPECIAL"]),
  status: z.enum(["ACTIVE", "IRREGULAR", "INACTIVE", "DISFELLOWSHIPPED", "DISASSOCIATED", "TRANSFERRED_OUT", "DECEASED"]),
  sinceDate: optionalDate,
  sinceKind: z.enum(["MOVED_IN", "STARTED_PUBLISHING"]).nullable(),
  privileges: z.array(z.string().trim().min(1)).default([]),
  phone: optionalString,
  email: optionalEmail,
  address: optionalString,
  emergencyContactName: optionalString,
  emergencyContactPhone: optionalString,
  groupId: optionalString,
  notes: optionalString,
});

export const serviceReportSchema = z
  .object({
    publisherId: z.string().min(1),
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
    outcome: z.enum(["SHARED", "DID_NOT_PREACH", "NO_REPORT"]),
    bibleStudies: z.coerce.number().int().min(0).max(99),
    hours: z
      .union([z.literal(""), z.coerce.number().int().min(0).max(744)])
      .transform((v) => (v === "" ? null : v))
      .nullable(),
    creditHours: z
      .union([z.literal(""), z.coerce.number().int().min(0).max(744)])
      .transform((v) => (v === "" ? null : v))
      .nullable(),
    pioneerStatusUsed: z.enum(["NONE", "AUXILIARY", "REGULAR", "SPECIAL"]),
    remarks: optionalString,
  })
  .refine((d) => d.pioneerStatusUsed !== "NONE" || d.hours === null, {
    message: "Only pioneers report hours. Leave hours blank for publishers.",
    path: ["hours"],
  })
  .refine((d) => d.outcome === "SHARED" || (d.bibleStudies === 0 && !d.hours), {
    message: "A report with no participation cannot carry studies or hours.",
    path: ["outcome"],
  });

/**
 * The inline "fix" form on the records check. Every field is optional because
 * the form only renders the parts the signed-in account may edit, so an absent
 * key means "not offered" rather than "blank it out".
 */
export const recordFixSchema = z.object({
  publisherId: z.string().min(1, "Missing publisher."),
  dateOfBirth: optionalDate.optional(),
  baptismDate: optionalDate.optional(),
  phone: optionalString.optional(),
  email: optionalEmail.optional(),
  address: optionalString.optional(),
  emergencyContactName: optionalString.optional(),
  emergencyContactPhone: optionalString.optional(),
  groupId: optionalString.optional(),
  reportPeriod: z
    .string()
    .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, "Choose a reporting month.")
    .refine((v) => {
      const year = Number(v.slice(0, 4));
      return year >= 2000 && year <= 2100;
    }, "Choose a reporting month.")
    .transform((v) => {
      const [year, month] = v.split("-").map(Number);
      return { year, month };
    })
    .optional(),
  reportShared: z.boolean(),
  reportAux: z.boolean(),
  reportStudies: z.union([
    z.literal(""),
    z.coerce.number().int("Enter a whole number").min(0).max(99, "Bible studies cannot be more than 99"),
  ]),
  reportHours: z.union([
    z.literal(""),
    z.coerce.number().int("Enter a whole number").min(0).max(744, "Hours cannot be more than 744"),
  ]),
});

const checkbox = z
  .union([z.literal("on"), z.literal("true")])
  .optional()
  .transform((v) => v === "on" || v === "true");

/**
 * What a publisher may change through their personal link. Deliberately
 * narrow: gender, appointment, pioneer status, group and record status stay
 * with the congregation, so a shared or forwarded link cannot rewrite them.
 */
export const selfUpdateSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  dateOfBirth: optionalDate,
  baptismDate: optionalDate,
  isBaptized: checkbox,
  phone: optionalString,
  email: optionalEmail,
  address: optionalString,
  emergencyContactName: optionalString,
  emergencyContactPhone: optionalString,
});

/** Inline row edits on the publishers list: sex and baptism details only. */
export const quickPublisherSchema = z.object({
  gender: z.enum(["MALE", "FEMALE"]),
  isBaptized: checkbox,
  baptismDate: optionalDate,
});

export const attendanceSchema = z.object({
  date: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date"),
  meetingType: z.enum(["MIDWEEK", "WEEKEND"]),
  inPerson: z.coerce.number().int().min(0).max(5000),
  zoom: z.coerce.number().int().min(0).max(5000),
  notes: optionalString,
});

export const memorialSchema = z.object({
  date: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter the date of the Memorial"),
  inPerson: z.coerce.number().int().min(0).max(20000),
  video: z.coerce.number().int().min(0).max(20000),
  partakers: z.coerce.number().int().min(0).max(1000),
  notes: optionalString,
});

export const privilegeSchema = z.object({
  name: z.string().trim().min(2, "Give the privilege a name").max(80),
  category: z.enum(["CONGREGATION", "MEETING", "OTHER"]),
  description: optionalString,
});

export const assignmentSchema = z.object({
  publisherId: z.string().min(1, "Choose a publisher"),
  privilegeId: z.string().min(1, "Choose a department"),
  role: z.enum(["OVERSEER", "ASSISTANT", "SERVANT", "ASSIGNEE"]),
  startDate: optionalDate,
  notes: optionalString,
});

export const bookingSchema = z
  .object({
    resourceId: z.string().min(1, "Choose which part of the hall is needed"),
    requestingBody: z.string().trim().min(2, "Say who the request is for").max(160),
    contactName: z.string().trim().min(2, "A contact name is required").max(120),
    contactPhone: optionalString,
    eventType: z.string().trim().min(2, "Describe the event").max(160),
    startTime: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid start"),
    endTime: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid end"),
    setupRequirements: optionalString,
  })
  .refine((d) => new Date(d.endTime) > new Date(d.startTime), {
    message: "The end time must come after the start time",
    path: ["endTime"],
  })
  .refine(
    (d) =>
      new Date(d.endTime).getTime() - new Date(d.startTime).getTime() <= 1000 * 60 * 60 * 24 * 14,
    { message: "A single booking cannot run longer than two weeks", path: ["endTime"] },
  );

export const groupSchema = z.object({
  number: z.coerce.number().int().min(1).max(99),
  name: z.string().trim().min(1, "Give the group a name").max(80),
  overseerId: optionalString,
  assistantId: optionalString,
  active: z.coerce.boolean(),
});

export const transferSchema = z.object({
  publisherId: z.string().min(1),
  toGroupId: z.string().min(1, "Choose the receiving group"),
  effectiveDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date"),
  reason: optionalString,
});

export const decisionSchema = z.object({
  meetingDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date"),
  agendaItem: z.string().trim().min(2, "Name the agenda item").max(200),
  decision: z.string().trim().min(2, "Record what was decided").max(4000),
  assignedToId: optionalString,
  targetDate: optionalDate,
  status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "DEFERRED"]),
  notes: optionalString,
});

const requiredDate = (message: string) =>
  z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(Date.parse(v)), message)
    .transform((v) => new Date(v));

/**
 * One dated entry in a publisher's standing. The announcement date is optional
 * because a reproof is not always announced to the congregation; restrictions
 * are closed off later by liftSchema rather than when they are recorded.
 */
export const standingSchema = z.object({
  publisherId: z.string().min(1, "Choose the publisher"),
  kind: z.enum(["REPROVED", "DISFELLOWSHIPPED", "DISASSOCIATED", "REINSTATED", "RESTRICTION"]),
  eventDate: requiredDate("Enter the date this happened"),
  announcedDate: optionalDate,
  notes: optionalString,
});

export const liftSchema = z.object({
  id: z.string().min(1, "Missing record."),
  liftedDate: requiredDate("Enter the date the restrictions were lifted"),
});

/**
 * Restrictions placed as part of an entry already on file, so they are read
 * against the decision that caused them. They inherit the publisher from that
 * entry and are closed off later by liftSchema.
 */
export const restrictionSchema = z.object({
  parentId: z.string().min(1, "Missing record."),
  eventDate: requiredDate("Enter the date the restrictions were placed"),
  notes: optionalString,
});

export const taskSchema = z.object({
  title: z.string().trim().min(2, "Say what needs doing").max(200),
  detail: optionalString,
  dueDate: optionalDate,
  assigneeId: optionalString,
});

/**
 * An announcement as composed. `status` is DRAFT when it is still being
 * written or APPROVED when the secretary finalises it (self-approval); the
 * ANNOUNCED state is set later by marking it announced.
 */
export const announcementSchema = z.object({
  title: z.string().trim().min(2, "Give the announcement a title").max(200),
  body: z.string().trim().min(2, "Write the announcement, or draft it with AI").max(4000),
  eventDate: optionalDate,
  status: z.enum(["DRAFT", "APPROVED"]),
});

/**
 * A message written on the Email page. Who it goes to is chosen by audience:
 * addresses typed in, one service group, or every publisher with an email.
 * Typed addresses are checked one by one in the action, since they arrive as a
 * single free-text blob.
 */
export const mailSchema = z.object({
  audience: z.enum(["manual", "group", "all"]),
  addresses: z.string().trim().max(4000),
  groupId: optionalString,
  subject: z.string().trim().min(2, "Write a subject").max(200),
  body: z.string().trim().min(2, "Write the message").max(20000),
});

/**
 * An approved auxiliary pioneer application. `start` is "YYYY-MM"; `months`
 * blank means indefinite from the start month.
 */
export const auxSchema = z.object({
  publisherId: z.string().min(1, "Choose the publisher"),
  start: z
    .string()
    .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, "Choose the month their service starts"),
  months: z
    .union([z.literal(""), z.coerce.number().int("Whole months only").min(1).max(60)])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  notes: optionalString,
});

const monthInput = (message: string) => z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, message);

export const auxEditSchema = z.object({
  id: z.string().min(1),
  start: monthInput("Choose the month their service starts"),
  end: z.union([z.literal(""), monthInput("Choose the month their service ends")]),
  notes: optionalString,
});

export const userSchema = z.object({
  name: z.string().trim().min(2, "Enter the person's name").max(120),
  email: z.string().trim().email("Enter a valid email").max(160),
  role: z.enum(["SECRETARY", "COORDINATOR", "ELDER", "SERVANT", "VIEWER", "SCHOOL_OVERSEER"]),
  active: z.coerce.boolean(),
  publisherId: optionalString,
});

export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(200)
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), {
    message: "Include upper case, lower case and a number",
  });

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

// The Kingdom Hall operating committee. Names are free text because these
// brothers are not necessarily on this system's own roll, and every address may
// be left blank — a person with none is simply not emailed.
export const hallCommitteeSchema = z.object({
  chairmanName: z.string().trim().max(120).default(""),
  chairmanEmail: optionalEmail,
  chairmanEmail2: optionalEmail,
  assistantName: z.string().trim().max(120).default(""),
  assistantEmail: optionalEmail,
  assistantEmail2: optionalEmail,
  memberName: z.string().trim().max(120).default(""),
  memberEmail: optionalEmail,
  memberEmail2: optionalEmail,
});

// ------------------------------------------------- life and ministry school

/** A whole number that may be left blank, stored as null. */
const optionalWhole = (message: string, min: number, max: number) =>
  z
    .union([z.literal(""), z.coerce.number().int(message).min(min, message).max(max, message)])
    .transform((v) => (v === "" ? null : v))
    .nullable();

const dateInput = (message: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, message)
    .transform((v) => new Date(v));

export const periodSchema = z.object({
  startYear: z.coerce.number().int("Enter the year").min(2020, "Enter the year").max(2100, "Enter the year"),
  startMonth: z.coerce.number().int().min(1).max(12),
  meetingWeekday: z.coerce.number().int().min(0).max(6),
  startHour: z.coerce.number().int().min(0).max(23),
  startMinute: z.coerce.number().int().min(0).max(59),
  label: optionalString,
});

// Editing a period: its name, the day the congregation meets and the time it
// starts. The two months it covers cannot be changed here, because the weeks
// already dated from them would be left behind.
export const periodSettingsSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1, "Give the period a name").max(80),
  meetingWeekday: z.coerce.number().int().min(0).max(6),
  startHour: z.coerce.number().int().min(0).max(23),
  startMinute: z.coerce.number().int().min(0).max(59),
});

// Importing a workbook: the two months it covers come from the file itself, so
// only the clock the schedule runs on and an optional name are asked for.
export const workbookSettingsSchema = z.object({
  meetingWeekday: z.coerce.number().int().min(0).max(6),
  startHour: z.coerce.number().int().min(0).max(23),
  startMinute: z.coerce.number().int().min(0).max(59),
  label: optionalString,
});

export const addWeekSchema = z.object({
  periodId: z.string().min(1, "Choose the schedule this week belongs to"),
  weekOf: dateInput("Choose the date of the meeting"),
});

export const weekHeaderSchema = z.object({
  weekOf: dateInput("Choose the date of the meeting"),
  bibleReading: optionalString,
  chairmanId: optionalString,
  counselorId: optionalString,
  openingPrayerId: optionalString,
  closingPrayerId: optionalString,
  openingSong: optionalWhole("A song number is a whole number", 1, 999),
  livingSong: optionalWhole("A song number is a whole number", 1, 999),
  closingSong: optionalWhole("A song number is a whole number", 1, 999),
  cancelled: z.coerce.boolean(),
  cancelledReason: optionalString,
  note: optionalString,
});

export const partSchema = z.object({
  title: z.string().trim().min(1, "Give the part a title").max(140),
  section: z.enum(["TREASURES", "MINISTRY", "LIVING"]),
  kind: z.enum(["TALK", "READING", "STUDENT", "STUDY"]),
  minutes: optionalWhole("Minutes are a whole number", 1, 120),
  detail: optionalString,
  dualHall: z.coerce.boolean(),
});

// A student of the school who is not publishing yet. There are no reports and
// no group here on purpose: this roll is not the congregation's roll.
export const schoolStudentSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  gender: z.enum(["MALE", "FEMALE"]),
  dateOfBirth: optionalDate,
  phone: optionalString,
  guardianName: optionalString,
  guardianPhone: optionalString,
  conductorId: optionalString,
  enrolledAt: optionalDate,
  notes: optionalString,
  publisherId: optionalString,
});

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
