# SPEC-013 - Entrevistas

**Status:** Aprovada  
**Versao:** 1.0  
**Fase:** 10  
**Responsavel de negocio:** Thiago Sousa  
**Dependencias:** SPEC-004 - Roles & Permissions, SPEC-009 - Banco de Perguntas, SPEC-011 - Candidatos, SPEC-012 - Processo Seletivo, ADR-0015 - Entrevistas vinculadas a candidatura  
**Ultima atualizacao:** 2026-08-06

## Objetivo

Definir o modulo de Entrevistas vinculado ao Processo Seletivo.

Nesta fase, o sistema deve permitir conceitualmente:

- criar entrevistas vinculadas a CandidateApplication;
- agendar, reagendar, cancelar, iniciar e concluir entrevistas;
- registrar respostas de perguntas preparadas para a entrevista;
- registrar avaliacoes de entrevistadores;
- consultar historico imutavel;
- usar perguntas do Banco de Perguntas por `question_catalog_items.id`;
- preservar snapshot contextual das perguntas no momento da preparacao;
- aplicar permissoes por Organization, role e participacao;
- proteger dados pessoais e conteudo sensivel;
- auditar operacoes relevantes;
- impedir acesso cruzado entre Organizations.

## Fora do escopo

Esta fase nao implementa:

- videoconferencia;
- gravacao de audio;
- gravacao de video;
- transcricao automatica;
- IA;
- decisao automatica;
- ranking;
- score;
- proposta;
- contratacao;
- onboarding;
- calendario externo;
- envio de e-mail;
- notificacoes;
- assinatura eletronica.

Entrevistas nao movimentam automaticamente CandidateApplication, nao alteram
status de Candidate, nao alteram Job Opening e nao finalizam processo seletivo.

## Usuarios envolvidos

- Owner da Organization;
- Admin da Organization;
- Member participante da entrevista;
- Platform Admin em leitura administrativa justificada.

## Conceitos

### Interview

Representa uma entrevista de uma CandidateApplication.

Cada Interview pertence a:

- uma Organization;
- uma CandidateApplication.

Interview nao pertence diretamente ao Candidate nem diretamente a Job Opening.
Esses contextos sao herdados da CandidateApplication.

Campos conceituais minimos:

- `id`;
- `organization_id`;
- `candidate_application_id`;
- `title`;
- `type`;
- `status`;
- `scheduled_start_at` opcional;
- `scheduled_end_at` opcional;
- `timezone`;
- `location_type`;
- `location_details` opcional;
- `interviewer_instructions` opcional;
- `candidate_instructions` opcional;
- `started_at`;
- `completed_at`;
- `cancelled_at`;
- `cancelled_by_user_id`;
- `cancellation_reason`;
- autoria;
- timestamps.

### Interview Question

Representa uma pergunta preparada para a entrevista.

Campos conceituais minimos:

- `id`;
- `organization_id`;
- `interview_id`;
- `question_catalog_item_id`;
- snapshot de titulo;
- snapshot de texto;
- snapshot de tipo;
- snapshot de opcoes;
- snapshot de configuracoes;
- ordem;
- obrigatoriedade;
- peso contextual opcional;
- competencia contextual opcional;
- timestamps.

### Interview Response

Representa a resposta registrada para uma pergunta preparada.

Campos conceituais minimos:

- `id`;
- `organization_id`;
- `interview_id`;
- `interview_question_id`;
- resposta estruturada;
- observacao opcional do entrevistador;
- autoria;
- timestamps.

### Interview Evaluation

Representa a avaliacao de um entrevistador autorizado.

Campos conceituais minimos:

- `id`;
- `organization_id`;
- `interview_id`;
- `evaluator_user_id`;
- `recommendation`;
- resumo;
- pontos fortes;
- pontos de atencao;
- nota geral;
- timestamps.

### Interview Event

Representa evento imutavel da linha do tempo da entrevista.

Eventos canonicos iniciais:

- `interview_created`;
- `draft_updated`;
- `scheduled`;
- `rescheduled`;
- `participant_added`;
- `participant_removed`;
- `participant_inactivated`;
- `started`;
- `response_registered`;
- `response_updated`;
- `evaluation_registered`;
- `evaluation_updated`;
- `completed`;
- `cancelled`;
- `no_show`;
- `access_denied`;
- `administrative_read`.

