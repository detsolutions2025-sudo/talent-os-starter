import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { PublicShell } from "./PublicShell";
import { Card } from "../../components/ui/Card";
import { ErrorState } from "../../components/ui/ErrorState";
import { Spinner } from "../../components/ui/Spinner";
import "./public.css";

// Fase 29 (SPEC-028 s15/s23). Rota publica por definicao (a pessoa ainda nao tem sessao local
// no momento em que a acessa) -- callback/redirecionamento do fluxo do provider apos o convite
// ser confirmado. `?invitation=<id>` identifica QUAL convite aceitar (o `id` em si e opaco, nao
// concede nada sozinho -- SPEC-028 s15). `detectSessionInUrl` (supabaseClient.ts) ja populou a
// sessao do SDK a partir do fragmento/parametros que o provider anexou ao redirecionar para cá.
//
// Migrado para o Design System v1 na Wave 4 (frontend puro) -- nenhuma mudanca de Auth,
// bootstrap, Membership ou tratamento de erro.
export function AcceptInvitePage() {
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      const invitationId = new URLSearchParams(window.location.search).get("invitation");
      if (!invitationId) {
        setStatus("error");
        setMessage("Link de convite inválido.");
        return;
      }
      if (!supabase) {
        setStatus("error");
        setMessage("A autenticação não está configurada neste ambiente.");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setStatus("error");
        setMessage("Não foi possível confirmar o convite. Solicite um novo link.");
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
        setMessage("Não foi possível iniciar a sessão.");
        return;
      }
      const acceptResponse = await fetch(`/api/auth/invitations/${invitationId}/accept`, {
        method: "POST",
        credentials: "include"
      });
      if (!acceptResponse.ok) {
        setStatus("error");
        setMessage(
          "Não foi possível aceitar o convite. Ele pode ter expirado ou já ter sido usado."
        );
        return;
      }
      setStatus("done");
    })();
  }, []);

  if (status === "working") {
    return (
      <PublicShell>
        <Card>
          <Spinner label="Confirmando convite" />
        </Card>
      </PublicShell>
    );
  }

  if (status === "error") {
    return (
      <PublicShell>
        <ErrorState title={message} />
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <Card>
        <h1 tabIndex={-1} className="ds-public-page-header__title">
          Convite aceito
        </h1>
        <p>Você já pode acessar a plataforma.</p>
        <a href="/" className="ds-btn ds-btn--primary ds-btn--md">
          <span className="ds-btn__label">Ir para a plataforma</span>
        </a>
      </Card>
    </PublicShell>
  );
}
