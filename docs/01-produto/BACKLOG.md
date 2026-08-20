# Backlog Oficial — DoF — Gente & Seleção

## Estados

- Rascunho
- Em revisão
- Aprovada
- Em desenvolvimento
- Em testes
- Concluída
- Bloqueada

## Núcleo da plataforma

| ID       | Funcionalidade      | Fase | Versão | Status    | Dependências       |
| -------- | ------------------- | ---: | ------ | --------- | ------------------ |
| SPEC-001 | Organization        |    1 | v0.1.0 | Concluída | Nenhuma            |
| SPEC-002 | User                |    1 | v0.1.0 | Concluída | Organization       |
| SPEC-003 | Membership          |    1 | v0.1.0 | Concluída | Organization, User |
| SPEC-004 | Roles & Permissions |    1 | v0.1.0 | Concluída | Membership         |

## Especificações

| ID       | Funcionalidade                                | Fase | Versão  | Status     |
| -------- | ----------------------------------------------- | ---: | ------- | ---------- |
| SPEC-005 | DNA Organizacional                              |    2 | v0.2.0  | Concluída |
| SPEC-006 | Estrutura Organizacional                        |    3 | v0.3.0  | Concluída |
| SPEC-007 | Catálogo de Competências                        |    4 | v0.4.0  | Concluída |
| SPEC-008 | Cargos                                          |    5 | v0.5.0  | Concluída |
| SPEC-009 | Banco de Perguntas                              |    6 | —       | Concluída |
| SPEC-010 | Vagas                                           |    7 | —       | Concluída |
| SPEC-011 | Candidatos                                      |    8 | —       | Concluída |
| SPEC-012 | Processo Seletivo                               |    9 | —       | Concluída |
| SPEC-013 | Entrevistas                                     |   10 | —       | Concluída |
| SPEC-014 | Infraestrutura de IA                            |   11 | v1.0    | Concluída |
| SPEC-015 | Propostas                                       |   22 | v1.0    | Concluída |
| SPEC-016 | Onboarding                                      |   23 | v1.0    | Concluída |
| SPEC-025 | OrganizationPerson e Employment                 |   24 | 1.0     | Concluída |
| SPEC-017 | Desenvolvimento e Retenção                      |   25 | v1.0    | Concluída |
| SPEC-026 | Offboarding                                     |   27 | 1.0     | Aprovada   |
| SPEC-027 | Ciclo de Vida de Acesso Pós-Contratação (AccessGrant) | 28 | 1.0     | Aprovada   |
| SPEC-018 | Blueprint Organizacional / Implantação Guiada   |   15 | 1.0     | Aprovada   |
| SPEC-019 | Portal Público de Vagas                         |   16 | 0.1     | Em revisão |
| SPEC-020 | Candidatura Pública                             |   17 | 1.1     | Aprovada   |
| SPEC-021 | Pré-Entrevista Estruturada                      |   18 | 1.0     | Aprovada   |
| SPEC-022 | Perfil Comportamental                           |   19 | 1.0     | Aprovada   |
| SPEC-023 | Pré-Análise Assistida por IA                    |   20 | 1.1     | Aprovada   |
| SPEC-024 | Dossiê Inteligente do Candidato                 |   21 | 1.1     | Aprovada   |

> **Nota sobre SPEC-014:** o item foi corrigido nominalmente para "Infraestrutura de IA" e a Versão para `v1.0`, para corresponder ao documento aprovado (`docs/02-requisitos/specs/SPEC-014-Infraestrutura-de-IA.md`, Status: Aprovada, Versao: 1.0). Status (Concluída) e Fase (11) foram mantidos — não há inconsistência documental nesses dois campos.

> **Nota sobre SPEC ID e Fase:** o número da SPEC identifica o documento/requisito; o número da Fase representa a ordem de implementação e não precisa coincidir com o número da SPEC. As Fases 12 a 14 permaneceram posições de planejamento originalmente reservadas e não executadas nessa cronologia histórica. As capacidades preservadas como SPEC-015, SPEC-016, SPEC-025 e SPEC-017 foram reposicionadas para as Fases 22, 23, 24 e 25. Fases já executadas não devem ser renumeradas retroativamente.

> **Nota de reconciliação pós-Fase 25 (2026-08-18):** SPEC-015, SPEC-016, SPEC-025 e SPEC-017 estavam registradas nesta tabela como `Rascunho`/`Em revisão`, divergindo do status `Aprovada` já gravado nos próprios documentos de SPEC e da implementação de código já commitada (Fases 22 a 25, `git log`). Corrigido para `Concluída` nesta tabela, sem alterar conteúdo normativo de nenhuma SPEC — apenas o rastreamento de status estava desatualizado, contrariando a "Regra de atualização" no rodapé deste arquivo.

> **Nota de saneamento — Fase 27 (2026-08-19):** `docs/00-visao/roadmap.md` listava Offboarding apenas como capacidade pós-contratação "sem SPEC ou ADR aprovada", exigindo "SPEC dedicada" antes de virar fase numerada. A SPEC-026 — Offboarding (v1.0, Status: Aprovada, `docs/02-requisitos/specs/SPEC-026-Offboarding.md`) já foi redigida e passou por revisão destrutiva na própria tarefa que a criou, fechando esse pré-requisito. Este saneamento apenas formaliza a Fase 27 nesta tabela e no roadmap; não implementa código, migration, banco, testes executáveis nem faz commit. Status registrado como `Aprovada` (não `Concluída`) porque a implementação (Fase 27 propriamente dita) ainda não começou.

