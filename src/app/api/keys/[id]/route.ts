import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/cs-user";
import { deleteCsSshKey } from "@/lib/cloudstack";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const key = await prisma.sshKey.findFirst({
    where: { id: params.id, userId: user.id },
    select: { id: true, csName: true }
  });
  if (!key) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    await deleteCsSshKey({
      account: user.csAccountName,
      domainid: user.csDomainId,
      name: key.csName
    });
  } catch (e) {
    // If CloudStack already lost the key, log and continue with DB delete.
    console.warn(
      "[DELETE /api/keys/:id] CloudStack delete failed; continuing",
      e
    );
  }

  await prisma.sshKey.delete({ where: { id: key.id } });
  return NextResponse.json({ ok: true });
}