Campos conceituais minimos:

- `id`;
- `organization_id`;
- `interview_id`;
- `event_type`;
- estado anterior quando aplicavel;
- estado novo quando aplicavel;
- ator;
- motivo quando aplicavel;
- metadados minimos sem dados pessoais completos;
- `created_at`.

### Interview Participant

Representa usuario participante de uma entrevista.

Campos conceituais minimos:

- `id`;
- `organization_id`;
- `interview_id`;
- `user_id`;
- `role`;
- `status`;
- timestamps.

Roles canonicos:

- `lead`;
- `interviewer`;
- `observer`.

Cada entrevista deve possuir pelo menos um participante `lead`.

## Tipos canonicos

Tipos de entrevista:

- `screening`;
- `behavioral`;
- `technical`;
- `cultural`;
- `leadership`;
- `management`;
- `panel`;
- `final`;
- `other`.

## Estados canonicos

Estados de Interview:

- `draft`;
- `scheduled`;
- `in_progress`;
- `completed`;
- `cancelled`;
- `no_show`.

Regras:

- `draft` permite preparacao;
- `scheduled` exige agenda valida;
- `in_progress` indica entrevista iniciada;
- `completed`, `cancelled` e `no_show` sao finais;
- estados finais nao retornam para estados operacionais;
- nao existe exclusao fisica.

## Localizacao

`location_type` deve aceitar:

- `onsite`;
- `video`;
- `phone`;
- `other`.

Quando `location_type` for `video`, a fase pode armazenar apenas um link externo
opcional em `location_details`. Nao ha criacao de sala, integracao com
videoconferencia, gravacao ou transcricao.

## Vinculo com CandidateApplication

Toda Interview deve referenciar uma CandidateApplication da mesma Organization.

Regras:

- recusar CandidateApplication de outra Organization;
- recusar criacao de entrevista para CandidateApplication finalizada, salvo regra administrativa explicita futura;
- entrevista so pode existir operacionalmente enquanto CandidateApplication estiver `active`;
- entrevistas existentes permanecem preservadas quando a CandidateApplication for finalizada;
- Interview nao altera CandidateApplication automaticamente;
- Interview nao move etapa de pipeline;
- Interview nao rejeita, contrata, cancela nem retira candidatura.

## Perguntas e snapshot

Perguntas usadas em entrevistas devem referenciar `question_catalog_items.id`.

Regras:

- pergunta deve pertencer a mesma Organization;
- pergunta deve estar operacionalmente ativa no momento da inclusao;
- pergunta adotada de catalogo global continua referenciada pelo item do catalogo;
- nao deve haver pergunta duplicada na mesma entrevista;
- limite inicial de 100 perguntas por entrevista;
- uma entrevista pode ser criada sem perguntas;
- peso contextual e opcional, de 0 a 100;
- pesos nao precisam somar 100.

O snapshot da pergunta deve preservar:

- `question_catalog_item_id`;
- titulo;
- texto;
- tipo;
- opcoes;
- configuracoes.

Alteracoes futuras no banco de perguntas nao modificam entrevistas ja preparadas
ou concluidas. Respostas devem usar o snapshot da Interview Question, nao o
estado atual do catalogo.

## Respostas

Respostas pertencem a Interview Question.

Regras:

- respostas pertencem a entrevista, nao ao entrevistador individual;
- `interview_question_id` deve pertencer a mesma Interview;
- question, response e interview devem pertencer a mesma Organization;
- resposta deve ser compativel com o tipo da pergunta;
- perguntas obrigatorias precisam de resposta antes da conclusao;
- respostas parciais podem ser salvas enquanto a entrevista estiver
  `in_progress`;
- `lead` e `interviewer` podem registrar ou corrigir respostas durante
  `in_progress`;
- registrar resposta exige vinculo ativo em `interview_participants`;
- owner/admin sem participacao nao registram resposta;
- `observer` nao registra resposta;
- respostas ficam imutaveis depois de `completed`;
- member sem papel operacional na entrevista nao pode registrar nem visualizar
  respostas.
