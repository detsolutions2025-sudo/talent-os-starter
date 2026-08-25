// Fase 29 (ADR-0026; SPEC-028 v1.0). Substitui a necessidade de reescrever cada uma das ~150
// chamadas `fetch()` existentes em `App.tsx`: em vez de tocar cada call-site individualmente,
// este modulo troca `window.fetch` UMA VEZ, no boot (`main.tsx`), garantindo que toda chamada
// para a propria API (mesma origem) sempre carregue o cookie de sessao (`credentials:
// "include"`) quando ainda nao especificado explicitamente. Combinado com `devHeaders`/
// `platformHeaders` (`App.tsx`) se tornando objetos vazios fora de `import.meta.env.DEV`, o
// resultado pratico e identico a reescrever cada chamada, com um raio de mudanca muito menor e
// sem risco de esquecer um call-site (o unico ponto de mudanca e este).
export function installCredentialedFetch() {
  if (typeof window === "undefined") return;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (init.credentials === undefined) {
      init = { ...init, credentials: "include" };
    }
    return original(input, init);
  };
}
