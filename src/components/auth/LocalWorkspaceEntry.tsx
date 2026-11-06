import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LocalWorkspaceEntry() {
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
    <h1 className="text-2xl font-semibold">Your local workspace</h1>
    <p>Open your workspace on this computer. No sign-in is needed.</p>
    <Button asChild><Link href="/dashboard">Open workspace</Link></Button>
  </main>;
}
