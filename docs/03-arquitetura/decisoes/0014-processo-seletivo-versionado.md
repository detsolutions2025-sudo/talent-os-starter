# ADR 0014 - Processo seletivo versionado

## Status

Aceita.

## Contexto

O Talent OS ja possui duas decisoes que delimitam a base do recrutamento:

- Vagas sao versionadas e preservam snapshots publicados imutaveis em
  `job_opening_versions`;
- Candidatos sao cadastros globais dentro de uma Organization e nao representam
  candidatura, pipeline, avaliacao ou decisao de contratacao.

A proxima etapa conceitual precisa conectar uma pessoa candidata a uma Vaga sem
misturar responsabilidades. O processo seletivo deve preservar o contexto exato
da Vaga publicada no momento da candidatura e, ao mesmo tempo, manter o cadastro
do Candidate reutilizavel para outras Vagas da mesma Organization.

Tambem e necessario preparar a arquitetura para pipeline, IA, entrevistas e
propostas futuras sem implementar esses modulos nesta decisao.

## Decisao

Criar a entidade conceitual `CandidateApplication`.

`CandidateApplication` representa a candidatura de um `Candidate` para uma
`Job Opening`. Ela nao e o `Candidate`, nao e a `Job Opening` e nao substitui
nenhuma dessas entidades. Ela conecta ambas dentro de uma Organization.

Cada `CandidateApplication` deve pertencer exatamente a uma Organization e
referenciar exatamente:

- uma `Job Opening`;
- uma versao publicada especifica da `Job Opening`;
- um `Candidate`.

Mudancas futuras na Vaga nunca alteram uma candidatura existente. A candidatura
deve continuar apontando para a versao publicada que estava valida no momento em
que foi criada.

Os vinculos principais sao imutaveis. Depois de criada, uma
`CandidateApplication` nunca pode alterar:

- `organization_id`;
- `candidate_id`;
- `job_opening_id`;
- `job_opening_version_id`.

Deve existir apenas uma `CandidateApplication` ativa para o mesmo par
Candidate + Job Opening dentro da mesma Organization. Essa regra deve ser
protegida conceitualmente contra concorrencia por validacao transacional e
restricao de persistencia quando implementada.

A candidatura deve registrar apenas referencias por IDs internos. Nao copiar
Cargo, Competencias, Perguntas, conteudo da Vaga ou dados do Candidate para
`CandidateApplication`. Os snapshots de Cargo, competencias, perguntas e demais
conteudos pertencem as versoes da `Job Opening`.

O pipeline pertence a `CandidateApplication`. Ele nao pertence ao `Candidate` e
nao pertence a `Job Opening`.

`application_status` e `current_stage` sao conceitos diferentes:

- `application_status` representa o ciclo de vida da candidatura;
- `current_stage` representa a etapa atual do pipeline.

Toda movimentacao de etapa do processo seletivo deve gerar historico imutavel.
Nenhuma movimentacao deve ser apagada ou sobrescrita como fonte unica de
verdade.

Toda mudanca relevante em `CandidateApplication`, incluindo criacao,
cancelamento, alteracao de estado, movimentacao de etapa e leituras
administrativas, deve gerar auditoria. Auditoria nao deve armazenar dados
pessoais completos, conteudo completo de Vaga, respostas completas, tokens,
headers ou segredos.

Os estados canonicos definidos por esta ADR pertencem apenas a candidatura. Nao
devem reutilizar status de `Candidate` nem status de `Job Opening`.

Estados canonicos iniciais de `CandidateApplication`:

- `active`;
- `withdrawn`;
- `rejected`;
- `hired`;
- `cancelled`.

Esses estados descrevem o ciclo de vida da candidatura como vinculo entre
Candidate e Vaga. Eles nao substituem etapas detalhadas de pipeline, que terao
modelagem propria em fase futura.

`active` e o unico estado nao final. `withdrawn`, `rejected`, `hired` e
`cancelled` sao estados finais e nunca retornam para `active`.

As etapas minimas iniciais de pipeline sao:

- `applied`;
- `screening`;
- `interview`;
- `assessment`;
- `offer`;
- `completed`.

Essas etapas nao implementam entrevistas, avaliacoes, IA ou propostas. Elas
apenas representam posicoes operacionais minimas no fluxo da candidatura.

A etapa `completed` e apenas uma etapa operacional. Chegar a `completed` nao
finaliza automaticamente a candidatura; `application_status` permanece `active`
ate uma acao explicita de finalizacao.

Finalizacoes possuem semantica propria:

