import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/cs-user";
import { uploadKeySchema } from "@/lib/zod-schemas";
import { registerCsSshKey } from "@/lib/cloudstack";

const MAX_KEYS_PER_USER = 5;

export async function GET() {
  try {
    const user = await requireUser();
    const keys = await prisma.sshKey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        fingerprint: true,
        source: true,
        createdAt: true
      }
    });
    return NextResponse.json({ keys });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[GET /api/keys] failed", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = uploadKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { name, publicKey } = parsed.data;

  const count = await prisma.sshKey.count({ where: { userId: user.id } });
  if (count >= MAX_KEYS_PER_USER) {
    return NextResponse.json(
      { error: "key_limit_reached", limit: MAX_KEYS_PER_USER },
      { status: 409 }
    );
  }

  let csCreated = false;
  try {
    const kp = await registerCsSshKey({
      account: user.csAccountName,
      domainid: user.csDomainId,
      name,
      publickey: publicKey.trim()
    });
    csCreated = true;

    const row = await prisma.sshKey.create({
      data: {
        userId: user.id,
        name,
        fingerprint: kp.fingerprint,
        source: "uploaded",
        csName: name
      },
      select: {
        id: true,
        name: true,
        fingerprint: true,
        source: true,
        createdAt: true
      }
    });

    return NextResponse.json({ ok: true, key: row });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // unique violation on (userId, name)
      return NextResponse.json({ error: "name_in_use" }, { status: 409 });
    }
    if (csCreated) {
      // CloudStack succeeded but DB write failed → roll back CS key.
      try {
        const { deleteCsSshKey } = await import("@/lib/cloudstack");
        await deleteCsSshKey({
          account: user.csAccountName,
          domainid: user.csDomainId,
          name
        });
      } catch (rollbackErr) {
        console.error("[POST /api/keys] cs rollback failed", rollbackErr);
      }
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("already exists")) {
      return NextResponse.json({ error: "name_in_use" }, { status: 409 });
    }
    console.error("[POST /api/keys] failed", e);
    return NextResponse.json(
      { error: "upload_failed", message: msg },
      { status: 500 }
    );
  }
}
