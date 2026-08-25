import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Fase 29 (SPEC-028 s15/s23). Rota publica por definicao (a pessoa ainda nao tem sessao local
// no momento em que a acessa) -- callback/redirecionamento do fluxo do provider apos o convite
// ser confirmado. `?invitation=<id>` identifica QUAL convite aceitar (o `id` em si e opaco, nao
// concede nada sozinho -- SPEC-028 s15). `detectSessionInUrl` (supabaseClient.ts) ja populou a
// sessao do SDK a partir do fragmento/parametros que o provider anexou ao redirecionar para cá.
export function AcceptInvitePage() {
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      const invitationId = new URLSearchParams(window.location.search).get("invitation");
      if (!invitationId) {
        setStatus("error");
        setMessage("Link de convite invalido.");
        return;
      }
      if (!supabase) {
        setStatus("error");
        setMessage("A autenticacao nao esta configurada neste ambiente.");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setStatus("error");
        setMessage("Nao foi possivel confirmar o convite. Solicite um novo link.");
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
        setStatus("error");
        setMessage("Nao foi possivel iniciar a sessao.");
        return;
      }
      const acceptResponse = await fetch(`/api/auth/invitations/${invitationId}/accept`, {
        method: "POST",
        credentials: "include"
      });
      if (!acceptResponse.ok) {
        setStatus("error");
        setMessage(
          "Nao foi possivel aceitar o convite. Ele pode ter expirado ou ja ter sido usado."
        );
        return;
      }
      setStatus("done");
    })();
  }, []);

  if (status === "working") {
    return <p>Confirmando convite...</p>;
  }
  if (status === "error") {
    return <p role="alert">{message}</p>;
  }
  return (
    <div>
      <p>Convite aceito. Voce ja pode acessar a plataforma.</p>
      <a href="/">Ir para a plataforma</a>
    </div>
  );
}