- `withdrawn` representa retirada do candidato;
- `rejected` representa decisao negativa da empresa;
- `hired` representa aprovacao final, sem criar contratacao, colaborador ou
  onboarding;
- `cancelled` representa encerramento administrativo.

Toda finalizacao deve registrar responsavel, data e motivo ou referencia
administrativa. Estados finais nunca retornam para `active` e candidaturas
finalizadas nao mudam de etapa.

Avaliacao por IA futura nao pertence ao `Candidate` e nao pertence a
`Job Opening`. Quando especificada, ela devera pertencer a
`CandidateApplication` ou a entidades filhas diretamente vinculadas a ela.

Entrevistas futuras pertencem a `CandidateApplication`.

Propostas futuras pertencem a `CandidateApplication`.

Todos os relacionamentos futuros devem usar IDs internos. Nao usar textos,
nomes, titulos, e-mails, codigos de Vaga ou slugs publicos como referencia de
dominio entre modulos.

Nao existe exclusao fisica de `CandidateApplication`, historico de etapa,
avaliacoes futuras, entrevistas futuras ou propostas futuras. Estados,
cancelamentos, retirada de candidatura e anonimizacao futura devem preservar IDs
historicos, integridade referencial, auditoria e relacionamentos historicos.

Notas internas do processo seletivo devem pertencer a candidatura em entidade
propria, conceitualmente `candidate_application_notes`. Notas de candidatura nao
pertencem ao Candidate principal.

Se o consentimento operacional do Candidate se tornar `pending`, `revoked` ou
`expired` apos a criacao da candidatura, a candidatura e seu historico permanecem
preservados, mas novas acoes operacionais ficam bloqueadas. Devem continuar
permitidos apenas encerramentos administrativos necessarios, leitura historica
minima autorizada e leitura administrativa auditada.

Operacoes concorrentes devem bloquear e revalidar a `CandidateApplication` dentro
da transacao. A primeira operacao confirmada prevalece; operacoes concorrentes
incompativeis devem receber conflito seguro.

## Seguranca

Toda `CandidateApplication` pertence exatamente a uma Organization.

Todas as leituras e gravacoes devem validar no servidor:

- `organizationId`;
- `candidateApplicationId`;
- `candidateId`;
- `jobOpeningId`;
- `jobOpeningVersionId`;
- User ativo;
- Membership ativo;
- Organization ativa;
- role autorizada;
- pertencimento de todos os IDs a mesma Organization.

IDs manipulados pelo cliente nao provam permissao. Uma candidatura nunca pode
atravessar Organizations, mesmo quando o mesmo e-mail existir como Candidate em
Organizations diferentes.

Mensagens de erro para acesso cruzado devem ser genericas e nao revelar a
existencia de Candidate, Job Opening, versao ou candidatura em outra
Organization.

Platform Admin nao recebe role funcional dentro da Organization. Eventual
consulta administrativa deve exigir motivo e gerar auditoria.

## Consequencias

- O cadastro principal de Candidate permanece livre de status de candidatura,
  pipeline, entrevistas, avaliacoes e propostas.
- A Job Opening permanece responsavel por sua modelagem versionada e por seus
  snapshots publicados.
- A candidatura preserva o contexto exato da versao publicada da Vaga usada no
  momento da aplicacao.
- Mudancas futuras em Cargo, competencias, perguntas, Vaga ou Candidate nao
  reescrevem o historico do processo seletivo.
- Pipeline, IA, entrevistas e propostas poderao evoluir como entidades
  vinculadas a `CandidateApplication`, sem reabrir a separacao entre Candidate e
  Job Opening.
- A arquitetura continua alinhada ao isolamento multiempresa e ao uso de IDs
  internos como referencias de dominio.

## Fora do escopo

Esta ADR nao define:

- pipeline detalhado;
- etapas canonicas de pipeline;
- criterios de aprovacao ou reprovacao;
- IA;
- entrevistas;
- propostas;
- onboarding;
- contratacao;
- candidatura publica;
- respostas de triagem;
- ranking, matching ou recomendacao.

Esses modulos terao SPECs e ADRs proprias quando forem planejados.

## Restricoes mantidas

- Candidate nao possui status de candidatura.
- Job Opening nao possui pipeline de candidatos.
- Snapshots de Cargo, competencias e perguntas continuam pertencendo as versoes
  da Job Opening.
- Toda referencia entre modulos usa ID interno.
- Nao ha exclusao fisica.
- Dados nunca atravessam Organizations.
- IA nao aprova nem reprova candidatos sozinha.
