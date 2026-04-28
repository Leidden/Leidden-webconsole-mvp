import Link from "next/link";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-bold mb-2">Create account</h1>
      <p className="text-sm text-gray-600 mb-6">
        Web Console MVP — stage 1
      </p>

      <SignupForm />

      <p className="text-sm text-gray-600 mt-6">
        Already have an account?{" "}
        <Link href="/login" className="text-blue-700 underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
