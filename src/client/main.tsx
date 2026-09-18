import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { PublicJobApplicationPage } from "./features/public/PublicJobApplicationPage";
import { PublicPreInterviewPage } from "./features/public/PublicPreInterviewPage";
import { PublicBehavioralAssessmentPage } from "./features/public/PublicBehavioralAssessmentPage";
import { PublicProposalPage } from "./features/public/PublicProposalPage";
import { AcceptInvitePage } from "./features/public/AcceptInvitePage";
import { SessionGate } from "./SessionGate";
import { installCredentialedFetch } from "./apiClient";

// Carregado sob demanda: quem acessa uma rota publica (candidato/visitante anonimo) nunca deve
// baixar o bundle e o CSS do painel administrativo (`App.tsx` e tudo que ele importa) -- so o
// caminho autenticado (`else` abaixo) paga esse custo.
const App = lazy(() => import("./App").then((module) => ({ default: module.App })));

// Fase 29 (ADR-0026; SPEC-028 v1.0). Uma unica instalacao, no boot -- ver `apiClient.ts` para a
// justificativa de por que isto substitui a reescrita das ~150 chamadas `fetch()` existentes.
installCredentialedFetch();

// Fase 17 (SPEC-020 v1.1): a candidatura publica precisa ser acessivel por um Visitante nao
// autenticado, sem passar pelo App interno (que sempre exige contexto de dev-auth). Nao ha
// biblioteca de rotas neste projeto (nenhuma dependencia nova foi adicionada) -- este e um
// roteamento minimo, feito a mao, apenas para separar as paginas publicas das demais telas
// autenticadas, sem nenhuma refatoracao do restante do cliente.
const publicApplicationMatch = window.location.pathname.match(/^\/vagas\/([^/]+)\/?$/);
// Fase 18 (SPEC-021, secao 25.1/37): o token de acesso nunca esta no path -- a rota em si e
// fixa e o token chega exclusivamente pelo fragment (`#access=...`), lido dentro do proprio
// componente, nunca pelo roteamento.
const publicPreInterviewMatch = window.location.pathname.match(/^\/pre-interview\/?$/);
// Fase 19 (SPEC-022, secao 25.1): mesmo padrao -- token nunca no path, so no fragment.
const publicBehavioralAssessmentMatch = window.location.pathname.match(
  /^\/behavioral-assessment\/?$/
);
const publicProposalMatch = window.location.pathname.match(/^\/proposal\/?$/);
// Fase 29 (SPEC-028 s15/s23): rota publica por definicao -- callback do provider apos confirmar
// convite, mesma familia das demais rotas publicas acima.
const acceptInviteMatch = window.location.pathname.match(/^\/accept-invite\/?$/);

const root = (
  <React.StrictMode>
    {publicApplicationMatch ? (
      <PublicJobApplicationPage slug={decodeURIComponent(publicApplicationMatch[1])} />
    ) : publicPreInterviewMatch ? (
      <PublicPreInterviewPage />
    ) : publicBehavioralAssessmentMatch ? (
      <PublicBehavioralAssessmentPage />
    ) : publicProposalMatch ? (
      <PublicProposalPage />
    ) : acceptInviteMatch ? (
      <AcceptInvitePage />
    ) : (
      <SessionGate>
        <Suspense fallback={null}>
          <App />
        </Suspense>
      </SessionGate>
    )}
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(root);
