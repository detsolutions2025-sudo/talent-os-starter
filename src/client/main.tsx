import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { PublicApplicationForm } from "./PublicApplicationForm";
import { PublicPreInterviewForm } from "./PublicPreInterviewForm";
import { PublicBehavioralAssessmentForm } from "./PublicBehavioralAssessmentForm";
import { PublicProposalForm } from "./PublicProposalForm";

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

const root = (
  <React.StrictMode>
    {publicApplicationMatch ? (
      <PublicApplicationForm slug={decodeURIComponent(publicApplicationMatch[1])} />
    ) : publicPreInterviewMatch ? (
      <PublicPreInterviewForm />
    ) : publicBehavioralAssessmentMatch ? (
      <PublicBehavioralAssessmentForm />
    ) : publicProposalMatch ? (
      <PublicProposalForm />
    ) : (
      <App />
    )}
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(root);