- toda alteracao de resposta deve registrar autoria e auditoria minima;
- auditoria nao copia conteudo completo da resposta.

Tipos de resposta previstos:

- texto;
- escolha unica;
- multipla escolha;
- sim/nao;
- numerico;
- escala;
- data;
- texto estruturado para perguntas comportamentais, tecnicas ou situacionais.

## Avaliacao do entrevistador

Avaliacoes pertencem a Interview.

Regras:

- cada `lead` ou `interviewer` pode possuir no maximo uma avaliacao por
  entrevista;
- a avaliacao e vinculada por `evaluator_user_id`;
- o usuario so pode criar ou alterar sua propria avaliacao;
- owner/admin nao podem alterar avaliacao de outro entrevistador;
- `observer` nao avalia;
- avaliacoes de outros participantes nao ficam visiveis durante a execucao nesta
  fase;
- owner/admin podem consultar todas as avaliacoes apos a conclusao;
- member participante continua vendo apenas sua propria avaliacao;
- avaliacao nao altera CandidateApplication;
- avaliacao nao altera Candidate;
- avaliacao nao cria ranking, score, contratacao ou rejeicao;
- avaliacao fica imutavel depois de `completed`;
- conteudo completo da avaliacao nao deve ser copiado para auditoria.

`recommendation` deve aceitar:

- `strong_no`;
- `no`;
- `neutral`;
- `yes`;
- `strong_yes`.

`overall_rating` deve ser inteiro de 1 a 5.

## Participantes

Existem duas autorizacoes independentes:

- Role da Membership: `owner`, `admin` ou `member`;
- papel do participante na entrevista: `lead`, `interviewer` ou `observer`.

O papel na entrevista nao substitui a Membership.

Para participar operacionalmente, o usuario deve possuir:

- User ativo;
- Membership ativa na mesma Organization;
- vinculo ativo em `interview_participants`;
- papel autorizado na entrevista.

Participantes devem ser usuarios com Membership ativo na mesma Organization.

Regras:

- nao permitir participante de outra Organization;
- nao permitir usuario inativo;
- nao permitir membership inativo;
- exigir pelo menos um participante `lead`;
- `observer` nao registra respostas nem avaliacoes;
- `interviewer` pode registrar respostas e a propria avaliacao enquanto a
  entrevista estiver `in_progress`;
- `lead` administra a execucao e pode iniciar, registrar respostas, avaliar,
  concluir, cancelar e marcar no-show;
- owner/admin administram participantes.

## Agendamento

`scheduled` exige:

- `scheduled_start_at`;
- `scheduled_end_at`;
- `timezone`;
- fim posterior ao inicio.

Regras:

- entrevista pode ser reagendada antes de iniciar;
- reagendamento gera evento e auditoria;
- nao ha deteccao de conflito de agenda nesta fase;
- nao ha integracao com calendario externo;
- entrevistas `completed`, `cancelled` ou `no_show` nao podem ser reagendadas.

## Inicio

Para iniciar entrevista:

- status deve ser `scheduled`;
- CandidateApplication deve estar operacionalmente valida;
- Candidate deve estar ativo;
- consentimento operacional deve estar valido;
- Organization deve estar ativa;
- usuario deve ser `lead` participante ou owner/admin em operacao
  administrativa auditada;
- inicio deve registrar `started_at`;
- status muda para `in_progress`;
- operacao deve ser transacional;
- evento e auditoria sao obrigatorios.

Inicio antes ou depois do horario previsto pode ser permitido nesta fase, desde
que as validacoes de seguranca e estado sejam cumpridas.

## Conclusao

Para concluir entrevista:

- status deve ser `in_progress`;
- todas as perguntas obrigatorias devem estar respondidas;
- deve existir pelo menos uma avaliacao, salvo decisao contraria registrada;
- usuario deve ser `lead` participante ou owner/admin em operacao
  administrativa auditada;
- `completed_at` deve ser registrado;
- status muda para `completed`;
- respostas e avaliacoes tornam-se imutaveis;
- evento e auditoria sao obrigatorios;
- operacao deve ser transacional.

