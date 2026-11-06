// The login screen, shown when the server has APP_USERNAME and APP_PASSWORD
// set and this browser has no session. Afterwards it returns to ?next=.
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { useLogin, useSession } from "../api/session";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { TextField } from "../components/TextField";
import { safeNext } from "../login/next";

export function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const navigate = useNavigate();
  const session = useSession();
  const login = useLogin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  if (session.data?.loggedIn && !login.isPending) return <Navigate to={next} replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ username: username.trim(), password }, {
      onSuccess: () => navigate(next, { replace: true }),
      onError: () => setPassword(""),
    });
  };

  return (
    <AppShell nav={false}>
      <PageHeader title="Log in" summary="Shelf Organiser" />
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField label="Username" value={username} onChange={setUsername} autoComplete="username"
          autoCapitalize="none" autoCorrect="off" spellCheck={false} required autoFocus />
        <TextField label="Password" type="password" value={password} onChange={setPassword}
          autoComplete="current-password" required />
        {login.error && <Banner>{login.error.message}</Banner>}
        <Button type="submit" variant="primary" block busy={login.isPending} disabled={!username.trim() || !password}>
          Log in
        </Button>
      </form>
    </AppShell>
  );
}
