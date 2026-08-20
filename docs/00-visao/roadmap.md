# Roadmap inicial

## Fase 0 — Preparação

Objetivo: criar a base do projeto sem funcionalidades de negócio.

Entregas:

- estrutura inicial;
- ambiente local;
- banco de desenvolvimento;
- padrão de código;
- testes;
- verificação automática;
- documentação de execução;
- primeira decisão de arquitetura.

Critério de conclusão:

- o projeto abre;
- o projeto executa;
- existe uma tela inicial;
- existe um teste funcionando;
- existe instrução simples de instalação;
- nenhum segredo está no código.

## Fase 1 — Empresas e usuários

- cadastro de empresa;
- convite de usuário;
- papéis;
- troca de empresa;
- testes de acesso.

## Fase 2 — DNA Organizacional ✅

- missão;
- visão;
- valores;
- cultura;
- competências;
- versão do DNA.

## Fase 3 — Cargos

- biblioteca de cargos;
- responsabilidades;
- competências;
- perfil de referência.

## Fase 4 — Vagas e candidatos

- vaga;
- página pública;
- candidatura;
- currículo;
- questionário.

## Fase 5 — Processo seletivo

- etapas;
- movimentações;
- entrevistas;
- pareceres.

## Fase 6 — IA

- análise estruturada;
- evidências;
- pontos fortes;
- riscos;
- perguntas sugeridas;
- registro do modelo.

## Fase 7 — Relatórios e indicadores

- funil;
- tempo por etapa;
- relatório do candidato;
- auditoria.

## Planejamento detalhado pós-Fase 21

A sequência detalhada oficial é controlada pelo `docs/01-produto/BACKLOG.md`.
Depois da Fase 21 — Dossiê Inteligente do Candidato —, as próximas
capacidades planejadas são:

- Fase 22 — Propostas;
- Fase 23 — Onboarding;
- Fase 24 — OrganizationPerson e Employment;
- Fase 25 — Desenvolvimento e Retenção.

A fundação de OrganizationPerson e Employment foi inserida para resolver a
lacuna pós-contratação identificada durante a especificação de Desenvolvimento
e Retenção, preservando Employment como aggregate root antes da evolução desse
domínio.

As antigas posições de planejamento Fase 12, Fase 13 e Fase 14 não foram
executadas nessa ordem e não devem ser preenchidas retroativamente.

## Planejamento pós-Fase 25 (saneamento em 2026-08-18)

Após a conclusão da Fase 24 (SPEC-025 — OrganizationPerson e Employment) e da
Fase 25 (SPEC-017 — Desenvolvimento e Retenção), o planejamento foi
reconciliado contra `CONSTITUICAO_DO_PROJETO.md`, `AGENTS.md`, todas as SPECs
e ADRs existentes, o `git log` e o estado físico das migrations.

- **Fase 26 — Integração Onboarding → Employment.** Único candidato com
  suporte documental suficiente para ser definido sem inventar decisão de
  produto nova: o caminho já está determinado por ADR-0024 (seção
  "Onboarding") e por SPEC-025 v1.0, seção 33 ("Impacto Futuro na SPEC-016"),
  que descrevem explicitamente uma revisão aditiva de SPEC-016 adicionando
  `employment_id` nullable a Onboarding, preservando onboardings existentes e
  sem criar ou ativar `Employment` automaticamente. Confirmado por inspeção
  física: as migrations 0025/0026 (Fase 23 — Onboarding) não possuem
  `employment_id`; a lacuna é real, não apenas documental.
  Pré-requisito antes de qualquer código: revisão aditiva formal de
  `docs/02-requisitos/specs/SPEC-016-Onboarding.md` (v1.1), seguida do
  processo obrigatório da Constituição (especificação → revisão → plano →
  desenvolvimento → testes → revisão de segurança → documentação → aprovação
  → commit). Este documento não cria essa revisão; apenas reconhece o alvo.

- **Demais capacidades pós-contratação levantadas na reconciliação**
  (Performance, cargo/função pós-contratação, múltiplos vínculos ativos
  simultâneos, contractor/freelancer, autosserviço do colaborador,
  LMS/desenvolvimento ampliado, remuneração, sucessão, analytics/indicadores)
  permanecem sem SPEC ou ADR aprovada. SPEC-017 v1.0 (seção 2) e SPEC-025 v1.0
  (seção 37) as listam explicitamente como fora do escopo atual ou como
  ambiguidade não resolvida, e determinam que nenhuma delas seja resolvida
  por analogia durante implementação. Qualquer uma delas exige etapa própria
  de definição de produto (ADR e/ou SPEC dedicada) antes de virar Fase
  numerada. Offboarding, que também estava nesta lista, foi removido dela
  pelo saneamento abaixo.

## Planejamento pós-Fase 26 (saneamento em 2026-08-19) — Fase 27, Offboarding

