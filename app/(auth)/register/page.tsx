import { AuthForm } from "@/components/auth/AuthForm";
import { signUp } from "@/lib/actions/auth";

export default function RegisterPage() {
  return <AuthForm mode="register" action={signUp} />;
}
