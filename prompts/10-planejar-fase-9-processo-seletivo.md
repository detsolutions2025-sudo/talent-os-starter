# Planejamento Técnico — Fase 9 — Processo Seletivo

Não implemente código.

Leia obrigatoriamente:

- `CONSTITUICAO_DO_PROJETO.md`
- `AGENTS.md`
- `SECURITY.md`
- `CHECKLIST-REVISAO.md`
- todas as ADRs em `docs/03-arquitetura/decisoes/`
- `docs/02-requisitos/specs/SPEC-004-Roles-Permissions.md`
- `docs/02-requisitos/specs/SPEC-010-Vagas.md`
- `docs/02-requisitos/specs/SPEC-011-Candidatos.md`
- `docs/02-requisitos/specs/SPEC-012-Processo-Seletivo.md`
- `docs/03-arquitetura/decisoes/0014-processo-seletivo-versionado.md`

## Objetivo

Produzir o plano técnico completo para implementar somente a Fase 9 — Processo Seletivo.

Não alterar nenhum arquivo do projeto.

## 1. Arquitetura do módulo

Explique como será organizado o módulo:

- `CandidateApplicationService`;
- `CandidateApplicationRepository`;
- `PostgresCandidateApplicationRepository`;
- tipos;
- validações;
- autorização;
- auditoria;
- DTOs;
- integração com Candidate, Job Opening e Job Opening Version.

O módulo deve ter domínio próprio e não depender diretamente de detalhes internos de outros módulos além dos contratos necessários.

## 2. Modelo de dados

Descreva detalhadamente as tabelas previstas:

### `candidate_applications`

Campos mínimos:

- `id`;
- `organization_id`;
- `candidate_id`;
- `job_opening_id`;
- `job_opening_version_id`;
- `application_status`;
- `current_stage`;
- `source`;
- `applied_at`;
- `finalized_at`;
- `finalized_by_user_id`;
- `finalization_reason`;
- `created_by_user_id`;
- `updated_by_user_id`;
- `created_at`;
- `updated_at`.

### `candidate_application_events`

Campos mínimos:

- `id`;
- `organization_id`;
- `candidate_application_id`;
- `event_type`;
- `stage_before`;
- `stage_after`;
- `status_before`;
- `status_after`;
- `reason`;
- `created_by_user_id`;
- `created_at`.

### `candidate_application_notes`

Campos mínimos:

- `id`;
- `organization_id`;
- `candidate_application_id`;
- `content`;
- `created_by_user_id`;
- `created_at`.

Explique:

- chaves estrangeiras;
- integridade por Organization;
- índices;
- checks;
- triggers;
- ausência de exclusão física;
- proteção contra mudança dos vínculos imutáveis.

## 3. Estados e etapas

Estados da candidatura:

- `active`;
- `withdrawn`;
- `rejected`;
- `hired`;
- `cancelled`.

Etapas:

- `applied`;
- `screening`;
- `interview`;
- `assessment`;
- `offer`;
- `completed`.

Explique como o código manterá separados:

- `application_status`;
- `current_stage`.

Confirme que:

- `active` é o único estado não final;
- estados finais são irreversíveis;
- `completed` não finaliza automaticamente a candidatura.

## 4. Criação da candidatura

Explique o fluxo transacional completo para criar uma candidatura.

Validar:

- User ativo;
- Membership ativo;
- Organization ativa;
- role autorizada;
- Candidate ativo;
- consentimento operacional atual `granted`;
- Job Opening da mesma Organization;
- Job Opening em estado `open`;
- Job Opening Version `published`;
- versão pertencente à Vaga;
- prazo de candidatura válido, quando houver;
- ausência de candidatura ativa duplicada.

A nova candidatura deve:

- iniciar com `application_status = active`;
- iniciar com `current_stage = applied`;
- gerar evento `application_created`;
- gerar auditoria;
- ser criada em transação.

## 5. Duplicidade e concorrência

Explique a estratégia para garantir:

