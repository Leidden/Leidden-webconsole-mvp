import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

import { prisma } from "@/lib/db";
import { signupSchema } from "@/lib/zod-schemas";
import { createCsAccount, deleteCsAccount, setResourceLimit } from "@/lib/cloudstack";
import { ensureCustomersDomain, DEFAULT_USER_LIMITS } from "@/lib/cs-customers";

function safeHandle(email: string): string {
  const base = email
    .replace(/@.*$/, "")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .toLowerCase()
    .slice(0, 32);
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

function strongPassword(): string {
  // CloudStack User에 저장될 placeholder 비밀번호.
  // 본 웹콘솔은 사용자 CloudStack User key를 노출하지 않으므로 사용자가 알 필요 없음.
  return crypto.randomBytes(24).toString("base64url");
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { email, password, name } = parsed.data;

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ error: "email_exists" }, { status: 409 });
  }

  let csAccountId: string | null = null;
  let domainId: string | null = null;
  const handle = safeHandle(email);

  try {
    domainId = await ensureCustomersDomain();
    const acct = await createCsAccount({
      account: handle,
      domainid: domainId,
      username: `${handle}-user`,
      password: strongPassword(),
      firstname: name ?? handle,
      lastname: "User",
      email
    });
    csAccountId = acct.id;

    for (const lim of DEFAULT_USER_LIMITS) {
      await setResourceLimit({
        account: handle,
        domainid: domainId,
        resourcetype: lim.resourcetype,
        max: lim.max
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name ?? null,
        csAccountName: handle,
        csDomainId: domainId,
        csAccountId
      }
    });

    return NextResponse.json({ ok: true, userId: user.id, csAccountName: handle });
  } catch (e) {
    // Rollback CloudStack Account so we don't orphan it.
    if (csAccountId) {
      try {
        await deleteCsAccount(csAccountId);
      } catch (rollbackErr) {
        console.error("[signup] cs rollback failed", rollbackErr);
      }
    }
    console.error("[signup] failed", e);
    return NextResponse.json(
      { error: "signup_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
