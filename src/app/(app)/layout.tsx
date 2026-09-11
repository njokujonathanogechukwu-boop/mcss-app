import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { Nav } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Nav user={{ name: user.name, role: user.role }} signOutAction={signOut} />
      <main className="min-w-0 flex-1 px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