A conclusao nao move pipeline, nao altera status de CandidateApplication, nao
rejeita, nao contrata e nao gera analise de IA.

## Cancelamento e no-show

Cancelamento:

- permitido para owner, admin ou `lead`;
- permitido antes de `completed`;
- exige motivo;
- muda status para `cancelled`;
- registra data, ator, motivo, evento e auditoria;
- e final;
- preserva respostas e avaliacoes existentes;
- nao altera CandidateApplication.

No-show:

- permitido para owner, admin ou `lead`;
- exige motivo;
- permitido apenas a partir de `scheduled`;
- muda status para `no_show`;
- e final;
- nao rejeita automaticamente;
- nao altera CandidateApplication;
- registra evento e auditoria.

## Consentimento, Candidate inativo e candidatura finalizada

Consentimento operacional `pending`, `revoked` ou `expired` bloqueia:

- criacao de nova entrevista;
- inicio de entrevista;
- nova resposta;
- nova avaliacao;
- conclusao operacional.

Esses estados permitem:

- cancelamento administrativo;
- no-show administrativo quando aplicavel;
- leitura administrativa minima autorizada;
- preservacao de historico.

Candidate inativo bloqueia:

- nova entrevista;
- inicio;
- nova resposta;
- nova avaliacao;
- conclusao operacional.

Candidate inativo nao apaga entrevistas existentes.

CandidateApplication finalizada bloqueia nova entrevista. Entrevistas existentes
permanecem preservadas. Entrevistas `draft` ou `scheduled` devem ser tratadas
administrativamente por cancelamento ou no-show quando cabivel. Entrevista
`in_progress` nao pode ser concluida operacionalmente depois da finalizacao da
candidatura; deve receber tratamento administrativo. Estados finais da entrevista
permanecem imutaveis.

## Permissoes

### Owner

Owner pode administrar a entrevista mesmo que nao esteja registrado como
participante.

Pode administrar:

- criar entrevista;
- consultar entrevista;
- editar rascunho;
- agendar;
- reagendar;
- administrar participantes;
- cancelar;
- marcar no-show;
- consultar historico.

Para registrar respostas ou avaliacoes, owner precisa estar registrado como
participante ativo com papel `lead` ou `interviewer`.

Owner pode iniciar e concluir administrativamente mesmo sem participacao, desde
que a operacao seja permitida pelo status, seja registrada como administrativa e
gere auditoria.

### Admin

Admin possui as mesmas permissoes funcionais do owner nesta fase, exceto
mudancas futuras explicitamente reservadas.

Admin pode administrar a entrevista mesmo que nao esteja registrado como
participante.

Para registrar respostas ou avaliacoes, admin precisa estar registrado como
participante ativo com papel `lead` ou `interviewer`.

Admin pode iniciar e concluir administrativamente mesmo sem participacao, desde
que a operacao seja permitida pelo status, seja registrada como administrativa e
gere auditoria.

### Member

#### Member nao participante

Member nao participante nao pode:

- consultar a entrevista;
- consultar respostas;
- consultar avaliacoes;
- iniciar;
- concluir;
- cancelar;
- marcar no-show;
- registrar qualquer dado.

#### DTO positivo do member participante

Member participante pode visualizar somente entrevistas `scheduled` ou
`in_progress` das quais participe.

DTO permitido para member participante:

- `id`;
- `title`;
- `type`;
- `status`;
- `scheduled_start_at`;
- `scheduled_end_at`;
- `timezone`;
- `location_type`;
- detalhes minimos de localizacao;
- seu proprio papel;
- Candidate `id`;
- Candidate `full_name`;
- Candidate `preferred_name`;
- CandidateApplication `id`;
- CandidateApplication `current_stage`;
- Job Opening `id`;
- Job Opening `title`;
- Job Opening Version `id`;
- Job Opening Version `public_title`.
- perguntas da entrevista, somente quando necessarias para sua atuacao;
- suas proprias respostas ou avaliacoes, conforme o papel.

Member nunca pode visualizar:

