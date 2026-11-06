import NextAuth, { type Session } from "next-auth";
import { headers } from "next/headers";
import { localModeEnabled, isLoopbackRequest } from "@/lib/local-mode";
import { getLocalUser } from "@/lib/local-user";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { User } from "./models/user.model";
import prisma from "./lib/db";

async function getUser(email: string): Promise<User | undefined> {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });
    return user || undefined;
  } catch (error) {
    console.error("Failed to fetch user:", error);
    throw new Error("Failed to fetch user.");
  }
}

const { auth: sessionAuth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;
          const user = await getUser(email);
          if (!user) return null;
          const passwordsMatch = await bcrypt.compare(password, user.password);
          if (passwordsMatch) return user;
        }
        console.log("Invalid credentials");
        return null;
      },
    }),
  ],
});

export { handlers, signIn, signOut };

export async function auth(): Promise<Session | null> {
  if (!localModeEnabled()) return sessionAuth();
  if (!isLoopbackRequest(await headers())) return null;
  return { user: await getLocalUser(), expires: new Date(Date.now() + 86400000).toISOString() };
}
