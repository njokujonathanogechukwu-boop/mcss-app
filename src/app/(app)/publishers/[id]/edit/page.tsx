import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { toDateInput, displayName } from "@/lib/format";
import { PageHeader } from "@/components/shell";
import { PublisherForm } from "../../publisher-form";
import { updatePublisher } from "../../actions";

export default async function EditPublisherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("publisher:write");
  const { id } = await params;

  const [publisher, groups] = await Promise.all([
    prisma.publisher.findUnique({ where: { id } }),
    prisma.serviceGroup.findMany({
      where: { active: true },
      orderBy: { number: "asc" },
      select: { id: true, number: true, name: true },
    }),
  ]);
  if (!publisher) notFound();

  const bound = updatePublisher.bind(null, id);

  return (
    <>
      <PageHeader
        title={`Edit ${displayName(publisher)}`}
        back={{ href: `/publishers/${id}`, label: "Back to the record" }}
      />
      <div className="max-w-3xl">
        <PublisherForm
          action={bound}
          groups={groups}
          submitLabel="Save changes"
          cancelHref={`/publishers/${id}`}
          publisher={{
            ...publisher,
            dateOfBirth: toDateInput(publisher.dateOfBirth),
            baptismDate: toDateInput(publisher.baptismDate),
            sinceDate: toDateInput(publisher.sinceDate),
          }}
        />
      </div>
    </>
  );
}