- contatos do Candidate;
- consentimento;
- salario pretendido;
- observacoes internas de Candidate;
- notas da candidatura;
- historico administrativo;
- avaliacoes de outros entrevistadores;
- instrucoes internas restritas;
- autoria interna;
- dados completos da Vaga;
- faixa salarial da Vaga;
- entrevistas em que nao participa;
- dados fora da lista positiva.

#### Member com papel `observer`

Pode visualizar somente entrevistas `scheduled` ou `in_progress` das quais
participe e somente o DTO positivo definido nesta SPEC.

Nao pode:

- registrar resposta;
- registrar avaliacao;
- iniciar;
- concluir;
- cancelar;
- marcar no-show;
- administrar participantes;
- alterar roteiro.

#### Member com papel `interviewer`

Pode:

- visualizar o DTO positivo;
- visualizar as perguntas da entrevista;
- registrar e corrigir respostas enquanto a entrevista estiver `in_progress`;
- registrar e corrigir somente sua propria avaliacao enquanto a entrevista nao
  estiver concluida.

Nao pode:

- iniciar;
- concluir;
- cancelar;
- marcar no-show;
- administrar participantes;
- alterar roteiro;
- visualizar avaliacoes de outros entrevistadores.

#### Member com papel `lead`

Pode:

- visualizar o DTO positivo;
- visualizar as perguntas;
- iniciar;
- registrar e corrigir respostas;
- registrar e corrigir sua propria avaliacao;
- concluir;
- cancelar;
- marcar no-show.

Nao pode:

- administrar participantes;
- editar o roteiro depois do inicio;
- visualizar avaliacoes de outros entrevistadores antes da conclusao, salvo
  regra administrativa futura;
- alterar entrevista concluida.

### Administracao excepcional

Owner/admin podem iniciar, concluir, cancelar e marcar no-show mesmo sem serem
participantes, desde que:

- a operacao seja permitida pelo status;
- o motivo seja informado quando aplicavel;
- a acao seja registrada como administrativa;
- gere auditoria.

Owner/admin sem participacao nao podem:

- registrar resposta;
- registrar avaliacao.

### Platform Admin

Platform Admin nao opera funcionalmente entrevistas.

Pode realizar apenas leitura administrativa com:

- motivo obrigatorio;
- auditoria obrigatoria;
- escopo minimo necessario;
- ausencia de dados pessoais completos e conteudo sensivel quando nao
  indispensavel.

Platform Admin nao cria, agenda, inicia, responde, avalia, conclui, cancela ou
marca no-show.

## Organization arquivada

Organization arquivada bloqueia operacoes normais.

Enquanto arquivada, nao e permitido:

- criar entrevista;
- editar rascunho;
- agendar;
- reagendar;
- iniciar;
- registrar resposta;
- registrar avaliacao;
- concluir;
- cancelar operacionalmente;
- marcar no-show operacionalmente.

Dados existentes permanecem preservados. Leituras administrativas devem seguir
permissao, motivo e auditoria.

## API conceitual

Rotas conceituais previstas:

- criar entrevista;
- listar entrevistas por CandidateApplication;
- listar entrevistas por participante;
- consultar entrevista;
- atualizar rascunho;
- adicionar participante;
- remover ou inativar participante;
- adicionar pergunta;
- remover pergunta antes de uso;
- reordenar perguntas antes de uso;
- agendar;
- reagendar;
- iniciar;
- registrar ou editar resposta antes da conclusao;
- registrar ou editar avaliacao antes da conclusao;
- concluir;
- cancelar;
- marcar no-show;
- consultar timeline;
- leitura administrativa justificada.

Esta SPEC nao define contratos HTTP finais.

## Interface

Interface minima prevista:

- lista de entrevistas;
- filtros por status, vaga e participante;
- criacao de entrevista;
- preparacao de roteiro;
- selecao de perguntas do Banco de Perguntas;
- administracao de participantes;
- agendamento;
- tela de execucao;
- registro de respostas;
- registro de avaliacao;
- acao de conclusao;
- acao de cancelamento;
- acao de no-show;
- timeline da entrevista;
- mensagens claras para bloqueios por consentimento, Candidate inativo,
  permissao e candidatura finalizada.

Nao deve haver interface de calendario externo, chamada de video, gravacao,
transcricao ou IA nesta fase.

