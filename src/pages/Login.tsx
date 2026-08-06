import { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { AerchainLogo } from "@/components/AerchainLogo";
import { COMPANY_NAME, COMPANY_FULL_NAME } from "@/config";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const Login = () => {
  const { signIn, session, loading, authDisabled } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (authDisabled) return <Navigate to="/" replace />;
  if (!loading && session) return <Navigate to={from} replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn(email, password);
    setBusy(false);
    if (res.ok) navigate(from, { replace: true });
    else setError(res.error ?? "Unable to sign in");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0F0F1A] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#6B4EFF] opacity-25 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-[#E8341C] opacity-15 blur-[100px]" />
        <AerchainLogo height={40} />
        <div className="relative max-w-md">
          <ShieldCheck className="mb-5 h-9 w-9 text-[#8B74FF]" />
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight">
            {COMPANY_NAME} Support Service Assurance
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-white/60">
            Secure, real-time visibility into SLA performance, ticket health, and
            service delivery for {COMPANY_FULL_NAME}.
          </p>
        </div>
        <div className="relative flex items-center justify-between">
          <p className="text-[12px] text-white/40">Authorised access only · © {new Date().getFullYear()} Aerchain</p>
          <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/40">{COMPANY_NAME}</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile-only brand header */}
          <div className="mb-8 lg:hidden">
            <AerchainLogo height={34} />
          </div>

          {/* Partner lockup */}
          <div className="mb-8 flex items-center gap-4">
            <span className="text-[17px] font-bold uppercase tracking-[0.14em] text-foreground/70">{COMPANY_NAME}</span>
            <span className="text-muted-foreground/40 text-lg font-light">×</span>
            <AerchainLogo height={32} />
          </div>

          <h2 className="font-display text-2xl font-bold tracking-tight">Sign in</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Enter your credentials to access the dashboard.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email" type="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@aerchain.io" className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password" type="password" autoComplete="current-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" className="pl-9"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…</> : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-[12px] text-muted-foreground">
            Access is restricted to authorised users. Contact your administrator for an account.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
