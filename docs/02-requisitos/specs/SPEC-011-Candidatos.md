# SPEC-011 - Candidatos

**Status:** Aprovada  
**Versao:** 1.0  
**Fase:** 8  
**Responsavel de negocio:** Thiago Sousa  
**Dependencias:** SPEC-004 - Roles & Permissions, SPEC-010 - Vagas, ADR-0013 - Candidato global por Organization  
**Ultima atualizacao:** 2026-08-06

## 1. Objetivo

Especificar o cadastro e a gestao basica de candidatos dentro de uma
Organization.

Esta SPEC define criacao, consulta, atualizacao, inativacao, reativacao, dados
pessoais, contatos, localizacao, resumo profissional, experiencias, escolaridade,
certificacoes, idiomas, links profissionais, consentimento, origem, auditoria,
seguranca multiempresa e preparacao para candidatura futura.

## 2. Fora do Escopo

- Implementar codigo, banco, migrations, rotas, testes ou dependencias.
- Implementar candidatura em Vaga.
- Implementar pipeline.
- Implementar entrevistas.
- Implementar respostas de questionarios.
- Implementar avaliacoes.
- Implementar IA.
- Implementar matching.
- Implementar propostas.
- Implementar onboarding.
- Implementar contratacao.
- Implementar upload de curriculo, documentos ou arquivos.
- Excluir fisicamente candidatos.
- Anonimizar dados automaticamente nesta fase.

## 3. Usuarios Envolvidos

- **owner:** cria, consulta, atualiza, inativa, reativa, altera e-mail, consulta
  dados sensiveis, consulta historico e registra observacoes internas.
- **admin:** cria, consulta, atualiza, inativa, reativa, altera e-mail, consulta
  dados sensiveis, consulta historico e registra observacoes internas.
- **member:** visualiza somente a lista positiva permitida de candidatos ativos,
  quando autorizado pelo modulo, sem permissao para alterar, inativar, reativar,
  listar inativos ou acessar historico administrativo.
- **Platform Admin:** consulta administrativamente com motivo e auditoria, sem
  operar funcionalmente candidatos.

`Platform Admin` nao e Role de Membership e nao recebe permissoes funcionais de
`owner`, `admin` ou `member` dentro da Organization.

## 4. Conceitos

### 4.1 Candidate

Entidade principal da pessoa candidata dentro de uma Organization.

Campos conceituais:

- `id`;
- `organization_id`;
- `full_name`;
- `preferred_name`, opcional;
- `email`;
- `normalized_email`;
- `phone`, opcional;
- `secondary_phone`, opcional;
- `status`;
- `source`;
- `source_details`, opcional;
- `professional_summary`, opcional;
- `location`, opcional;
- `work_authorization`, opcional;
- `availability`, opcional;
- `salary_expectation`, opcional;
- autoria;
- timestamps;
- `inactivated_at`, opcional.

O candidato nao representa uma candidatura, etapa de pipeline, avaliacao ou
decisao de contratacao.

### 4.2 Candidate Profile Data

Dados estruturados vinculados ao candidato:

- experiencias profissionais;
- escolaridade;
- certificacoes;
- idiomas;
- competencias declaradas, apenas como texto nesta fase;
- links profissionais;
- observacoes internas.

Esses dados podem ser armazenados em estruturas proprias ou JSONB, desde que
exista validacao forte, formatos documentados e separacao clara entre cadastro,
consentimento e observacoes internas.

### 4.3 Candidate Application

Nao implementar nesta fase.

A candidatura futura sera entidade separada. Um candidato podera ter varias
candidaturas, e cada candidatura apontara para `candidate_id` e
`job_opening_id`.

Status de candidatura, respostas, avaliacoes, evidencias e historico de processo
nao pertencem ao Candidate principal.

## 5. Status Canonicos

- `active`
- `inactive`

Nao existe exclusao fisica.

Candidato inativo:

