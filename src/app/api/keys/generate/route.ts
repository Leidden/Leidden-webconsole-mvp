import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/cs-user";
import { generateKeySchema } from "@/lib/zod-schemas";
import { createCsSshKey, deleteCsSshKey } from "@/lib/cloudstack";

const MAX_KEYS_PER_USER = 5;

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
  const parsed = generateKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { name } = parsed.data;

  const count = await prisma.sshKey.count({ where: { userId: user.id } });
  if (count >= MAX_KEYS_PER_USER) {
    return NextResponse.json(
      { error: "key_limit_reached", limit: MAX_KEYS_PER_USER },
      { status: 409 }
    );
  }

  let csCreated = false;
  let privateKey: string | null = null;
  try {
    const kp = await createCsSshKey({
      account: user.csAccountName,
      domainid: user.csDomainId,
      name
    });
    csCreated = true;
    privateKey = kp.privatekey;

    const row = await prisma.sshKey.create({
      data: {
        userId: user.id,
        name,
        fingerprint: kp.fingerprint,
        source: "generated",
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

    // Private key is sent to the client EXACTLY ONCE.
    // Backend does not persist it anywhere.
    return NextResponse.json({
      ok: true,
      key: row,
      privateKey
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // unique violation; rollback CS
      if (csCreated) {
        try {
          await deleteCsSshKey({
            account: user.csAccountName,
            domainid: user.csDomainId,
            name
          });
        } catch (rb) {
          console.error("[POST /api/keys/generate] cs rollback failed", rb);
        }
      }
      return NextResponse.json({ error: "name_in_use" }, { status: 409 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (csCreated) {
      try {
        await deleteCsSshKey({
          account: user.csAccountName,
          domainid: user.csDomainId,
          name
        });
      } catch (rb) {
        console.error("[POST /api/keys/generate] cs rollback failed", rb);
      }
    }
    if (msg.includes("already exists")) {
      return NextResponse.json({ error: "name_in_use" }, { status: 409 });
    }
    console.error("[POST /api/keys/generate] failed", e);
    return NextResponse.json(
      { error: "generate_failed", message: msg },
      { status: 500 }
    );
  } finally {
    privateKey = null;
  }
}
