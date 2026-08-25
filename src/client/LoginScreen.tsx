import { useState } from "react";
import { supabase } from "./supabaseClient";

// Fase 29 (SPEC-028 s8/s9/s13/s24). Fluxo: o navegador fala com o Supabase Auth diretamente
// (nunca a API da aplicacao ve a senha); a resposta (access+refresh token) e lida em memoria e
// enviada UMA VEZ para `POST /api/auth/session`, que verifica a assinatura localmente e emite os
// cookies HttpOnly -- a partir dai o token nunca mais existe em JS do navegador.
export function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!supabase) {
        setError("A autenticacao nao esta configurada neste ambiente.");
        return;
      }
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (signInError || !data.session) {
        // Resposta generica -- nunca revela se a causa foi e-mail inexistente, senha errada ou
        // conta nao verificada (RN-009/SPEC-002, reforcada por SPEC-028 s18/s32).
        setError("E-mail ou senha invalidos.");
        return;
      }
      const bridgeResponse = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token
        })
      });
      if (!bridgeResponse.ok) {
        setError("Nao foi possivel iniciar a sessao. Tente novamente.");
        return;
      }
      onAuthenticated();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <form onSubmit={handleSubmit} className="login-form">
        <h1>Entrar</h1>
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error ? (
          <p role="alert" className="login-error">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
