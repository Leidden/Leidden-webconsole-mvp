"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";

export async function loginAction(formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const code =
        error.type === "CredentialsSignin" ? "credentials" : "unknown";
      redirect(`/login?error=${code}`);
    }
    throw error;
  }
  redirect("/dashboard");
}