- permanece no historico;
- nao pode ser usado em novas candidaturas futuras;
- pode continuar associado a historicos existentes;
- pode ser reativado por usuario autorizado;
- nao aparece em selecoes operacionais padrao.

## 6. Fluxos Principais

### 6.1 Criar Candidato

1. Owner ou admin acessa uma Organization ativa.
2. Informa nome, e-mail, origem, consentimento e dados opcionais.
3. Sistema valida User ativo, Membership ativo, Organization ativa e role.
4. Sistema normaliza e valida e-mail.
5. Sistema recusa e-mail duplicado na mesma Organization.
6. Sistema valida dados estruturados e campos sensiveis.
7. Sistema cria candidato ativo.
8. Sistema registra consentimento estruturado.
9. Sistema registra auditoria sem copiar dados pessoais completos.

### 6.2 Consultar e Listar

1. Usuario autorizado solicita candidatos da Organization atual.
2. Sistema valida servidor-side `organizationId`, User, Membership, status da
   Organization, role e escopo.
3. Sistema retorna apenas candidatos da Organization atual.
4. Member recebe visao restrita.
5. Platform Admin usa leitura administrativa auditada com motivo.

### 6.3 Atualizar Dados

1. Owner ou admin seleciona candidato da Organization atual.
2. Sistema valida permissoes e pertencimento.
3. Sistema valida campos enviados e bloqueia mass assignment.
4. Sistema impede mudanca de `organization_id`.
5. Sistema registra auditoria sem conteudo sensivel completo.

### 6.4 Alterar E-mail

1. Owner ou admin solicita alteracao de e-mail.
2. Sistema normaliza o novo e-mail.
3. Sistema valida formato e duplicidade na mesma Organization.
4. Sistema preserva o ID interno do candidato.
5. Sistema registra auditoria especifica de mudanca de e-mail.

### 6.5 Inativar e Reativar

1. Owner ou admin solicita mudanca de status.
2. Sistema valida Organization ativa e role.
3. Sistema altera status para `inactive` ou `active`.
4. Sistema preserva historico e registra auditoria.

### 6.6 Consentimento

1. Owner ou admin atualiza ou revoga consentimento.
2. Sistema valida status canonico, datas, origem, finalidade e versao do termo.
3. Sistema bloqueia novo uso operacional quando consentimento estiver `pending`,
   `revoked` ou `expired`.
4. Sistema preserva historico e registra auditoria.

## 7. Regras de Negocio

- RN-001: Candidate pertence obrigatoriamente a uma Organization.
- RN-002: Candidate nunca pode mudar de Organization.
- RN-003: Candidate representa pessoa candidata no contexto da Organization, nao
  uma candidatura.
- RN-004: Candidatura futura sera entidade separada.
- RN-005: Um Candidate pode ter varias candidaturas futuras na mesma
  Organization.
- RN-006: Status de candidatura nao pertence ao Candidate.
- RN-007: Respostas e avaliacoes nao pertencem ao Candidate principal.
- RN-008: Curriculos, documentos e arquivos nao fazem parte desta fase.
- RN-009: E-mail e obrigatorio, normalizado e unico por Organization.
- RN-010: O mesmo e-mail pode existir em Organizations diferentes.
- RN-011: E-mail nao deve ser usado sozinho como referencia de dominio.
- RN-012: IDs internos permanecem estaveis apos mudanca de e-mail.
- RN-013: Mudanca de e-mail exige validacao de duplicidade e auditoria.
- RN-014: `full_name` e obrigatorio e deve possuir entre 2 e 200 caracteres.
- RN-015: `preferred_name` e opcional e deve possuir ate 100 caracteres.
- RN-016: Telefones sao opcionais, nao sao chave de identidade e nao precisam
  ser unicos.
