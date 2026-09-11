import "server-only";
import { prisma } from "@/lib/prisma";

export type Clash = {
  id: string;
  requestingBody: string;
  eventType: string;
  startTime: Date;
  endTime: Date;
};

/**
 * Finds approved bookings that overlap the requested window for the same
 * resource. Two intervals overlap when each starts before the other ends.
 * The comparison runs in the database so the check stays correct and fast
 * as the calendar fills up.
 */
export async function findClashes(
  resourceId: string,
  start: Date,
  end: Date,
  excludeBookingId?: string,
): Promise<Clash[]> {
  return prisma.hallBooking.findMany({
    where: {
      resourceId,
      status: "APPROVED",
      startTime: { lt: end },
      endTime: { gt: start },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: {
      id: true,
      requestingBody: true,
      eventType: true,
      startTime: true,
      endTime: true,
    },
    orderBy: { startTime: "asc" },
  });
}