- apenas uma candidatura `active` por Candidate + Job Opening;
- proteção por índice único parcial;
- tratamento de violação de unicidade como conflito de domínio;
- duas criações simultâneas não gerarem duplicidade;
- concorrência segura em movimentações e finalizações.

## 6. Movimentação de etapas

Explique o fluxo de:

- avanço;
- retorno;
- salto de etapa.

Regras:

- candidatura precisa estar `active`;
- avanço normal somente para etapa seguinte;
- retorno normal somente para etapa anterior;
- salto exige owner/admin;
- salto exige motivo;
- movimentação gera evento imutável;
- movimentação e auditoria devem ocorrer na mesma transação;
- bloquear a candidatura com `SELECT ... FOR UPDATE` ou estratégia equivalente;
- revalidar etapa e estado dentro da transação.

## 7. Finalização

Explique operações separadas para:

- retirar;
- rejeitar;
- contratar;
- cancelar.

Regras:

### `withdrawn`

- owner ou admin;
- motivo obrigatório;
- estado final.

### `rejected`

- owner ou admin;
- motivo obrigatório;
- estado final.

### `hired`

- somente owner;
- motivo ou referência administrativa;
- estado final;
- não cria colaborador, contratação ou onboarding.

### `cancelled`

- owner ou admin;
- motivo obrigatório;
- estado final.

Toda finalização deve preencher:

- `finalized_at`;
- `finalized_by_user_id`;
- `finalization_reason`.

Também deve:

- gerar evento;
- gerar auditoria;
- ocorrer em transação;
- impedir finalização concorrente conflitante.

## 8. Consentimento após criação

Explique como o serviço consultará o consentimento operacional atual do Candidate.

Quando estiver `pending`, `revoked` ou `expired`, bloquear:

- avanço;
- retorno;
- salto;
- contratação;
- nota operacional;
- novo uso operacional dos dados.

Permitir apenas:

- retirada;
- rejeição administrativa com motivo;
- cancelamento;
- consulta mínima por owner/admin;
- leitura administrativa auditada;
- preservação histórica.

Não apagar ou alterar automaticamente candidatura, etapa, eventos ou notas.

## 9. Candidate inativo e estado da Vaga

Explique:

### Candidate inativo após criação

- candidatura permanece preservada;
- não permite novas operações normais;
- permite apenas encerramentos administrativos previstos.

### Vaga pausada, fechada ou cancelada após criação

- não altera automaticamente candidaturas existentes;
- não aceita novas candidaturas;
- candidaturas existentes podem continuar em processamento interno conforme a SPEC;
- cancelamento em massa fica fora desta fase.

## 10. DTOs

Defina DTOs separados:

### Owner/Admin

Pode receber dados operacionais permitidos da candidatura, Candidate e Vaga, respeitando SPEC-010 e SPEC-011.

### Member

Somente candidaturas `active` e apenas:

- `id`;
- `application_status`;
- `current_stage`;
- `applied_at`;
- Candidate:

  - `id`;
  - `full_name`;
  - `preferred_name`;

- Job Opening:

  - `id`;
  - `title`;

- Job Opening Version:

  - `id`;
  - `public_title`;
  - `version_number`.

Nunca receber:

- contatos;
- consentimento;
- salário;
- notas;
- histórico;
- motivos de finalização;
- dados internos;
- faixa salarial da Vaga;
- instruções internas.

### Platform Admin

Somente leitura administrativa minimizada:

- motivo obrigatório;
- auditoria;
- sem operação funcional.

## 11. Notas internas

Explique como serão implementadas em `candidate_application_notes`.

Regras:

- owner/admin podem criar;
- member não visualiza;
- Platform Admin não cria ou altera;
- nota pertence à candidatura e à mesma Organization;
- conteúdo completo não vai para auditoria;
- sem exclusão física;
- consentimento inválido bloqueia nova nota operacional.

## 12. Eventos e histórico

Explique como `candidate_application_events` será a timeline imutável.

Eventos mínimos:

- `application_created`;
- `stage_changed`;
- `withdrawn`;
- `rejected`;
- `hired`;
- `cancelled`;
- `note_added`.

Confirme:

- eventos nunca são editados;
- eventos nunca são excluídos;
- não mudam de Organization;
- registram ator e data;
- histórico permanece após finalização.

## 13. Permissões

Detalhe todas as permissões de:

- owner;
- admin;
- member;
- Platform Admin.

Confirme especialmente:

- admin não pode marcar `hired`;
- member não cria nem altera;
- Platform Admin não opera funcionalmente;
- servidor é a autoridade final.

## 14. Segurança

Explique:

- isolamento multiempresa;
- validação de todos os IDs;
- queries sempre limitadas por Organization;
- mensagens genéricas para acesso cruzado;
- proteção contra mass assignment;
- vínculos imutáveis;
- ausência de dados pessoais completos em logs;
- SQL parametrizado;
- sem exclusão física.

## 15. Auditoria

Liste os eventos auditados:

- criação;
- mudança de etapa;
- salto;
- retirada;
- rejeição;
- contratação;
- cancelamento;
- nota criada;
- operação bloqueada por consentimento;
- tentativa em candidatura finalizada;
- acesso cruzado;
- ação sem permissão;
- leitura administrativa.

Não registrar:

- perfil completo do Candidate;
- notas completas;
- contatos;
- consentimento completo;
- salário;
- tokens;
- headers;
- segredos.

## 16. API prevista

Liste rotas conceituais para:

- criar candidatura;
- listar candidaturas;
- listar por Vaga;
- listar por Candidate;
- consultar candidatura;
- mover etapa;
- retirar;
- rejeitar;
- contratar;
- cancelar;
- adicionar nota;
- listar histórico;
- listar notas para owner/admin;
- leitura administrativa auditada.

Não criar:

- entrevista;
- avaliação;
- proposta;
- onboarding;
- IA;
- ranking;
- score.

## 17. Interface mínima

Explique a UI mínima:

- listagem por Vaga;
- listagem por etapa;
- visualização da candidatura;
- movimentação de etapa sem drag-and-drop obrigatório;
- finalização;
- notas internas;
- timeline;
- filtros;
- mensagens claras de consentimento e permissão;
- DTO restrito para member.

## 18. Migration

Descreva a migration prevista, incluindo:

- nome sugerido;
- tabelas;
- FKs compostas ou mecanismo equivalente;
- índice único parcial para candidatura ativa;
- índices de consulta;
- checks de status e etapas;
- triggers contra alteração de vínculos;
- triggers contra alteração/exclusão de eventos;
- bloqueio de DELETE físico;
- ausência de cascade destrutivo.

## 19. Testes

Liste testes PostgreSQL integrados para todos os critérios da SPEC-012, incluindo:

- criação válida;
- duplicidade;
- concorrência;
- Candidate/Vaga/versão de outra Organization;
- Candidate inativo;
- consentimentos inválidos;
- Vaga inválida;
- pipeline;
- avanço;
- retorno;
- salto;
- finalizações;
- admin impedido de contratar;
- member restrito;
- Platform Admin sem operação;
- eventos imutáveis;
- notas;
- mass assignment;
- rollback;
- ausência de exclusão física;
- persistência após recriar aplicação.

## 20. Arquivos previstos

Liste todos os arquivos que pretende criar e alterar.

## 21. Riscos

Liste riscos técnicos e mitigações, especialmente:

- concorrência;
- duplicidade;
- vazamento de dados pessoais;
- consentimento;
- inconsistência entre estado e etapa;
- acoplamento com módulos futuros;
- crescimento da timeline.

## Restrições

- Não implementar código.
- Não criar migration.
- Não alterar banco.
- Não alterar testes.
- Não alterar documentação.
- Não alterar dependências.

## Entrega

Ao concluir, informe:

1. resumo da arquitetura;
2. modelo de dados;
3. estratégia de criação;
4. estratégia de pipeline;
5. estratégia de concorrência;
6. estratégia de consentimento;
7. DTOs;
8. permissões;
9. auditoria;
10. testes;
11. arquivos previstos;
12. riscos;
13. recomendação para iniciar ou revisar a implementação.