- RN-017: Origem e obrigatoria e deve usar valor canonico.
- RN-018: Resumo profissional e opcional e deve possuir ate 10.000 caracteres.
- RN-019: Cada candidato pode possuir no maximo 50 experiencias profissionais.
- RN-020: Data final de experiencia nao pode ser anterior a data inicial.
- RN-021: Emprego atual nao deve possuir data final.
- RN-022: Descricao de experiencia deve possuir ate 5.000 caracteres.
- RN-023: Cada candidato pode possuir no maximo 30 registros de escolaridade.
- RN-024: Nivel de escolaridade deve usar valor canonico.
- RN-025: Cada candidato pode possuir no maximo 50 certificacoes.
- RN-026: Idiomas devem usar nivel canonico e nao podem duplicar o mesmo idioma.
- RN-027: Cada candidato pode possuir no maximo 20 links profissionais.
- RN-028: Links profissionais devem possuir URL valida.
- RN-029: Competencias declaradas nao vinculam diretamente ao catalogo de
  competencias nesta fase.
- RN-030: Competencia declarada e texto informado, nao competencia validada.
- RN-031: Cada candidato pode possuir no maximo 100 competencias declaradas, com
  ate 150 caracteres por item e sem duplicidade textual normalizada.
- RN-032: Salario pretendido e opcional, sensivel e nao visivel para member.
- RN-033: Pagina publica nunca recebe salario pretendido.
- RN-034: Auditoria comum nao registra valores completos de salario.
- RN-035: Consentimento estruturado e obrigatorio para cada candidato.
- RN-036: Consentimento `granted` permite uso operacional.
- RN-037: Consentimento `pending`, `revoked` ou `expired` bloqueia novo uso
  operacional e candidatura futura.
- RN-038: Revogacao de consentimento gera auditoria.
- RN-039: Nao apagar dados automaticamente nesta fase.
- RN-040: Anonimizacao fica para fase futura e devera preservar IDs historicos,
  integridade referencial, auditoria e relacionamentos historicos, sem quebrar
  historico nem apagar eventos auditaveis.
- RN-041: Observacoes internas sao visiveis apenas para owner e admin.
- RN-042: Observacoes internas nao devem registrar informacoes discriminatorias
  ou desnecessarias.
- RN-043: Observacoes internas devem possuir ate 10.000 caracteres.
- RN-044: Auditoria nao deve copiar observacoes internas completas.
- RN-045: Candidato inativo nao aparece em selecoes operacionais padrao.
- RN-046: Candidato inativo nao pode ser usado em novas candidaturas futuras.
- RN-047: Candidato pode ser reativado por usuario autorizado.
- RN-048: Nao existe exclusao fisica.
- RN-049: Dados de candidatos nunca atravessam Organizations.
- RN-050: IA nao acessa, analisa, recomenda, aprova ou reprova candidatos nesta
  fase.
- RN-051: Member pode visualizar somente a lista positiva definida nesta SPEC.
- RN-052: Member nao pode visualizar `salary_expectation`, detalhes de
  consentimento, observacoes internas, endereco completo, `secondary_phone`,
  `work_authorization` ou quaisquer outros dados pessoais fora da lista positiva.
- RN-053: Member nao pode alterar candidatos, inativar, reativar, listar
  candidatos inativos ou acessar historico administrativo.

## 8. Dados Necessarios

### 8.1 Candidate