## Banco conceitual

Modelagem conceitual prevista:

- `interviews`;
- `interview_participants`;
- `interview_questions`;
- `interview_responses`;
- `interview_evaluations`;
- `interview_events`.

Regras conceituais:

- `organization_id` obrigatorio em todas as tabelas;
- CandidateApplication, Interview, Questions, Responses, Evaluations,
  Participants e Events devem pertencer a mesma Organization;
- usar FKs compostas ou validacoes equivalentes para impedir cruzamento de
  Organization;
- status e tipos canonicos devem ser validados;
- deve existir pelo menos um `lead`;
- uma pergunta do catalogo nao deve ser duplicada na mesma entrevista;
- resposta deve pertencer a uma pergunta da mesma entrevista;
- uma avaliacao ativa por entrevistador por entrevista;
- snapshots de perguntas devem ser estruturados;
- eventos devem ser imutaveis;
- entrevista `completed`, `cancelled` ou `no_show` deve ficar imutavel nas
  partes operacionais;
- alteracao de `organization_id` deve ser proibida;
- nao deve haver cascade destrutivo que apague historico de entrevista;
- migration futura deve ser reproduzivel e sem dados reais.

Esta SPEC nao define SQL.

## Seguranca

Toda operacao deve validar no servidor:

- User ativo;
- Membership ativo;
- Organization ativa;
- role;
- papel de participante quando aplicavel;
- `organization_id`;
- `candidate_application_id`;
- `interview_id`;
- `interview_question_id`;
- `interview_response_id`;
- `interview_evaluation_id`;
- `question_catalog_item_id`;
- usuario participante;
- CandidateApplication da mesma Organization;
- pergunta da mesma Organization;
- response vinculada a pergunta correta;
- evaluation vinculada a usuario autorizado.

Regras adicionais:

- proteger contra mass assignment;
- cliente nao pode definir `organization_id`, autoria, timestamps, campos
  internos ou status fora das operacoes proprias;
- usar SQL parametrizado na implementacao futura;
- mensagens de erro nao devem revelar dados de outra Organization;
- logs nao devem conter dados pessoais completos;
- links privados completos nao devem ser registrados em auditoria;
- UI nao e fonte de autorizacao.

## Auditoria

Devem ser auditados:

- criacao;
- edicao de rascunho;
- agendamento;
- reagendamento;
- participante adicionado;
- participante removido ou inativado;
- inicio;
- resposta criada;
- resposta alterada;
- avaliacao criada;
- avaliacao alterada;
- conclusao;
- cancelamento;
- no-show;
- bloqueio por consentimento;
- tentativa com candidatura finalizada;
- tentativa com Candidate inativo;
- tentativa cross-Organization;
- acesso negado;
- leitura administrativa.

Auditoria nao deve armazenar:

- respostas completas;
- avaliacoes completas;
- conteudo integral de perguntas;
- contatos completos;
- consentimento detalhado;
- salario;
- tokens;
- headers;
- segredos;
- links privados completos.

Falha de auditoria critica deve causar rollback da operacao transacional.

## Criterios de aceite

1. Entrevista e criada vinculada a uma CandidateApplication.
2. Entrevista nao e criada diretamente para Candidate.
3. Entrevista nao e criada diretamente para Job Opening.
4. CandidateApplication deve pertencer a mesma Organization.
5. Candidate herdado da CandidateApplication deve pertencer a mesma Organization.
6. Job Opening herdada da CandidateApplication deve pertencer a mesma
   Organization.
