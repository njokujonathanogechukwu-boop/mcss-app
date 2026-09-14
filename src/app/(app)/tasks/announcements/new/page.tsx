import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { aiConfigured } from "@/lib/ai";
import { PageHeader } from "@/components/shell";
import { AnnouncementComposer } from "../../announcement-composer";

export const dynamic = "force-dynamic";

export default async function NewAnnouncementPage() {
  const user = await requirePermission("announcement:write");
  return (
    <>
      <PageHeader
        title="New announcement"
        description="Type the key details, draft the wording with AI if you like, then edit and approve it."
        back={{ href: "/tasks", label: "Back to tasks" }}
      />
      <div className="max-w-2xl">
        <AnnouncementComposer
          aiEnabled={aiConfigured()}
          canApprove={can(user.role, "announcement:approve")}
        />
      </div>
    </>
  );
}
