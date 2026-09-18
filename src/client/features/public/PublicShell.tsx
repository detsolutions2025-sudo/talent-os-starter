import type { ReactNode } from "react";
// Fundacao do Design System v1 e classes de secao/formulario reutilizadas pelos fluxos publicos
// (`ds-form-section__*`) -- carregado aqui porque o bundle publico (`main.tsx`) nao importa mais
// `App.tsx` estaticamente (ver comentario em `main.tsx`), entao ninguem mais traz esse CSS.
import "../../styles/tokens.css";
import "../../styles/primitives.css";
import "../../styles/features.css";
import "./public.css";

export type PublicShellProps = {
  children: ReactNode;
  /** Largura de leitura controlada por padrão; formularios mais ricos (ex.: vaga + candidatura)
   * podem pedir uma coluna um pouco mais larga. */
  wide?: boolean;
};

// Shell minimo para a experiencia publica do DoF (Wave 4): marca + conteudo central + rodape.
// Deliberadamente sem sidebar/topbar administrativa -- quem acessa aqui e um Candidato/visitante
// externo, nunca uma pessoa autenticada navegando o painel interno.
export function PublicShell({ children, wide = false }: PublicShellProps) {
  return (
    <div className="ds-public-shell">
      <header className="ds-public-shell__brand">
        <span className="ds-public-shell__brand-mark">DoF</span>
        <span className="ds-public-shell__brand-sub">Gente &amp; Seleção</span>
      </header>
      <main
        className={`ds-public-shell__content${wide ? " ds-public-shell__content--wide" : ""}`}
        id="main-content"
      >
        {children}
      </main>
      <footer className="ds-public-shell__footer">
        <p>Processo seletivo conduzido através da plataforma DoF.</p>
      </footer>
    </div>
  );
}
