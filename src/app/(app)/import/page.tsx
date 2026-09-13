import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { serviceYearOptions } from "@/lib/service-year";
import { PageHeader, Section } from "@/components/shell";
import { ImportTool } from "./import-tool";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requirePermission("import:run");

  const publishers = await prisma.publisher.findMany({
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="Import existing records"
        description="Bring your publisher roster, past field service reports and meeting attendance across from a spreadsheet. Every sheet is checked and shown to you before anything is written, and each batch either lands whole or not at all."
      />

      <Section>
        <ImportTool
          publishers={publishers.map((p) => ({ id: p.id, name: `${p.lastName}, ${p.firstName}` }))}
          serviceYears={serviceYearOptions(12)}
        />
      </Section>

      <Section title="Publisher roster: what the importer looks for">
        <div className="rounded border border-rule bg-surface p-5 text-sm leading-relaxed text-ink-soft">
          <p className="mb-3">
            Column headings are matched loosely, so “Surname”, “Last Name” and “Family Name” all
            work. These are the columns it understands:
          </p>
          <dl className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {[
              ["Name", "or First name and Last name separately"],
              ["Sex", "M, F, male, female, brother, sister"],
              ["Date of baptism", "dd/mm/yyyy or yyyy-mm-dd"],
              ["Date of birth", "same formats"],
              ["Service group", "a number or a group name"],
              ["Appointment", "elder, ministerial servant, publisher"],
              ["Pioneer", "regular, auxiliary, special"],
              ["Status", "active, irregular, inactive"],
              ["Phone, Email, Address", "kept as written"],
              ["Emergency contact", "name and phone"],
              ["Notes", "kept as written"],
            ].map(([term, detail]) => (
              <div key={term} className="flex gap-2 border-b border-rule py-1 last:border-0">
                <dt className="w-40 shrink-0 text-ink">{term}</dt>
                <dd className="text-xs text-ink-faint">{detail}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs">
            Anything the importer does not recognise is listed in the preview and left out.
          </p>
        </div>
      </Section>

      <Section title="S-21 cards: what is read from each PDF">
        <div className="rounded border border-rule bg-surface p-5 text-sm leading-relaxed text-ink-soft">
          <p className="mb-3">
            Upload the filled-in Congregation’s Publisher Record PDFs, as many as you like at a
            time. From each card the importer reads the name, sex, dates of birth and baptism,
            appointment and pioneer standing, then every month row that has anything in it:
            shared in ministry, Bible studies, auxiliary pioneer, hours and remarks. The service
            year is taken from the card.
          </p>
          <ul className="list-inside list-disc space-y-1 text-xs text-ink-faint">
            <li>A card for someone already on file adds their months to the existing record. Dates of birth and baptism are filled in if the record had none; nothing else on the record is changed.</li>
            <li>A card for someone not on file creates their publisher record. Set their service group afterwards.</li>
            <li>A card filled in on the PDF is read from its fields. A card that was printed, filled in by hand and saved back to PDF is read from where the writing sits on the page, so it works too.</li>
            <li>A card saved as a scanned picture has no text in it to read. It is flagged below and a grid is shown for it: type in what is on the card and it is imported exactly like one that was read.</li>
          </ul>
        </div>
      </Section>

      <Section title="Field service sheets: the layouts it can read">
        <div className="rounded border border-rule bg-surface p-5 text-sm leading-relaxed text-ink-soft">
          <p className="mb-3">
            Import the publishers first. Every report is attached to a publisher already on file,
            matched by name in either order (“Adebayo Samuel” and “Samuel Adebayo” both work).
            Three layouts are recognised automatically:
          </p>
          <dl className="space-y-3">
            <div>
              <dt className="text-ink">A grid: names down the side, months across the top</dt>
              <dd className="text-xs text-ink-faint">
                Headings like “Sep 2025”, “September”, “09/2025”. When a heading has no year, the
                service year you pick fills it in. A blank cell means no report. A number is read as
                hours, studies, or just a tick, whichever you choose above. Extras that old sheets
                use are understood: “52 (3)” or “52/3” for hours with studies, “AP” for an
                auxiliary pioneer month, “0” or “-” for did not share.
              </dd>
            </div>
            <div>
              <dt className="text-ink">A list: one row per publisher per month</dt>
              <dd className="text-xs text-ink-faint">
                Columns: Name, Month (with or without the year; a separate Year column also works),
                and any of Shared, Studies, Hours, Aux, Remarks.
              </dd>
            </div>
            <div>
              <dt className="text-ink">One S-21 card</dt>
              <dd className="text-xs text-ink-faint">
                Twelve month rows with Shared, Studies, Hours and Remarks, and no name column.
                Choose whose card it is before checking the sheet. Total and average rows are ignored.
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs">
            Months already on file are left alone unless you choose to replace them. Hours on a
            non-pioneer month are kept as written, since every publisher reported hours before
            November 2023. Imported reports are marked as imported in the audit log.
          </p>
        </div>
      </Section>

      <Section title="Meeting attendance: the layouts it can read">
        <div className="rounded border border-rule bg-surface p-5 text-sm leading-relaxed text-ink-soft">
          <p className="mb-3">
            Attendance is kept one meeting at a time, so that the S-88 can be filled from it later.
            Choose where the figures are: a filled-in S-88, or a spreadsheet. Two spreadsheet layouts
            are recognised, and one sheet may mix them:
          </p>
          <dl className="space-y-3">
            <div>
              <dt className="text-ink">A filled-in S-88 (PDF)</dt>
              <dd className="text-xs text-ink-faint">
                The Congregation Meeting Attendance Record as saved from the PDF with its boxes
                filled in. One form carries two service years of both meetings: the midweek meeting
                across the top, the weekend meeting below, the earlier year on the left of each half
                and the later one on the right, every block running September to August. Several
                files may be uploaded at once, about 5 MB per batch. The form keeps one attendance
                figure and does not split it between the hall and video, so each meeting is recorded
                as that many present in the hall. A printed or scanned S-88 has no boxes left to
                read; type its months into a spreadsheet and use the sheet instead.
              </dd>
            </div>
            <div>
              <dt className="text-ink">A list: one row per meeting</dt>
              <dd className="text-xs text-ink-faint">
                Columns: Date (dd/mm/yyyy, yyyy-mm-dd or “12 Mar 2025”), Meeting (midweek or
                weekend, when the sheet says), In person or Hall, Video or Zoom, Total, Notes.
              </dd>
            </div>
            <div>
              <dt className="text-ink">A month per row, the way an old S-88 keeps it</dt>
              <dd className="text-xs text-ink-faint">
                Columns: Month, then any of Meetings held, Total attendance and Average — each may
                be named for its meeting, as on the form (“Midweek total”, “Weekend average”). The
                month’s total is shared out over the weekdays you choose, so the sum comes out
                exactly as written and the meeting count stays right. Where the sheet gives no
                meeting count, every weekday that has already passed is used.
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs">
            Only meetings that have already happened can be recorded, so a month still ahead, or the
            part of this month that has not come round yet, is left out and reported. Where more
            meetings were held in a month than the chosen weekday falls in it — a special meeting, or
            a week the meeting moved — the extra ones go on the free days nearest them, so the count
            and the total still come out exactly as written, and each is reported. A figure already
            on file for a meeting is left alone unless you choose to replace it.
          </p>
        </div>
      </Section>
    </>
  );
}
