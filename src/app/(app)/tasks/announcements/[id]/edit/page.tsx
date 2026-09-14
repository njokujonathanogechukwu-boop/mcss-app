import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { aiConfigured } from "@/lib/ai";
import { toDateInput } from "@/lib/format";
import { PageHeader } from "@/components/shell";
import { AnnouncementComposer } from "../../../announcement-composer";

export const dynamic = "force-dynamic";

export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("announcement:write");
  const { id } = await params;

  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) notFound();

  return (
    <>
      <PageHeader
        title="Edit announcement"
        back={{ href: "/tasks", label: "Back to tasks" }}
      />
      <div className="max-w-2xl">
        <AnnouncementComposer
          aiEnabled={aiConfigured()}
          canApprove={can(user.role, "announcement:approve")}
          existing={{
            id: announcement.id,
            title: announcement.title,
            body: announcement.body,
            eventDate: toDateInput(announcement.eventDate),
            aiDrafted: announcement.aiDrafted,
          }}
        />
      </div>
    </>
  );
}