| Campo                  | Obrigatorio | Observacao                                    |
| ---------------------- | ----------: | --------------------------------------------- |
| `id`                   |         Sim | Identificador interno gerado pelo sistema.    |
| `organization_id`      |         Sim | Organization proprietaria do candidato.       |
| `full_name`            |         Sim | Nome completo entre 2 e 200 caracteres.       |
| `preferred_name`       |         Nao | Nome social ou preferido, ate 100 caracteres. |
| `email`                |         Sim | E-mail exibido.                               |
| `normalized_email`     |         Sim | E-mail normalizado para unicidade.            |
| `phone`                |         Nao | Telefone principal.                           |
| `secondary_phone`      |         Nao | Telefone secundario.                          |
| `status`               |         Sim | `active` ou `inactive`.                       |
| `source`               |         Sim | Origem canonica.                              |
| `source_details`       |         Nao | Detalhe adicional da origem.                  |
| `professional_summary` |         Nao | Resumo profissional, ate 10.000 caracteres.   |
| `location`             |         Nao | Estrutura de localizacao.                     |
| `work_authorization`   |         Nao | Estrutura de autorizacao de trabalho.         |
| `availability`         |         Nao | Estrutura de disponibilidade.                 |
| `salary_expectation`   |         Nao | Dado sensivel com acesso restrito.            |
| `created_by_user_id`   |         Sim | Usuario responsavel pela criacao.             |
| `updated_by_user_id`   |         Nao | Usuario responsavel pela ultima alteracao.    |
| `created_at`           |         Sim | Data/hora de criacao.                         |
| `updated_at`           |         Sim | Data/hora da ultima alteracao.                |
| `inactivated_at`       |         Nao | Data/hora de inativacao.                      |

### 8.2 Identidade e E-mail

O e-mail deve:

- ser obrigatorio;
- remover espacos laterais;
- ignorar diferencas entre maiusculas e minusculas;
- ser unico dentro da Organization;
- poder existir em outra Organization;
- nao ser usado sozinho como referencia de dominio.

### 8.3 Origem

Valores canonicos iniciais:

- `career_page`
- `referral`
- `recruiter`
- `agency`
- `linkedin`
- `job_board`
- `event`
- `import`
- `manual`
- `other`

Origem deve ser obrigatoria. Detalhes adicionais da origem podem ser armazenados
em campo opcional.

### 8.4 Localizacao

Estrutura opcional:

- pais;
- estado;
- cidade;
- bairro;
- codigo postal;
- endereco, opcional.

Nao exigir endereco completo.

### 8.5 Experiencia Profissional

Lista opcional com no maximo 50 itens.

Cada item deve possuir:

- empresa;
- cargo;
- data inicial;
- data final, opcional;
- emprego atual;
- descricao, opcional;
- localizacao, opcional.

### 8.6 Escolaridade

Lista opcional com no maximo 30 registros.

Cada item deve possuir instituicao, curso, nivel, datas opcionais, indicador de
andamento e descricao opcional.

Niveis canonicos:

- `elementary`
- `high_school`
- `technical`
- `undergraduate`
- `postgraduate`
- `masters`
- `doctorate`
- `other`

### 8.7 Certificacoes

Lista opcional com no maximo 50 registros.

Cada item deve possuir nome e pode possuir instituicao emissora, data de
emissao, data de validade, codigo da credencial e link de verificacao.

### 8.8 Idiomas

Lista opcional sem duplicidade do mesmo idioma.

Niveis canonicos:

- `basic`
- `intermediate`
- `advanced`
- `fluent`
- `native`

### 8.9 Links Profissionais

Lista opcional com no maximo 20 links.

Tipos canonicos:

- `linkedin`
- `github`
- `portfolio`
- `website`
- `other`

Cada item deve possuir tipo, URL valida e descricao opcional.

### 8.10 Competencias Declaradas

Nesta fase, nao vincular diretamente ao catalogo de competencias.

Armazenar apenas lista textual declarada pelo candidato, porque competencia
declarada nao equivale a competencia validada, matching e avaliacao ficam para
fase futura e nao deve existir falsa equivalencia com
`competency_catalog_items.id`.

Limites:

- ate 100 itens;
- ate 150 caracteres por item;
- sem duplicidade textual normalizada.

### 8.11 Salario Pretendido

Estrutura opcional:

- valor minimo, opcional;
- valor maximo, opcional;
- moeda;
- periodicidade.

Periodicidades canonicas:

- `monthly`
- `hourly`
- `annual`

Regras:

- valores nao negativos;
- minimo nao pode ser maior que maximo;
- moeda deve usar codigo ISO;
- member nao visualiza;
- pagina publica nunca recebe;
- auditoria comum nao registra valores completos.

