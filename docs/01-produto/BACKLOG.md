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
| SPEC-015 | Propostas                                       |   22 | —       | Rascunho   |
| SPEC-016 | Onboarding                                      |   23 | —       | Rascunho   |
| SPEC-025 | OrganizationPerson e Employment                 |   24 | 0.2     | Em revisão |
| SPEC-017 | Desenvolvimento e Retenção                      |   25 | —       | Rascunho   |
| SPEC-018 | Blueprint Organizacional / Implantação Guiada   |   15 | 1.0     | Aprovada   |
| SPEC-019 | Portal Público de Vagas                         |   16 | 0.1     | Em revisão |
| SPEC-020 | Candidatura Pública                             |   17 | 1.1     | Aprovada   |
| SPEC-021 | Pré-Entrevista Estruturada                      |   18 | 1.0     | Aprovada   |
| SPEC-022 | Perfil Comportamental                           |   19 | 1.0     | Aprovada   |
| SPEC-023 | Pré-Análise Assistida por IA                    |   20 | 1.1     | Aprovada   |
| SPEC-024 | Dossiê Inteligente do Candidato                 |   21 | 1.1     | Aprovada   |

> **Nota sobre SPEC-014:** o item foi corrigido nominalmente para "Infraestrutura de IA" e a Versão para `v1.0`, para corresponder ao documento aprovado (`docs/02-requisitos/specs/SPEC-014-Infraestrutura-de-IA.md`, Status: Aprovada, Versao: 1.0). Status (Concluída) e Fase (11) foram mantidos — não há inconsistência documental nesses dois campos.

> **Nota sobre SPEC ID e Fase:** o número da SPEC identifica o documento/requisito; o número da Fase representa a ordem de implementação e não precisa coincidir com o número da SPEC. As Fases 12 a 14 permaneceram posições de planejamento originalmente reservadas e não executadas nessa cronologia histórica. As capacidades preservadas como SPEC-015, SPEC-016, SPEC-025 e SPEC-017 foram reposicionadas para as Fases 22, 23, 24 e 25. Fases já executadas não devem ser renumeradas retroativamente.

### Dependências conceituais

A tabela acima não possui coluna de dependências (diferente da tabela "Núcleo da plataforma"); para não alterar sua estrutura estabelecida, as dependências conceituais das próximas SPECs são registradas aqui, como referência para o detalhamento futuro de cada documento:

- **SPEC-025 — OrganizationPerson e Employment:** ADR-0024, Organization, Candidate e CandidateApplication como proveniência opcional, Proposal como proveniência opcional, Onboarding apenas como integração futura aditiva.
- **SPEC-017 — Desenvolvimento e Retenção:** SPEC-025, Employment como aggregate root, ADR-0024, SPEC-003, SPEC-011, SPEC-012, SPEC-015, SPEC-016.
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
