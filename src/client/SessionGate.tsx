import { useEffect, useState, type ReactNode } from "react";
import { LoginScreen } from "./LoginScreen";

// Fase 29 (SPEC-028 s8/s24). Restaura a sessao no boot (`GET /api/me`) e mostra a tela de login
// quando nao ha sessao valida -- nunca redesenha o restante da interface (`App.tsx` permanece
// intocado). Em `import.meta.env.DEV`, este gate e um passthrough: dev-auth continua resolvendo
// Actor via headers, sem nenhum conceito de sessao/login (ADR-0026 "Dev/test auth").
export function SessionGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">(
    import.meta.env.DEV ? "authenticated" : "checking"
  );

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let cancelled = false;
    fetch("/api/me", { credentials: "include" })
      .then((response) => {
        if (cancelled) return;
        setStatus(response.ok ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (!cancelled) setStatus("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    setStatus("unauthenticated");
  }

  if (status === "checking") {
    return <div className="session-checking">Verificando sessao...</div>;
  }

  if (status === "unauthenticated") {
    return <LoginScreen onAuthenticated={() => setStatus("authenticated")} />;
  }

  return (
    <div className="session-authenticated">
      {!import.meta.env.DEV ? (
        <button type="button" className="logout-button" onClick={handleLogout}>
          Sair
        </button>
      ) : null}
      {children}
    </div>
  );
}