### 8.12 Disponibilidade

Estrutura opcional:

- imediata;
- data disponivel;
- aviso previo em dias;
- disponibilidade para mudanca;
- disponibilidade para viagens;
- modelo de trabalho preferido.

Modelos canonicos:

- `onsite`
- `hybrid`
- `remote`
- `flexible`

### 8.13 Autorizacao de Trabalho

Estrutura opcional:

- pais;
- autorizado;
- necessita patrocinio;
- observacao opcional.

### 8.14 Consentimento e Privacidade

Cada candidato deve possuir registro de consentimento.

Campos conceituais:

- status do consentimento;
- data;
- origem;
- versao do termo;
- finalidade;
- data de expiracao, opcional;
- data de revogacao, opcional.

Status canonicos:

- `granted`
- `revoked`
- `expired`
- `pending`

A implementacao podera manter historico completo em `candidate_consents` e um
consentimento operacional atual derivado do registro valido mais recente. Esta
SPEC nao define a modelagem fisica desse derivado, apenas o comportamento
esperado para evitar ambiguidades futuras.

### 8.15 Observacoes Internas

Observacoes internas devem ser armazenadas em tabela propria,
`candidate_internal_notes`, em vez de campo direto em `candidates`.

Cada registro deve possuir, no minimo:

- `id`;
- `organization_id`;
- `candidate_id`;
- conteudo;
- `created_by_user_id`;
- `updated_by_user_id`;
- timestamps.

A separacao melhora auditoria, rastreabilidade, minimizacao de exposicao de
dados e evolucao futura.

## 9. Permissoes

Todas as acoes funcionais exigem User ativo, Membership ativo, Organization ativa
e role autorizada.

| Acao                                       | Platform Admin | owner | admin | member |
| ------------------------------------------ | :------------: | :---: | :---: | :----: |
| Criar candidato                            |      Nao       |  Sim  |  Sim  |  Nao   |
| Listar candidatos ativos                   |      Nao       |  Sim  |  Sim  | Restr. |
| Listar candidatos inativos                 |      Nao       |  Sim  |  Sim  |  Nao   |
| Consultar candidato                        |      Nao       |  Sim  |  Sim  | Restr. |
| Atualizar dados                            |      Nao       |  Sim  |  Sim  |  Nao   |
| Alterar e-mail                             |      Nao       |  Sim  |  Sim  |  Nao   |
| Inativar                                   |      Nao       |  Sim  |  Sim  |  Nao   |
| Reativar                                   |      Nao       |  Sim  |  Sim  |  Nao   |
| Consultar salario pretendido               |      Nao       |  Sim  |  Sim  |  Nao   |
| Consultar consentimento detalhado          |      Nao       |  Sim  |  Sim  |  Nao   |
| Consultar observacoes internas             |      Nao       |  Sim  |  Sim  |  Nao   |
| Registrar observacoes internas             |      Nao       |  Sim  |  Sim  |  Nao   |
| Consultar historico                        |      Nao       |  Sim  |  Sim  |  Nao   |
| Atualizar consentimento                    |      Nao       |  Sim  |  Sim  |  Nao   |
| Revogar consentimento                      |      Nao       |  Sim  |  Sim  |  Nao   |
| Leitura administrativa auditada com motivo |      Sim       |  Nao  |  Nao  |  Nao   |
| Operar funcionalmente candidatos           |      Nao       |  Sim  |  Sim  |  Nao   |

Nesta fase, `member` pode visualizar somente:

- `id`;
- `full_name`;
- `preferred_name`;
- cidade;
- estado;
- resumo profissional;
- experiencias;
- escolaridade;
- certificacoes;
- idiomas;
- competencias declaradas;
- links profissionais;
- `status`;
- `source`.

Member nao pode visualizar:

- `salary_expectation`;
- detalhes de consentimento;
- observacoes internas;
- endereco completo;
- `secondary_phone`;
- `work_authorization`;
- quaisquer outros dados pessoais nao incluidos na lista positiva.

