import "./styles.css";

export function App() {
  return (
    <main className="app-shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Fase 0</p>
        <h1 id="page-title">Talent OS</h1>
        <p className="lead">
          Base tecnica local pronta para evoluir com seguranca, tipagem e separacao multiempresa.
        </p>
      </section>

      <section className="status-grid" aria-label="Estado da fundacao">
        <article>
          <span>Web</span>
          <strong>Aplicacao inicial</strong>
        </article>
        <article>
          <span>Dados</span>
          <strong>SQLite de desenvolvimento</strong>
        </article>
        <article>
          <span>Seguranca</span>
          <strong>Tenant obrigatorio na base</strong>
        </article>
      </section>
    </main>
  );
}