> **Nota de saneamento — Fase 28 (2026-08-20):** concluída a Fase 27 (Offboarding), o gate arquitetural e normativo do domínio de Ciclo de Vida de Acesso Pós-Contratação foi cumprido: ADR-0025 — Ciclo de Vida de Acesso Pós-Contratação (Status: Aceita, `docs/03-arquitetura/decisoes/0025-ciclo-de-vida-de-acesso-pos-contratacao.md`) e SPEC-027 — Ciclo de Vida de Acesso Pós-Contratação / AccessGrant (v1.0, Status: Aprovada, `docs/02-requisitos/specs/SPEC-027-Ciclo-de-Vida-de-Acesso.md`) já foram redigidas e passaram por revisão destrutiva nas próprias tarefas que as criaram. Este saneamento apenas formaliza a Fase 28 nesta tabela e no roadmap, e atualiza o metadado `Fase` do cabeçalho de SPEC-027 (de "a formalizar" para "28"); não altera conteúdo normativo de ADR-0025 ou SPEC-027, não implementa código, migration, banco, testes executáveis nem faz commit. Status registrado como `Aprovada` (não `Concluída`) porque a implementação (Fase 28 propriamente dita) ainda não começou.

### Dependências conceituais

A tabela acima não possui coluna de dependências (diferente da tabela "Núcleo da plataforma"); para não alterar sua estrutura estabelecida, as dependências conceituais das próximas SPECs são registradas aqui, como referência para o detalhamento futuro de cada documento:

- **SPEC-025 — OrganizationPerson e Employment:** ADR-0024, Organization, Candidate e CandidateApplication como proveniência opcional, Proposal como proveniência opcional, Onboarding apenas como integração futura aditiva.
- **SPEC-017 — Desenvolvimento e Retenção:** SPEC-025, Employment como aggregate root, ADR-0024, SPEC-003, SPEC-011, SPEC-012, SPEC-015, SPEC-016.
- **SPEC-026 — Offboarding:** ADR-0024, SPEC-025 (Employment como aggregate root operacional externo; SPEC-025 permanece autoridade exclusiva do lifecycle de Employment), SPEC-016 (padrão operacional de checklist reutilizado para tasks), SPEC-003 e SPEC-004 (fronteira de acesso e RBAC). Não gerencia revogação automática de acesso; automação real de acesso fica fora da v1 e exige SPEC/ADR própria futura.
- **SPEC-027 — Ciclo de Vida de Acesso Pós-Contratação (AccessGrant):** ADR-0025 (decisão arquitetural que cria `AccessGrant`), SPEC-003 — Membership (fonte de verdade de autorização técnica, nunca substituída; revogação delega a `CoreService.updateMembership`), SPEC-004 — Roles & Permissions (RBAC herdado por delegação). Dependências conceituais adicionais citadas pela própria SPEC-027, sem serem operacionalmente obrigatórias: SPEC-025 — OrganizationPerson e Employment (`Employment` como proveniência opcional, nunca dependência para `Membership` administrativo) e SPEC-026 — Offboarding, apenas como fronteira/integrador conceitual futuro (nenhuma automação: Offboarding nunca cria, revoga ou altera `AccessGrant`/`Membership`).
- **SPEC-018 — Blueprint Organizacional / Implantação Guiada:** Organization, DNA Organizacional (SPEC-005), Estrutura Organizacional (SPEC-006), Catálogo de Competências (SPEC-007), Cargos (SPEC-008), Banco de Perguntas (SPEC-009), ADR-0020, ADR-0021, ADR-0022.
- **SPEC-019 — Portal Público de Vagas:** Vagas (SPEC-010), Organization, Blueprint Organizacional (SPEC-018).
- **SPEC-020 — Candidatura Pública:** Portal Público (SPEC-019), Candidatos (SPEC-011), Vagas (SPEC-010), Processo Seletivo (SPEC-012).
- **SPEC-021 — Pré-Entrevista Estruturada:** Candidatura Pública (SPEC-020), Banco de Perguntas (SPEC-009), Blueprint Organizacional (SPEC-018).
- **SPEC-022 — Perfil Comportamental:** Candidato (SPEC-011), Pré-Entrevista (SPEC-021).
- **SPEC-023 — Pré-Análise Assistida por IA:** Infraestrutura de IA (SPEC-014), Blueprint Organizacional (SPEC-018), Pré-Entrevista (SPEC-021), Perfil Comportamental (SPEC-022) quando utilizado.
- **SPEC-024 — Dossiê Inteligente do Candidato:** Candidato (SPEC-011), Candidatura (SPEC-020), Blueprint Organizacional (SPEC-018), Pré-Entrevista (SPEC-021), Perfil Comportamental (SPEC-022) quando utilizado, Pré-Análise Assistida por IA (SPEC-023) quando habilitada.

### Observações — IA opcional (SPEC-018 a SPEC-024)

- A IA é opcional na plataforma (ADR-0016, ADR-0019): nenhuma SPEC futura pode tornar um fluxo humano de recrutamento e seleção obrigatoriamente dependente de IA.
- SPEC-023 (Pré-Análise Assistida por IA) e demais componentes de IA não podem tornar obrigatórios os fluxos humanos existentes (avaliação manual, decisão do RH).
- SPEC-021 (Pré-Entrevista Estruturada) deve funcionar integralmente sem IA habilitada.
- SPEC-024 (Dossiê Inteligente do Candidato) deve possuir uma versão estrutural, utilizável pelo RH, mesmo quando a IA estiver desabilitada na Organization.

## Regra de atualização

Toda mudança de status deve ser registrada neste arquivo no mesmo commit da alteração correspondente.
