import type { Metadata } from "next";
import { ForgotPasswordScreen } from "@/frontend/screens/auth/forgot-password-screen";

export const metadata: Metadata = { title: "Reset your password" };

export default function Page() {
  return <ForgotPasswordScreen />;
}