Member tambem nao pode alterar candidatos, inativar, reativar, listar candidatos
inativos ou acessar historico administrativo.

## 10. Organization Arquivada

Quando a Organization estiver `archived`:

- owner, admin e member nao operam candidatos;
- member nao possui consulta operacional normal;
- dados permanecem preservados;
- Platform Admin consulta somente administrativamente, com motivo e auditoria;
- nenhuma reativacao de candidato e permitida.

## 11. API Conceitual

| Operacao                        | Finalidade                                                |
| ------------------------------- | --------------------------------------------------------- |
| Criar candidato                 | Criar Candidate e consentimento inicial.                  |
| Listar candidatos ativos        | Listar candidatos ativos permitidos.                      |
| Listar inativos                 | Listar candidatos inativos para owner/admin.              |
| Consultar candidato             | Obter candidato permitido.                                |
| Atualizar dados                 | Alterar dados pessoais e perfil estruturado permitido.    |
| Alterar e-mail                  | Alterar e-mail com normalizacao, duplicidade e auditoria. |
| Inativar                        | Marcar candidato como `inactive`.                         |
| Reativar                        | Marcar candidato como `active`.                           |
| Consultar historico             | Consultar eventos permitidos.                             |
| Atualizar consentimento         | Registrar mudanca de consentimento.                       |
| Revogar consentimento           | Registrar revogacao e bloquear novo uso operacional.      |
| Leitura administrativa auditada | Consulta excepcional por Platform Admin com motivo.       |

Nao criar candidatura nesta fase.

Todas as operacoes devem validar no servidor:

- `organizationId`;
- `candidateId`;
- User ativo;
- Membership ativo;
- Organization ativa;
- role autorizada;
- pertencimento do Candidate a Organization atual.

## 12. Interface

Interface minima prevista:

- listagem de candidatos;
- busca e filtros;
- criacao;
- edicao;
- dados pessoais;
- contatos;
- localizacao;
- resumo profissional;
- experiencias;
- escolaridade;
- certificacoes;
- idiomas;
- links;
- competencias declaradas;
- disponibilidade;
- autorizacao de trabalho;
- consentimento;
- inativacao e reativacao;
- historico;
- mensagens de permissao.

Nao implementar upload de curriculo.

A interface pode ocultar ou desabilitar acoes nao permitidas, mas o servidor
continua sendo a autoridade final.

## 13. Banco de Dados Conceitual

Quando implementada, a funcionalidade deve prever minimamente:

- `candidates`;
- `candidate_consents`;
- `candidate_internal_notes`.

A SPEC permite JSONB para:

- localizacao;
- experiencias;
- escolaridade;
- certificacoes;
- idiomas;
- links;
- competencias declaradas;
- disponibilidade;
- autorizacao de trabalho;
- salario pretendido.

Desde que exista validacao forte, formatos documentados, `organization_id`
obrigatorio, e-mail normalizado unico por Organization, status e origem
canonicos, consentimento estruturado, ausencia de cascade destrutivo, bloqueio de
mudanca de `organization_id` e migrations reproduziveis.

### 13.1 `candidates`

Campos minimos:

- `id`;
- `organization_id`;
- `full_name`;
- `preferred_name`;
- `email`;
- `normalized_email`;
- `phone`;
- `secondary_phone`;
- `status`;
- `source`;
- `source_details`;
- `professional_summary`;
- dados estruturados;
- `created_by_user_id`;
- `updated_by_user_id`;
- `created_at`;
- `updated_at`;
- `inactivated_at`.

Restricoes esperadas:

- `organization_id` obrigatorio;
- `normalized_email` unico por Organization;
- status limitado a `active` e `inactive`;
- origem limitada aos valores canonicos;
- bloqueio de mudanca de `organization_id`;
- ausencia de cascade destrutivo;
- indices para Organization, e-mail normalizado e status.

### 13.2 `candidate_consents`

