import { DataTable, EmptyState, Td, Th } from "@/components/shell";
import { Badge } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { formatWeekOf } from "@/lib/school";
import type { DocumentRow } from "@/lib/school-queries";
import { DeleteDocumentForm } from "./document-forms";

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** What kind of file it is, from the name it was filed under. */
function kindOf(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "PDF";
  if (ext === "doc" || ext === "docx") return "Word";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "Photo";
  return ext.toUpperCase() || "File";
}

/**
 * The filed schedules and workbook pages. Every row downloads through the app,
 * so the archive survives whatever happens to the phone or laptop it came from.
 */
export function DocumentTable({
  documents, canWrite, empty,
}: {
  documents: DocumentRow[];
  canWrite: boolean;
  empty?: string;
}) {
  if (documents.length === 0) {
    return (
      <EmptyState
        title="Nothing filed yet"
        description={empty ?? "Upload the schedules printed before the app, and the workbook pages you want to keep."}
      />
    );
  }

  return (
    <DataTable>
      <thead>
        <tr>
          <Th>Filed as</Th>
          <Th>File</Th>
          <Th>Schedule</Th>
          <Th align="right">Size</Th>
          <Th>Filed</Th>
          {canWrite && <Th align="right"></Th>}
        </tr>
      </thead>
      <tbody>
        {documents.map((doc) => (
          <tr key={doc.id} className="hover:bg-paper">
            <Td className="font-medium">{doc.label}</Td>
            <Td>
              <a
                href={`/api/school/documents/${doc.id}`}
                className="text-pine hover:underline"
                target="_blank"
                rel="noopener"
              >
                {doc.fileName}
              </a>
              <span className="ml-2">
                <Badge tone="quiet">{kindOf(doc.fileName)}</Badge>
              </span>
            </Td>
            <Td className="text-ink-soft">
              {doc.week
                ? formatWeekOf(doc.week.weekOf)
                : doc.period
                  ? doc.period.label
                  : "General"}
            </Td>
            <Td align="right" className="text-ink-soft">{size(doc.size)}</Td>
            <Td className="text-xs text-ink-faint">
              {formatDateTime(doc.createdAt)}
              {doc.uploadedBy && <span className="block">by {doc.uploadedBy.name}</span>}
            </Td>
            {canWrite && (
              <Td align="right">
                <DeleteDocumentForm id={doc.id} fileName={doc.fileName} />
              </Td>
            )}
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
