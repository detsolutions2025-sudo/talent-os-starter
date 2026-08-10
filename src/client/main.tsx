import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { PublicApplicationForm } from "./PublicApplicationForm";

// Fase 17 (SPEC-020 v1.1): a candidatura publica precisa ser acessivel por um Visitante nao
// autenticado, sem passar pelo App interno (que sempre exige contexto de dev-auth). Nao ha
// biblioteca de rotas neste projeto (nenhuma dependencia nova foi adicionada) -- este e um
// roteamento minimo, feito a mao, apenas para separar a unica pagina publica das demais telas
// autenticadas, sem nenhuma refatoracao do restante do cliente.
const publicApplicationMatch = window.location.pathname.match(/^\/vagas\/([^/]+)\/?$/);

const root = (
  <React.StrictMode>
    {publicApplicationMatch ? (
      <PublicApplicationForm slug={decodeURIComponent(publicApplicationMatch[1])} />
    ) : (
      <App />
    )}
  </React.StrictMode>
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(root);
