import Link from "next/link";
import { loginAction } from "./login-actions";

export default function LoginPage({
  searchParams
}: {
  searchParams?: { error?: string };
}) {
  const error = searchParams?.error;

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-bold mb-2">Sign in</h1>
      <p className="text-sm text-gray-600 mb-6">
        Web Console MVP — stage 1
      </p>

      <form action={loginAction} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded border px-3 py-2 text-sm"
          />
        </div>
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
            {error === "credentials"
              ? "Invalid email or password."
              : "Login failed. Please try again."}
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded bg-gray-900 text-white py-2 text-sm hover:bg-gray-800"
        >
          Sign in
        </button>
      </form>

      <p className="text-sm text-gray-600 mt-6">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-blue-700 underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
