import { AuthForm } from "@/components/auth/AuthForm";
import { signIn } from "@/lib/actions/auth";

export default function LoginPage() {
  return <AuthForm mode="login" action={signIn} />;
}
