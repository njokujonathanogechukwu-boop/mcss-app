import Papa from "papaparse";

/**
 * Header aliases. Legacy sheets label the same column half a dozen ways,
 * so matching is done on a normalised key rather than an exact string.
 */
const ALIASES: Record<string, string[]> = {
  firstName: ["firstname", "first", "givenname", "forename", "othernames"],
  lastName: ["lastname", "last", "surname", "familyname"],
  fullName: ["name", "fullname", "publishername", "publisher"],
  gender: ["gender", "sex", "mf"],
  dateOfBirth: ["dateofbirth", "dob", "birthdate", "birthday"],
  baptismDate: ["baptismdate", "dateofbaptism", "baptism", "baptised", "baptized"],
  appointment: ["appointment", "appointmentstatus", "privilege", "servicestatus", "position"],
  pioneerStatus: ["pioneer", "pioneerstatus", "pioneering"],
  group: ["group", "servicegroup", "fieldservicegroup", "groupnumber", "grp"],
  status: ["status", "standing", "recordstatus", "active"],
  phone: ["phone", "phonenumber", "mobile", "tel", "telephone", "contact"],
  email: ["email", "emailaddress", "mail"],
  address: ["address", "homeaddress", "residence"],
  emergencyContactName: ["emergencycontact", "emergencycontactname", "nextofkin"],
  emergencyContactPhone: ["emergencycontactphone", "emergencyphone", "nextofkinphone"],
  notes: ["notes", "remarks", "comment", "comments"],
};

function normalise(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function mapHeaders(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((header, index) => {
    const key = normalise(header);
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (map[field] === undefined && aliases.includes(key)) map[field] = index;
    }
  });
  return map;
}

function parseDate(value: string): Date | null {
  const raw = value.trim();
  if (!raw) return null;

  // dd/mm/yyyy and dd-mm-yyyy, which is how dates are written locally.
  const dmy = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const iso = new Date(raw);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

function parseGender(value: string): "MALE" | "FEMALE" | null {
  const v = value.trim().toLowerCase();
  if (["m", "male", "brother", "bro"].includes(v)) return "MALE";
  if (["f", "female", "sister", "sis"].includes(v)) return "FEMALE";
  return null;
}

function parseAppointment(value: string) {
  const v = value.trim().toLowerCase();
  if (v.includes("elder")) return "ELDER" as const;
  if (v.includes("servant") || v === "ms") return "MINISTERIAL_SERVANT" as const;
  return "PUBLISHER" as const;
}

function parsePioneer(value: string) {
  const v = value.trim().toLowerCase();
  if (v.includes("special")) return "SPECIAL" as const;
  if (v.includes("regular") || v === "rp") return "REGULAR" as const;
  if (v.includes("aux") || v === "ap") return "AUXILIARY" as const;
  return "NONE" as const;
}

function parseStatus(value: string) {
  const v = value.trim().toLowerCase();
  if (!v) return "ACTIVE" as const;
  if (v.includes("irregular")) return "IRREGULAR" as const;
  if (v.includes("inactive") || v === "no" || v === "false") return "INACTIVE" as const;
  if (v.includes("transfer")) return "TRANSFERRED_OUT" as const;
  if (v.includes("decease") || v.includes("died")) return "DECEASED" as const;
  return "ACTIVE" as const;
}

function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim().replace(/\s+/g, " ");
  if (trimmed.includes(",")) {
    const [last, rest] = trimmed.split(",");
    return { firstName: (rest ?? "").trim(), lastName: last.trim() };
  }
  const parts = trimmed.split(" ");
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

export type ParsedRow = {
  line: number;
  firstName: string;
  lastName: string;
  gender: "MALE" | "FEMALE";
  dateOfBirth: Date | null;
  baptismDate: Date | null;
  isBaptized: boolean;
  appointment: "PUBLISHER" | "MINISTERIAL_SERVANT" | "ELDER";
  pioneerStatus: "NONE" | "AUXILIARY" | "REGULAR" | "SPECIAL";
  status: "ACTIVE" | "IRREGULAR" | "INACTIVE" | "TRANSFERRED_OUT" | "DECEASED";
  groupLabel: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
};

export type ParseResult = {
  rows: ParsedRow[];
  problems: { line: number; message: string }[];
  recognised: string[];
  ignored: string[];
};

export function parseCsv(csv: string): ParseResult {
  const result = Papa.parse<string[]>(csv.trim(), { skipEmptyLines: true });
  const problems: { line: number; message: string }[] = [];

  if (result.data.length < 2) {
    return { rows: [], problems: [{ line: 0, message: "Needs a header row and at least one record." }], recognised: [], ignored: [] };
  }

  const headers = result.data[0].map((h) => String(h ?? ""));
  const map = mapHeaders(headers);

  if (map.firstName === undefined && map.lastName === undefined && map.fullName === undefined) {
    return {
      rows: [],
      problems: [{ line: 1, message: "No name column found. Include a column called Name, or First name and Last name." }],
      recognised: [],
      ignored: headers,
    };
  }

  const usedIndexes = new Set(Object.values(map));
  const recognised = Object.keys(map);
  const ignored = headers.filter((_, i) => !usedIndexes.has(i));

  const get = (row: string[], field: string) => {
    const index = map[field];
    return index === undefined ? "" : String(row[index] ?? "").trim();
  };

  const rows: ParsedRow[] = [];

  for (let i = 1; i < result.data.length; i++) {
    const row = result.data[i];
    const line = i + 1;

    let firstName = get(row, "firstName");
    let lastName = get(row, "lastName");
    if (!firstName && !lastName) {
      const full = get(row, "fullName");
      if (!full) continue; // a blank line, not an error
      ({ firstName, lastName } = splitName(full));
    }

    if (!firstName && !lastName) {
      problems.push({ line, message: "No name in this row." });
      continue;
    }
    if (!lastName) {
      lastName = firstName;
      firstName = "";
      problems.push({ line, message: `Only one name given; recorded as a surname.` });
    }

    const genderRaw = get(row, "gender");
    const gender = parseGender(genderRaw);
    if (!gender) {
      problems.push({
        line,
        message: `Sex "${genderRaw || "blank"}" was not recognised for ${firstName} ${lastName}. Set it after importing.`,
      });
    }

    const baptismDate = parseDate(get(row, "baptismDate"));
    const dobRaw = get(row, "dateOfBirth");
    const dateOfBirth = parseDate(dobRaw);
    if (dobRaw && !dateOfBirth) {
      problems.push({ line, message: `Could not read the date of birth "${dobRaw}".` });
    }

    rows.push({
      line,
      firstName: firstName || "—",
      lastName,
      gender: gender ?? "MALE",
      dateOfBirth,
      baptismDate,
      isBaptized: Boolean(baptismDate),
      appointment: parseAppointment(get(row, "appointment")),
      pioneerStatus: parsePioneer(get(row, "pioneerStatus")),
      status: parseStatus(get(row, "status")),
      groupLabel: get(row, "group") || null,
      phone: get(row, "phone") || null,
      email: get(row, "email") || null,
      address: get(row, "address") || null,
      emergencyContactName: get(row, "emergencyContactName") || null,
      emergencyContactPhone: get(row, "emergencyContactPhone") || null,
      notes: get(row, "notes") || null,
    });
  }

  return { rows, problems, recognised, ignored };
}
