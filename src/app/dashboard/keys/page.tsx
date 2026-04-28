import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { KeysClient } from "./keys-client";

export const dynamic = "force-dynamic";

export default async function SshKeysPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const keys = await prisma.sshKey.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      fingerprint: true,
      source: true,
      createdAt: true
    }
  });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SSH keys</h1>
          <p className="text-sm text-gray-600 mt-1">
            Upload an existing public key, or have us generate one for you.
            Generated private keys are shown only once.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-blue-700 underline"
        >
          ← Back to dashboard
        </Link>
      </header>

      <KeysClient
        initialKeys={keys.map((k) => ({
          id: k.id,
          name: k.name,
          fingerprint: k.fingerprint,
          source: k.source,
          createdAt: k.createdAt.toISOString()
        }))}
      />
    </main>
  );
}