7. Uma CandidateApplication pode possuir multiplas entrevistas.
8. Entrevista nao altera CandidateApplication automaticamente.
9. Entrevista nao move pipeline.
10. Entrevista nao altera status de Candidate.
11. Entrevista nao altera Job Opening.
12. Perguntas referenciam `question_catalog_items.id`.
13. Perguntas de outra Organization sao bloqueadas.
14. Perguntas inativas nao podem ser adicionadas a nova preparacao.
15. Snapshot de pergunta e preservado.
16. Alteracao futura no catalogo nao muda entrevista preparada.
17. Perguntas duplicadas na mesma entrevista sao bloqueadas.
18. Limite de 100 perguntas e respeitado.
19. Participante de outra Organization e bloqueado.
20. Participante sem Membership ativo e bloqueado.
21. Entrevista exige pelo menos um `lead`.
22. `observer` nao registra resposta.
23. `observer` nao registra avaliacao.
24. `interviewer` registra propria avaliacao.
25. Avaliacao duplicada do mesmo entrevistador e bloqueada.
26. Agendamento exige inicio, fim e timezone.
27. Fim deve ser posterior ao inicio.
28. Reagendamento gera evento e auditoria.
29. Inicio exige status `scheduled`.
30. Inicio exige CandidateApplication operacionalmente valida.
31. Inicio exige consentimento operacional valido.
32. Inicio exige Candidate ativo.
33. Pergunta obrigatoria sem resposta bloqueia conclusao.
34. Conclusao exige `lead` participante ou owner/admin em operacao
    administrativa auditada.
35. Conclusao gera evento e auditoria.
36. Respostas ficam imutaveis depois de `completed`.
37. Avaliacoes ficam imutaveis depois de `completed`.
38. Cancelamento exige motivo.
39. No-show exige motivo.
40. Estados finais nao retornam a estados operacionais.
41. Consentimento `pending`, `revoked` ou `expired` bloqueia novo uso
    operacional.
42. Candidate inativo bloqueia novo uso operacional.
43. CandidateApplication finalizada bloqueia nova entrevista.
44. Entrevistas existentes permanecem preservadas apos finalizacao da
    candidatura.
45. Member visualiza somente entrevistas em que participa.
46. DTO de member contem somente a lista positiva.
47. Member nao recebe contatos, salario, consentimento detalhado, observacoes
    internas, historico administrativo ou avaliacoes de outros entrevistadores.
48. Platform Admin nao executa operacoes funcionais.
49. Platform Admin exige motivo e auditoria para leitura administrativa.
50. Organization arquivada bloqueia operacoes normais.
51. Acesso cruzado entre Organizations e bloqueado com mensagem generica.
52. Auditoria nao contem dados pessoais completos nem conteudo sensivel.
53. Eventos de entrevista sao imutaveis.
54. Nenhuma entrevista e excluida fisicamente.
55. Dados persistem apos reinicializacao da aplicacao futura.
56. Member nao participante nao acessa entrevista, respostas ou avaliacoes.
57. Member `observer` possui apenas leitura restrita ao DTO positivo.
58. Member `interviewer` registra respostas durante `in_progress`.
59. Member `interviewer` registra somente sua propria avaliacao.
60. Member `lead` pode iniciar e concluir entrevista.
61. Owner/admin podem iniciar ou concluir administrativamente sem participacao,
    com auditoria.
62. Owner/admin sem participacao sao impedidos de registrar resposta.
63. Usuario e impedido de alterar avaliacao de outro entrevistador.
64. Avaliacoes de terceiros ficam ocultas durante a execucao.
65. Avaliacoes ficam imutaveis apos conclusao.

## Testes obrigatorios

1. Criar entrevista para CandidateApplication valida.
2. Bloquear CandidateApplication de outra Organization.
3. Bloquear CandidateApplication finalizada para nova entrevista.
4. Bloquear Candidate inativo para nova entrevista.
5. Bloquear consentimento `pending`.
6. Bloquear consentimento `revoked`.
7. Bloquear consentimento `expired`.
8. Permitir multiplas entrevistas para a mesma CandidateApplication.
9. Bloquear tipo invalido.
10. Bloquear status invalido.
11. Bloquear pergunta de outra Organization.
12. Bloquear pergunta inativa em nova preparacao.
13. Bloquear pergunta duplicada.
14. Preservar snapshot apos alteracao do catalogo.
15. Bloquear mais de 100 perguntas.
16. Bloquear participante de outra Organization.
17. Bloquear usuario inativo como participante.
18. Bloquear Membership inativo.
19. Bloquear entrevista sem `lead`.
20. Bloquear `observer` registrando resposta.
21. Bloquear `observer` registrando avaliacao.
22. Permitir `interviewer` registrar propria avaliacao.
23. Bloquear avaliacao duplicada do mesmo entrevistador.
24. Bloquear agendamento sem inicio.
25. Bloquear agendamento sem fim.
26. Bloquear agendamento sem timezone.
27. Bloquear fim anterior ou igual ao inicio.
28. Reagendar entrevista antes de iniciar.
29. Bloquear reagendamento de entrevista final.
30. Iniciar entrevista agendada com permissao valida.
31. Bloquear inicio sem permissao.
32. Bloquear inicio com CandidateApplication invalida operacionalmente.
33. Bloquear resposta incompativel com tipo da pergunta.
34. Bloquear resposta para pergunta de outra entrevista.
35. Bloquear conclusao com pergunta obrigatoria sem resposta.
36. Bloquear conclusao sem avaliacao quando decisao contraria nao estiver
    documentada.