A etapa própria de definição de produto exigida pela nota acima foi cumprida
para Offboarding: `docs/02-requisitos/specs/SPEC-026-Offboarding.md` (v1.0,
Status: Aprovada) foi redigida e passou por revisão destrutiva na mesma
tarefa que a criou, fechando aggregate root, momento de criação, lifecycle,
cardinalidade com `Employment`, fronteira de acesso a `User`/`Membership`,
RBAC, privacidade, idempotência, concorrência, atomicidade, auditoria,
multiempresa e histórico, sem alterar ADR-0024, SPEC-025, SPEC-016, SPEC-003
ou SPEC-004.

- **Fase 27 — Offboarding.** Apoiada em `Employment` como aggregate root
  operacional externo (SPEC-025 permanece autoridade exclusiva do seu
  lifecycle); `Offboarding` é aggregate próprio, seguindo o padrão já
  aprovado para `DevelopmentPlan` (SPEC-017). Não gerencia revogação
  automática de acesso: `Employment.end()` continua sem desativar `User` ou
  `Membership` (SPEC-025 seção 14), e a SPEC-026 apenas registra tarefas
  humanas de revogação, nunca as executa. Automação real de acesso fica
  explicitamente fora da v1 e exigirá SPEC/ADR própria futura (SPEC-026
  seção 15).
  Pré-requisito antes de qualquer código: nenhum adicional — a SPEC-026 já
  está aprovada. O processo obrigatório da Constituição (especificação →
  revisão → plano → desenvolvimento → testes → revisão de segurança →
  documentação → aprovação → commit) segue valendo a partir do plano
  técnico, que ainda não foi elaborado por este saneamento.
  Este saneamento formaliza apenas o registro em planejamento (este arquivo
  e `docs/01-produto/BACKLOG.md`); não implementa código, migration, banco
  ou testes executáveis, e não realiza commit.

## Planejamento pós-Fase 27 (saneamento em 2026-08-20) — Fase 28, AccessGrant

A etapa própria de definição de produto, exigida desde o saneamento pós-Fase
25 para qualquer capacidade pós-contratação sem SPEC ou ADR aprovada, foi
cumprida para o Ciclo de Vida de Acesso: `docs/03-arquitetura/decisoes/
0025-ciclo-de-vida-de-acesso-pos-contratacao.md` (Status: Aceita) e
`docs/02-requisitos/specs/SPEC-027-Ciclo-de-Vida-de-Acesso.md` (v1.0,
Status: Aprovada) foram redigidas e passaram por revisão destrutiva nas
próprias tarefas que as criaram, sem alterar ADR-0024, SPEC-003, SPEC-004,
SPEC-025 ou SPEC-026.

- **Fase 28 — Ciclo de Vida de Acesso Pós-Contratação (`AccessGrant`).**
  `AccessGrant` é uma camada de proveniência e governança sobre um
  `Membership` já existente — nunca uma segunda fonte de verdade de
  autorização. Pontos fechados por ADR-0025/SPEC-027 e registrados aqui
  sucintamente:
  - `Membership` continua sendo, sozinho, a fonte de verdade de autorização
    técnica; `authorize()` nunca consulta `AccessGrant`;
  - `AccessGrant` é proveniência/governança — responde "por que este acesso
    existe e sob qual vínculo", nunca "este acesso é válido agora";
  - `OrganizationPerson` + `Membership` são as relações centrais de
    `AccessGrant` (1:N históricos cada); `Membership` puramente
    administrativo (owner/admin/recruiter sem vínculo laboral) nunca precisa
    de `AccessGrant`;
  - `Employment` é proveniência opcional (`0:N AccessGrant`), imutável após
    a criação do `AccessGrant`, elegível em qualquer estado (`active` ou
    `ended`);
  - revogação funcional de acesso é a única operação deste domínio
    autorizada a mutar `Membership`, e delega integralmente a
    `CoreService.updateMembership` (SPEC-003) — herda RN-006 (proteção do
    último owner), auditoria e RBAC já existentes, nunca reimplementados;
  - zero automação por `Employment.end()` — preserva SPEC-025 §14/§16
    integralmente, sem revogar nada automaticamente;
  - zero automação por `Offboarding` — preserva SPEC-026 integralmente:
    nunca cria, revoga ou altera `AccessGrant`/`Membership`; uma integração
    aditiva opcional de contexto (`OffboardingTask` → `access_grant_id`)
    permanece registrada como possibilidade futura, não decidida aqui;
  - zero Inteligência Artificial: concessão e revogação são sempre atos
    humanos explícitos, sem score, ranking ou sugestão automatizada.
  Pré-requisito antes de qualquer código: nenhum adicional — ADR-0025 e
  SPEC-027 já estão, respectivamente, Aceita e Aprovada. O processo
  obrigatório da Constituição (especificação → revisão → plano →
  desenvolvimento → testes → revisão de segurança → documentação → aprovação
  → commit) segue valendo a partir do plano técnico, que ainda não foi
  elaborado por este saneamento.
  Este saneamento formaliza apenas o registro em planejamento (este arquivo
  e `docs/01-produto/BACKLOG.md`) e o metadado `Fase` do cabeçalho de
  SPEC-027; não implementa código, migration, banco ou testes executáveis, e
  não realiza commit.
