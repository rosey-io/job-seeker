import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { localModeEnabled } from "@/lib/local-mode";
import { Metadata } from "next";
import AuthCard from "@/components/auth/AuthCard";

export const metadata: Metadata = {
  title: "Sign In",
};

export default async function Signin() {
  if (localModeEnabled() && await auth()) redirect("/dashboard");
  return <AuthCard mode="signin" />;
}
