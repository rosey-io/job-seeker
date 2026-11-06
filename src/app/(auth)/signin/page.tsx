import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { localModeEnabled } from "@/lib/local-mode";
import { Metadata } from "next";
import LocalWorkspaceEntry from "@/components/auth/LocalWorkspaceEntry";
import AuthCard from "@/components/auth/AuthCard";

export const metadata: Metadata = {
  title: localModeEnabled() ? "Your workspace" : "Sign In",
};

export default async function Signin() {
  if (localModeEnabled()) {
    if (await auth()) redirect("/dashboard");
    return <LocalWorkspaceEntry />;
  }
  return <AuthCard mode="signin" />;
}
