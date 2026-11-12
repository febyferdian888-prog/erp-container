import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public liveness check: one trivial query so the database round trip from this region can be timed.
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`select 1`;
    return NextResponse.json({ ok: true, dbMs: Date.now() - started, region: process.env.VERCEL_REGION ?? null });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
