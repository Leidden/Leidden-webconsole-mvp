import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

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
      createdAt: true
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
        <p className="text-xs text-gray-500 mt-6">
          Next stages: SSH key management, VM lifecycle, console access. See
          webconsole-mvp-design.md.
        </p>
      </section>
    </main>
  );
}
