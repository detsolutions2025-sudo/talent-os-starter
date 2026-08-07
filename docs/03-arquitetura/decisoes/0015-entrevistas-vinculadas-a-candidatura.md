# ADR 0015 - Entrevistas vinculadas a candidatura

## Status

Aceita.

## Contexto

O sistema ja possui a separacao conceitual entre Candidate, Job Opening, Job
Opening Version e CandidateApplication. A ADR-0014 definiu que o processo
seletivo versionado pertence a CandidateApplication, preservando os vinculos
historicos com Candidate, Job Opening e uma versao publicada da vaga.

Entrevistas sao uma etapa operacional do processo seletivo. Elas precisam
registrar agenda, participantes, perguntas, respostas, avaliacoes e historico
sem transformar o Candidate em uma entidade de candidatura e sem acoplar
movimentacoes diretamente a Job Opening.

Tambem e necessario preservar o contexto usado na preparacao da entrevista,
incluindo perguntas do banco de perguntas, sem que alteracoes futuras no
catalogo modifiquem entrevistas preparadas ou concluidas.

## Decisao

Fica decidido que toda entrevista pertence a uma CandidateApplication.

A entrevista:

- nao pertence diretamente ao Candidate;
- nao pertence diretamente a Job Opening;
- nao altera Candidate;
- nao altera Job Opening;
- nao altera Job Opening Version;
- nao movimenta automaticamente a CandidateApplication.

Uma CandidateApplication pode possuir muitas entrevistas.

Cada entrevista deve preservar o contexto da candidatura e da versao da vaga ja
referenciadas pela CandidateApplication. A entrevista nao deve copiar dados da
vaga, do candidato ou da candidatura como fonte primaria; esses relacionamentos
devem ser resolvidos por IDs internos.

## Autorizacao operacional

Existem duas autorizacoes independentes:

- Role da Membership na Organization: `owner`, `admin` ou `member`;
- papel do participante na entrevista: `lead`, `interviewer` ou `observer`.

O papel na entrevista nao substitui a Membership. Para participar
operacionalmente de uma entrevista, o usuario deve possuir:

- User ativo;
- Membership ativa na mesma Organization;
- vinculo ativo em `interview_participants`;
- papel autorizado na entrevista.

Owner e admin podem administrar a entrevista mesmo quando nao estiverem
registrados como participantes, incluindo criar, editar draft, agendar,
reagendar, administrar participantes, cancelar, marcar no-show e consultar
historico.

Para registrar respostas ou avaliacoes, owner e admin tambem precisam estar
registrados como participantes com papel `lead` ou `interviewer`. Sem
participacao ativa, owner e admin nao registram respostas nem avaliacoes.

Owner e admin podem iniciar, concluir, cancelar ou marcar no-show mesmo sem
participacao, desde que a operacao seja permitida pelo status, informe motivo
quando aplicavel, seja registrada como administrativa e gere auditoria.

## Perguntas

Perguntas usadas em entrevistas devem referenciar `question_catalog_items.id`.

A entrevista deve preservar um snapshot contextual das perguntas no momento da
preparacao, incluindo pelo menos:

- identificador interno da pergunta do catalogo;
- titulo;
- texto;
- tipo;
- opcoes;
- configuracoes necessarias para resposta;
- ordem;
- obrigatoriedade;
- peso contextual opcional;
- competencia contextual opcional.

Alteracoes futuras no banco de perguntas nao alteram entrevistas ja preparadas
ou concluidas.

Perguntas inativadas depois da preparacao continuam preservadas na entrevista.
Novas perguntas adicionadas a uma entrevista devem estar operacionalmente ativas
e pertencer a mesma Organization.

## Respostas e avaliacoes

Respostas pertencem a entrevista, vinculadas as perguntas preparadas da propria
entrevista. Elas nao pertencem ao Candidate principal.

Avaliacoes de entrevistadores pertencem a entrevista. Elas nao devem ser usadas
para gravar score, ranking, recomendacao automatica ou decisao no Candidate.

Respostas pertencem a entrevista, nao ao entrevistador individual. `lead` e
`interviewer` podem registrar ou corrigir respostas durante `in_progress`;
`observer` nao registra respostas. Toda alteracao deve registrar autoria e
auditoria minima sem copiar conteudo completo.

Cada `lead` ou `interviewer` pode possuir no maximo uma avaliacao por
entrevista, vinculada por `evaluator_user_id`. O usuario so pode criar ou
alterar sua propria avaliacao. Owner e admin nao podem alterar avaliacao de
outro entrevistador. Apos `completed`, avaliacoes ficam imutaveis. Avaliacoes de
outros participantes nao ficam visiveis durante a execucao nesta fase; owner e
admin podem consultar todas as avaliacoes apos a conclusao, enquanto member
participante continua vendo apenas a propria avaliacao.

Analises futuras por IA, se existirem, pertencerao a entrevista ou a
CandidateApplication. Elas nunca pertencerao ao Candidate principal.

Nesta fase, IA nao toma decisoes automaticas.

## Historico e auditoria

Entrevistas nunca devem ser excluidas fisicamente.

O historico da entrevista deve ser registrado em eventos imutaveis. Nenhum
evento operacional deve ser apagado.

Mudancas relevantes devem ser auditadas, incluindo criacao, agendamento,
reagendamento, inicio, respostas, avaliacoes, conclusao, cancelamento, no-show,
acessos negados e leituras administrativas.

A auditoria nao deve armazenar respostas completas, avaliacoes completas,
conteudo integral de perguntas, contatos completos, consentimentos detalhados,
salario, tokens, headers, segredos ou links privados completos.

Falha em auditoria critica deve bloquear a operacao transacional correspondente.

## Seguranca e isolamento

Toda entrevista pertence exatamente a uma Organization.

Dados de entrevista nunca podem atravessar Organizations.

Toda operacao deve validar no servidor:

- User ativo;
- Membership ativo;
- Organization ativa;
- role;
- permissao funcional ou participacao na entrevista;
- `organization_id`;
- `candidate_application_id`;
- `interview_id`;
- IDs de perguntas, respostas, avaliacoes e participantes quando aplicavel.

Relacionamentos devem usar IDs internos. Nomes, textos, titulos, codigos ou
slugs nao podem ser usados como chave de relacionamento funcional.

Mensagens de erro para tentativas de acesso cruzado nao devem revelar a
existencia de entrevistas, candidaturas, candidatos, vagas, perguntas ou usuarios
em outra Organization.

## Consequencias

Esta decisao mantem:

- Candidate como cadastro principal da pessoa;
- CandidateApplication como processo seletivo da pessoa em uma vaga;
- Interview como registro operacional de uma entrevista dentro da candidatura;
- Question Catalog como fonte versionavel para preparo de roteiros;
- respostas e avaliacoes contextualizadas na entrevista.

O desenho permite multiplas entrevistas por candidatura sem duplicar dados de
Candidate ou Job Opening e sem quebrar o versionamento definido pela ADR-0014.

Tambem prepara a arquitetura para futuras funcionalidades de IA, entrevistas
remotas, transcricao, calendario e propostas sem acoplar esses modulos ao
Candidate principal.

## Fora do escopo

Esta ADR nao define nem implementa:

- videoconferencia;
- gravacao de audio;
- gravacao de video;
- transcricao automatica;
- analise por IA;
- decisao automatica;
- ranking;
- score;
- propostas;
- contratacao;
- onboarding;
- integracao com calendario externo;
- envio de e-mails;
- notificacoes.

Esses temas deverao possuir decisoes ou especificacoes proprias quando forem
priorizados.
