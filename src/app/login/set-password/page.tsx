import type { Metadata } from "next";
import { SetPasswordScreen } from "@/frontend/screens/auth/set-password-screen";

export const metadata: Metadata = { title: "Set your password" };

export default function Page() {
  return <SetPasswordScreen />;
}
