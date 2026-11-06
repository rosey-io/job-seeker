import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { localModeEnabled } from "@/lib/local-mode";
import { Metadata } from "next";
import AuthCard from "@/components/auth/AuthCard";

export const metadata: Metadata = {
  title: "Sign Up",
};

export default async function Signup() {
  if (localModeEnabled() && await auth()) redirect("/dashboard");
  return <AuthCard mode="signup" />;
}
