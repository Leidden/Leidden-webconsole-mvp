import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function logout() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      csAccountName: true,
      csDomainId: true,
      csAccountId: true,
      createdAt: true,
      _count: { select: { sshKeys: true, vms: true } }
    }
  });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-600 mt-1">
            Welcome{user?.name ? `, ${user.name}` : ""} ({session.user.email})
          </p>
        </div>
        <form action={logout}>
          <button className="rounded border px-3 py-1 text-sm hover:bg-gray-100">
            Sign out
          </button>
        </form>
      </header>

      <nav className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
        <Link
          href="/dashboard/vms"
          className="rounded border bg-white p-4 shadow-sm hover:bg-gray-50"
        >
          <div className="font-semibold">Virtual machines</div>
          <div className="text-xs text-gray-600 mt-1">
            {user?._count.vms ?? 0} VM(s) · deploy/start/stop/destroy
          </div>
        </Link>
        <Link
          href="/dashboard/keys"
          className="rounded border bg-white p-4 shadow-sm hover:bg-gray-50"
        >
          <div className="font-semibold">SSH keys</div>
          <div className="text-xs text-gray-600 mt-1">
            {user?._count.sshKeys ?? 0} key(s) · upload or generate
          </div>
        </Link>
      </nav>

      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-lg mb-4">Your CloudStack mapping</h2>
        <dl className="text-sm grid grid-cols-2 gap-2">
          <dt className="text-gray-500">Account handle</dt>
          <dd className="font-mono">{user?.csAccountName}</dd>
          <dt className="text-gray-500">Account id</dt>
          <dd className="font-mono break-all">{user?.csAccountId}</dd>
          <dt className="text-gray-500">Domain id</dt>
          <dd className="font-mono break-all">{user?.csDomainId}</dd>
          <dt className="text-gray-500">Created</dt>
          <dd>{user?.createdAt?.toISOString()}</dd>
        </dl>
      </section>
    </main>
  );
}
