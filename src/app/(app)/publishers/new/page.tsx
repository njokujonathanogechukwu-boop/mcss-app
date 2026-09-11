import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/shell";
import { PublisherForm } from "../publisher-form";
import { createPublisher } from "../actions";

export default async function NewPublisherPage() {
  await requirePermission("publisher:write");
  const groups = await prisma.serviceGroup.findMany({
    where: { active: true },
    orderBy: { number: "asc" },
    select: { id: true, number: true, name: true },
  });

  return (
    <>
      <PageHeader
        title="Add a publisher"
        description="Only the name and sex are required. Everything else can be filled in later."
        back={{ href: "/publishers", label: "Publishers" }}
      />
      <div className="max-w-3xl">
        <PublisherForm
          action={createPublisher}
          groups={groups}
          submitLabel="Save publisher"
          cancelHref="/publishers"
        />
      </div>
    </>
  );
}
