"use server";

import { headers } from "next/headers";
import { guard } from "@/lib/auth";
import { ensureSelfToken } from "@/lib/self-service";

/**
 * Builds (on first use) and returns a publisher's personal update link. The
 * origin comes from the request so the same code works on the deployment and
 * on a laptop; the token is what authorises the holder, not the session.
 */
export async function revealLink(publisherId: string): Promise<{ url?: string; error?: string }> {
  const g = await guard("publisher:write");
  if (!g.ok) return { error: g.error };

  const token = await ensureSelfToken(publisherId);
  if (!token) return { error: "That publisher no longer exists." };

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host");
  if (!host) return { error: "Could not work out the site address." };

  return { url: `${proto}://${host}/my/${token}` };
}
