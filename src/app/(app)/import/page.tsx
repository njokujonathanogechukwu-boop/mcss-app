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
        description="Bring your publisher roster and past field service reports across from a spreadsheet. Every sheet is checked and shown to you before anything is written, and each batch either lands whole or not at all."
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
            <li>Cards must be the fillable PDF, saved with the boxes filled in. A scanned or printed card cannot be read; enter those on the Field service sheets tab instead.</li>
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
    </>
  );
}