37. Concluir entrevista valida.
38. Bloquear alteracao de resposta apos `completed`.
39. Bloquear alteracao de avaliacao apos `completed`.
40. Cancelar entrevista com motivo.
41. Bloquear cancelamento sem motivo.
42. Marcar no-show com motivo.
43. Bloquear no-show em status invalido.
44. Bloquear member acessando entrevista em que nao participa.
45. Validar DTO restrito do member participante.
46. Bloquear Platform Admin em operacao funcional.
47. Permitir leitura administrativa do Platform Admin com motivo e auditoria.
48. Bloquear operacoes normais com Organization arquivada.
49. Bloquear IDs manipulados entre Organizations.
50. Bloquear mass assignment de `organization_id`, autoria, timestamps e status
    fora das operacoes proprias.
51. Garantir eventos imutaveis.
52. Garantir auditoria sem conteudo completo de respostas.
53. Garantir auditoria sem avaliacoes completas.
54. Garantir auditoria sem dados pessoais completos.
55. Garantir rollback quando auditoria critica falhar.
56. Garantir ausencia de exclusao fisica.
57. Garantir persistencia apos recriar a aplicacao futura.
58. Bloquear member nao participante tentando consultar.
59. Bloquear `observer` tentando registrar resposta.
60. Bloquear `observer` tentando avaliar.
61. Permitir `interviewer` registrando resposta.
62. Permitir `interviewer` alterando resposta durante `in_progress`.
63. Permitir `interviewer` registrando sua propria avaliacao.
64. Bloquear `interviewer` tentando alterar avaliacao de outro usuario.
65. Bloquear `interviewer` tentando concluir.
66. Permitir `lead` iniciando.
67. Permitir `lead` concluindo.
68. Permitir `lead` cancelando.
69. Permitir owner/admin sem participacao iniciando administrativamente.
70. Permitir owner/admin sem participacao concluindo administrativamente.
71. Bloquear owner/admin sem participacao tentando registrar resposta.
72. Bloquear owner/admin tentando alterar avaliacao de outro entrevistador.
73. Ocultar avaliacoes de outros entrevistadores ao member.
74. Bloquear alteracao de resposta apos conclusao.
75. Bloquear alteracao de avaliacao apos conclusao.

## Limitacoes

- Sem calendario externo.
- Sem envio de convites.
- Sem notificacoes.
- Sem videoconferencia integrada.
- Sem gravacao.
- Sem transcricao.
- Sem IA.
- Sem ranking.
- Sem score.
- Sem decisao automatica.
- Sem proposta.
- Sem contratacao.
- Sem onboarding.
- Sem movimentacao automatica de pipeline.

## Definicao de concluido

A fase sera considerada concluida quando:

- entrevistas puderem ser criadas para CandidateApplication valida;
- perguntas puderem ser preparadas com snapshot imutavel;
- participantes forem controlados por Organization e role;
- agendamento, inicio, respostas, avaliacoes, conclusao, cancelamento e no-show
  seguirem as regras da SPEC;
- dados de member forem expostos somente pelo DTO permitido;
- Platform Admin estiver limitado a leitura administrativa justificada;
- auditoria registrar eventos relevantes sem dados sensiveis completos;
- operacoes criticas forem transacionais;
- falha de auditoria critica causar rollback;
- nao existir exclusao fisica;
- testes obrigatorios forem implementados e aprovados em fase futura.
