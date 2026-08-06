import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "super_admin" | "user";
    } & DefaultSession["user"];
  }

  interface User {
    role: "super_admin" | "user";
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser {
    role: "super_admin" | "user";
  }
}
