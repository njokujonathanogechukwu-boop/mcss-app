import { requirePermission } from "@/lib/auth";
import { PageHeader, Section } from "@/components/shell";
import { ImportTool } from "./import-tool";

export default async function ImportPage() {
  await requirePermission("import:run");

  return (
    <>
      <PageHeader
        title="Import existing records"
        description="Bring your current publisher roster across from a spreadsheet. The rows are checked before anything is written, and the whole batch either lands or none of it does."
      />

      <Section>
        <ImportTool />
      </Section>

      <Section title="What the importer looks for">
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
            Field service history is not imported here; enter it on the report sheet, month by
            month, or keep the old sheets as your archive for past service years.
          </p>
        </div>
      </Section>
    </>
  );
}