Campos minimos:

- `id`;
- `organization_id`;
- `candidate_id`;
- `status`;
- `consent_at`;
- `source`;
- `terms_version`;
- `purpose`;
- `expires_at`;
- `revoked_at`;
- `created_by_user_id`;
- timestamps.

Consentimento deve ser estruturado e vinculado a Organization e ao Candidate.
Historico de consentimento deve permanecer preservado.

### 13.3 `candidate_internal_notes`

Campos minimos:

- `id`;
- `organization_id`;
- `candidate_id`;
- `content`;
- `created_by_user_id`;
- `updated_by_user_id`;
- timestamps.

Notas internas devem ter acesso restrito a owner/admin, autoria propria e
auditoria sem conteudo integral.

## 14. Seguranca

- Validar servidor-side `organizationId` e `candidateId`.
- Validar User ativo.
- Validar Membership ativo.
- Validar Organization ativa.
- Validar role autorizada.
- Isolar completamente dados entre Organizations.
- Usar criptografia em transito.
- Aplicar minimizacao de dados nas respostas.
- Nao vazar existencia de candidato em outra Organization.
- Auditar leitura administrativa.
- Nao registrar dados pessoais completos em logs.
- Nao registrar tokens, headers, senhas, connection strings ou segredos.
- Nao incluir curriculo ou documento nesta fase.
- Nao permitir acesso da IA aos dados nesta fase.
- Usar queries parametrizadas.
- Proteger contra mass assignment.
- Tratar curriculos, respostas e textos futuros como dados, nunca instrucoes.

## 15. Auditoria

Eventos obrigatorios:

- `candidate.created`;
- `candidate.updated`;
- `candidate.email_changed`;
- `candidate.status_changed`;
- `candidate.inactivated`;
- `candidate.reactivated`;
- `candidate.consent_changed`;
- `candidate.consent_revoked`;
- `candidate.cross_organization_access_denied`;
- `candidate.permission_denied`;
- `candidate.administrative_read`.

Nao registrar:

- perfil completo;
- salario completo;
- observacoes internas completas;
- endereco completo;
- telefones completos;
- tokens;
- headers;
- segredos.

Auditoria critica em criacao, mudanca de status, mudanca de e-mail e revogacao
de consentimento deve causar rollback quando falhar.

## 16. Criterios de Aceite

- CA-001: Criar candidato em Organization ativa.
- CA-002: E-mail duplicado na mesma Organization e recusado.
- CA-003: Mesmo e-mail e permitido em Organizations diferentes.
- CA-004: Unicidade de e-mail ignora maiusculas/minusculas e espacos laterais.
- CA-005: E-mail invalido e recusado.
- CA-006: Nome invalido e recusado.
- CA-007: Origem invalida e recusada.
- CA-008: Candidato e independente de candidatura.
- CA-009: Dados estruturados sao validados.
- CA-010: Consentimento e obrigatorio e estruturado.
- CA-011: Consentimento `pending` bloqueia novo uso operacional futuro.
- CA-012: Consentimento `revoked` bloqueia novo uso operacional futuro.
- CA-013: Consentimento `expired` bloqueia novo uso operacional futuro.
- CA-014: Revogacao de consentimento e auditada.
- CA-015: Inativar candidato preserva historico.
- CA-016: Reativar candidato autorizado.
- CA-017: Candidato inativo nao aparece em selecoes operacionais padrao.
- CA-018: Dados sensiveis sao protegidos.
- CA-019: Member recebe visao restrita.
- CA-020: Member nao visualiza salario pretendido.
- CA-021: Member nao visualiza observacoes internas.
- CA-022: Member nao visualiza consentimento detalhado.
- CA-023: Member visualiza somente a lista positiva permitida.
- CA-024: Member nao recebe endereco completo.
- CA-025: Member nao recebe `secondary_phone`.
- CA-026: Member nao recebe `work_authorization`.
- CA-027: Member nao recebe salario pretendido.
- CA-028: Member nao recebe observacoes internas.
- CA-029: Member nao recebe consentimento detalhado.
- CA-030: Platform Admin nao opera funcionalmente candidatos.
- CA-031: Platform Admin consulta administrativamente com motivo.
- CA-032: Organization arquivada bloqueia operacoes normais.
- CA-033: Candidate de outra Organization e recusado sem vazar existencia.
- CA-034: Tentativa de mudar `organization_id` e recusada.
- CA-035: Nao existe exclusao fisica.
- CA-036: Auditoria nao registra dados pessoais completos.
- CA-037: Falha de auditoria critica causa rollback.
- CA-038: Dados persistem apos recriar aplicacao.
- CA-039: Nenhum dado de candidato atravessa Organizations.
- CA-040: Anonimizacao futura preserva IDs historicos, integridade referencial,
  auditoria e relacionamentos historicos.

