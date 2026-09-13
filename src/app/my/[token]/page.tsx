import { prisma } from "@/lib/prisma";
import { toDateInput, displayName } from "@/lib/format";
import { SelfForm } from "./self-form";

export const dynamic = "force-dynamic";

export default async function MyDetailsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const publisher = await prisma.publisher.findUnique({
    where: { selfToken: token },
    select: {
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      baptismDate: true,
      isBaptized: true,
      phone: true,
      email: true,
      address: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
    },
  });

  return (
    <main className="min-h-screen bg-paper px-4 py-10">
      <div className="mx-auto grid max-w-2xl gap-6">
        <header className="grid gap-1 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            Maitama Congregation
          </p>
          <h1 className="font-serif text-2xl text-ink">Check and update your details</h1>
          <p className="text-sm text-ink-soft">
            Please make sure everything below is correct, then press save. Keeping your phone
            number and emergency contact current helps the congregation reach you when it matters.
          </p>
        </header>

        {publisher ? (
          <>
            <p className="rounded border border-rule bg-surface px-4 py-2 text-center text-sm text-ink-soft">
              Signed in as <span className="font-medium text-ink">{displayName(publisher)}</span>
            </p>
            <SelfForm
              token={token}
              publisher={{
                firstName: publisher.firstName,
                lastName: publisher.lastName,
                dateOfBirth: toDateInput(publisher.dateOfBirth),
                baptismDate: toDateInput(publisher.baptismDate),
                isBaptized: publisher.isBaptized,
                phone: publisher.phone ?? "",
                email: publisher.email ?? "",
                address: publisher.address ?? "",
                emergencyContactName: publisher.emergencyContactName ?? "",
                emergencyContactPhone: publisher.emergencyContactPhone ?? "",
              }}
            />
          </>
        ) : (
          <div className="rounded border border-clay/40 bg-clay-light px-6 py-8 text-center">
            <p className="font-serif text-lg text-clay">This link is not valid</p>
            <p className="mt-1 text-sm text-ink-soft">
              The link may have been replaced. Please contact the secretary for a new one.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
