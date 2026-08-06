import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in" };

/** No console chrome — the operator is not signed in yet. */
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