## 17. Testes Obrigatorios

Quando implementada, a funcionalidade deve possuir testes para:

1. criar candidato;
2. e-mail duplicado na mesma Organization;
3. mesmo e-mail em Organizations diferentes;
4. normalizacao case-insensitive;
5. e-mail invalido;
6. nome invalido;
7. origem invalida;
8. telefone invalido;
9. experiencia com datas invalidas;
10. emprego atual com data final;
11. escolaridade invalida;
12. idioma duplicado;
13. nivel de idioma invalido;
14. link invalido;
15. competencia declarada duplicada;
16. salario invalido;
17. disponibilidade invalida;
18. consentimento granted;
19. consentimento pending bloquear uso futuro;
20. consentimento revoked bloquear uso futuro;
21. consentimento expired bloquear uso futuro;
22. revogacao auditada;
23. owner atualizar;
24. admin atualizar;
25. member nao atualizar;
26. lista positiva completa do member;
27. bloqueio de endereco completo para member;
28. bloqueio de telefone secundario para member;
29. bloqueio de autorizacao de trabalho para member;
30. member sem salario;
31. member sem observacoes internas;
32. member sem consentimento detalhado;
33. member nao listar candidatos inativos;
34. member nao consultar historico administrativo;
35. Platform Admin nao operar;
36. Platform Admin consultar administrativamente com motivo;
37. User sem Membership;
38. Membership inativo;
39. User inativo;
40. Organization arquivada;
41. candidateId de outra Organization;
42. tentativa de mudar organization_id;
43. inativar;
44. reativar;
45. ausencia de exclusao fisica;
46. auditoria sem dados pessoais completos;
47. rollback quando auditoria critica falha;
48. persistencia apos recriar aplicacao.

## 18. Limitacoes Conhecidas

- Esta SPEC nao implementa codigo.
- Esta SPEC nao cria banco, migrations, rotas, testes ou dependencias.
- Nao ha candidatura em Vaga.
- Nao ha pipeline.
- Nao ha entrevistas.
- Nao ha respostas de questionarios.
- Nao ha avaliacoes.
- Nao ha IA.
- Nao ha matching.
- Nao ha propostas.
- Nao ha onboarding.
- Nao ha contratacao.
- Nao ha upload de curriculo.
- Nao ha documentos.
- Nao ha anonimizacao automatica.
- Nao ha role especifica de recrutador.
- Nao ha exclusao fisica.

## 19. Definicao de Concluido

Para a implementacao futura desta SPEC:

- SPEC aprovada antes do desenvolvimento;
- ADR-0013 aceita ou ajustada;
- criterios de aceite atendidos;
- testes obrigatorios implementados e passando;
- testes de seguranca passando;
- testes de acesso cruzado passando;
- rollback de auditoria critica verificado;
- regras de seguranca verificadas;
- migrations reproduziveis quando houver banco;
- lint passando;
- formatacao passando;
- build passando;
- documentacao atualizada;
- auditoria revisada;
- nenhuma funcionalidade futura implementada antecipadamente;
- commit realizado.
