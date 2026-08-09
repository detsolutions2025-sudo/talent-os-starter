# ADR 0023 - Jornada Inteligente do Candidato

## Status

Aceita.

Esta ADR nasceu como `Proposta`, com um conjunto de ambiguidades
explicitamente registradas. Esta revisao fecha essas ambiguidades: formaliza
que Pre-Entrevista pertence sempre a `CandidateApplication` e nunca altera o
`Candidate` com score, etapa, ranking ou decisao (consistente com SPEC-012,
RN-037); separa Pre-Entrevista, Perfil Comportamental e DISC como tres
conceitos independentes; define exatamente o que a IA pode e nao pode fazer
sobre Perfil Comportamental, exigindo o rotulo "inferencia assistida" quando
nao houver instrumento formal aplicado; reformula o Dossie Inteligente como
composicao rastreavel de fontes, nunca uma avaliacao unica; probe a criacao
de score global, ranking automatico ou linguagem deterministica de
aderencia; distingue formalmente regra objetiva de interpretacao por IA;
integra referencia a Blueprint Version (ADR-0022) e a versao da Vaga em
qualquer analise contextualizada; reforca consentimento, finalidade e
opt-out de IA; e reforca os limites de `member` e de Platform Admin
(SuperAdmin) sobre o Dossie. Nenhum conflito critico ou importante com a
ADR-0001 a ADR-0022 ou com as SPEC-011 a SPEC-014 foi encontrado nesta
revisao.

## Contexto

O Talent OS ja formalizou, em ADRs sucessivas, cada peca isolada que uma
jornada de candidato precisara usar: `Candidate` como cadastro global por
Organization (ADR-0013), `CandidateApplication` como processo seletivo
versionado que conecta Candidate e Job Opening (ADR-0014), `Interview` como
etapa operacional vinculada a candidatura (ADR-0015), e a infraestrutura
completa de IA opcional (ADR-0016), Feature Policies (ADR-0017), providers e
credenciais (ADR-0018) e AI Gateway/Provider Routing/Prompt Registry
(ADR-0019). A ADR-0020 formalizou Organization como unidade autonoma e a
ADR-0021/ADR-0022 formalizaram o Blueprint Organizacional e seu ciclo de
vida.

Nenhuma dessas ADRs, isoladamente, descreve a jornada completa de uma pessoa
candidata: do primeiro contato com uma vaga publicada ate a disponibilizacao
de um Dossie Inteligente para analise humana. O documento
`docs/01-produto/JORNADA-DO-SISTEMA.md` (secoes 7, 9, 10, 11 e 12) ja
descreve essa jornada em nivel de produto, mas um documento de jornada
funcional nao e uma decisao arquitetural e nao pode, por si so, formalizar
principios, limites de atuacao da IA ou relacionamento entre entidades.

Falta, portanto, uma decisao arquitetural propria que amarre, em uma unica
sequencia coerente, os conceitos ja decididos (Candidate, CandidateApplication,
Interview, infraestrutura de IA, Blueprint) com os conceitos de produto ainda
sem ADR (Portal Publico, Candidatura Publica, Pre-Entrevista, Perfil
Comportamental, DISC, Dossie Inteligente), sem implementar nenhum deles.

## Objetivo

Formalizar arquiteturalmente toda a jornada do candidato, desde o primeiro
contato com uma vaga ate a disponibilizacao do Dossie Inteligente para
analise humana, estabelecendo os principios arquiteturais que todas as
proximas SPECs deverao seguir.

Esta ADR nao implementa nenhuma funcionalidade. Ela nao define schema, API,
UI, migration, provider, prompt, algoritmo de IA, DISC tecnico, pesos, score
ou ranking. Ela define apenas os limites e principios que as SPECs futuras
(SPEC-019 a SPEC-024, conforme secao "Consequencias") deverao respeitar.

## Decisao Arquitetural

Fica formalizado que a jornada do candidato e uma sequencia de etapas
independentes, cada uma pertencendo a uma entidade ja decidida ou a ser
decidida por SPEC futura, nunca um fluxo monolitico novo. Nenhuma etapa
desta jornada cria uma entidade nova para dado que ja pertence a `Candidate`
(ADR-0013), `CandidateApplication` (ADR-0014) ou `Interview` (ADR-0015).

A jornada inteira e opcional em relacao a IA: toda etapa que envolve IA
(analise assistida, Dossie Inteligente) funciona plenamente quando IA esta
indisponivel, desabilitada ou falha, seguindo o principio ja estabelecido
pela ADR-0016 de que IA nunca e requisito estrutural. Nenhuma etapa
obrigatoria da jornada (candidatura, pre-entrevista estrutural, entrevista
humana, decisao final) depende de IA para funcionar.

A jornada e sempre soberanamente humana na decisao final. IA produz
informacao de apoio; ela nunca decide, aprova, reprova ou elimina um
candidato, em nenhuma etapa (secao "Papel da IA").

## Principios Fundamentais

1. Toda etapa da jornada pertence a uma Organization, seguindo o principio
   de autonomia e isolamento ja estabelecido pela ADR-0020: nenhum dado de
   candidato, candidatura, pre-entrevista, perfil comportamental ou dossie
   atravessa Organizations, em nenhuma circunstancia.
2. IA e sempre opcional em toda a jornada, nunca uma dependencia estrutural
   (ADR-0016). A ausencia ou falha de IA nunca bloqueia a candidatura, a
   pre-entrevista, a entrevista humana ou a decisao final.
3. IA nunca decide. IA produz apenas informacao de apoio, sempre revisavel e
   descartavel por RH (secao "Papel da IA").
4. Toda analise, resposta ou avaliacao pertence a `CandidateApplication` ou a
   entidade filha diretamente vinculada a ela (Interview, Pre-Entrevista
   futura). Nunca pertence ao `Candidate` principal (ADR-0013, ADR-0014,
   ADR-0015, SPEC-012 RN-037).
5. Nenhuma etapa desta jornada redefine regra ja estabelecida pelas ADR-0013
   a ADR-0022. Onde esta ADR referencia infraestrutura de IA, ela referencia
   sem redefinir (secao "Relacionamento com Infraestrutura de IA").
6. O Blueprint Organizacional (ADR-0021, ADR-0022) contextualiza a jornada,
   mas nunca decide automaticamente por ela (secao "Relacionamento com o
   Blueprint Organizacional").
7. Toda etapa que envolve dado pessoal do candidato respeita consentimento,
   minimizacao e auditoria, seguindo o padrao ja estabelecido pela ADR-0013 e
   pela SPEC-011 (secoes "Privacidade", "Consentimento" e "Auditoria").
8. A entrevista humana continua obrigatoria quando o processo seletivo da
   Organization exigir. Nenhuma etapa assistida por IA substitui ou torna
   dispensavel a entrevista humana por decisao automatica.
9. Toda contratacao continua sendo uma decisao humana, exercida por RH
   (ADR-0020, secao "Responsabilidades"; SPEC-012, RN-020: somente Owner
   marca `hired`).
10. Toda analise assistida relevante desta jornada deve ser rastreavel as
    fontes que a originaram; nenhuma conclusao e apresentada sem origem
    identificavel (secao "Evidencias e Rastreabilidade").
11. Esta ADR nunca cria score global de candidato, ranking automatico ou
    nota final universal; qualquer metrica futura precisa de finalidade
    especifica, metodologia definida, e nunca substitui decisao humana
    (secao "Scores").

## Jornada Completa

A jornada e descrita, nesta ADR, exatamente na seguinte ordem:

1. Empresa publica uma vaga.
2. Sistema gera Portal Publico.
3. Candidato acessa.
4. Candidato realiza cadastro.
5. E criada `CandidateApplication`.
6. Sistema inicia Pre-Entrevista.
7. Perguntas podem vir do Blueprint.
8. Perguntas podem ser adaptadas futuramente por IA.
9. Perfil Comportamental e produzido.
10. DISC e produzido.
11. IA pode analisar todo o material.
12. IA produz Dossie Inteligente.
13. Nenhuma decisao automatica.
14. Recrutador recebe o Dossie.
15. Recrutador decide.
16. Fluxo normal continua.

Cada etapa e detalhada nas subsecoes seguintes.

### Portal Publico

A jornada comeca quando uma Organization publica uma Vaga (`Job Opening`,
ADR-0012) e o sistema disponibiliza um Portal Publico proprio da
Organization, pelo qual a Vaga publicada e divulgavel (SPEC-010, secao
"Divulgacao Publica"; `JORNADA-DO-SISTEMA.md`, secao 10). O candidato acessa
o Portal Publico sem autenticacao previa, exatamente como ja preve a
divulgacao publica por slug da SPEC-010, sem exposicao de IDs internos
(SPEC-010, RN-051).

Esta ADR nao define a pagina publica renderizada, os canais de divulgacao ou
a mecanica tecnica do Portal Publico. Isso fica para SPEC futura (secao
"Fora do Escopo").

### Candidatura Publica

O candidato realiza seu cadastro a partir do Portal Publico. Esse cadastro
cria, ou reutiliza, um `Candidate` da Organization (ADR-0013): o mesmo
e-mail normalizado nunca duplica o cadastro principal dentro da mesma
Organization.

A partir do cadastro e da intencao de participar de uma Vaga especifica, e
criada uma `CandidateApplication` (ADR-0014), vinculando exatamente o
`Candidate`, a `Job Opening` e a versao publicada da Vaga vigente no momento
da candidatura. Nenhum dado da candidatura publica e copiado para o
`Candidate` principal alem do que a ADR-0013 ja autoriza como cadastro
principal.

Esta ADR nao define o formulario publico, a validacao de payload ou a
mecanica de autenticacao/verificacao do candidato. Isso fica para SPEC
futura.

### Pre-Entrevista

Apos a criacao da `CandidateApplication`, o sistema pode iniciar uma
Pre-Entrevista. Fica formalizado:

- toda Pre-Entrevista pertence obrigatoriamente a uma `CandidateApplication`,
  nunca diretamente ao `Candidate` principal (mesmo principio ja aplicado a
  `Interview` pela ADR-0015 e a analise por IA pela ADR-0014);
- a Pre-Entrevista nunca altera o `Candidate` principal com score, etapa,
  ranking ou decisao — essas informacoes, quando existirem, pertencem
  exclusivamente ao contexto da candidatura, consistente com a SPEC-012,
  RN-037: "Candidate nao recebe etapa, score, ranking, recomendacao ou
  decisao";
- cada `CandidateApplication` pode possuir seu proprio contexto de
  Pre-Entrevista, independente de outras candidaturas do mesmo `Candidate`
  em outras Vagas;
- respostas e resultados historicos da Pre-Entrevista pertencem ao contexto
  daquela candidatura especifica, seguindo o mesmo principio de preservacao
  historica ja estabelecido pela ADR-0014.

A Pre-Entrevista ocorre conceitualmente antes das entrevistas humanas (secao
"Entrevista Humana").

Esta ADR nao altera o enum atual de `current_stage` definido pela ADR-0014
(`applied`, `screening`, `interview`, `assessment`, `offer`, `completed`).
Uma SPEC futura decidira se a Pre-Entrevista sera representada como uma
etapa canonica nova do pipeline, ou como um subfluxo anterior a `screening`
ou dentro dela. Esta ADR nao antecipa essa decisao.

**A Pre-Entrevista Estruturada existe independentemente de IA.** Quando IA
estiver desabilitada, indisponivel ou falhar:

- o candidato continua respondendo normalmente;
- as respostas ficam disponiveis ao RH;
- regras objetivas permitidas continuam funcionando, quando configuradas
  (secao "Filtros Objetivos versus IA");
- um relatorio estrutural pode ser produzido sem nenhuma analise generativa;
- o Recrutador continua conduzindo a triagem manualmente.

IA apenas adiciona analise assistida sobre a Pre-Entrevista; ela nunca e
requisito para completa-la, consistente com o principio ja estabelecido pela
ADR-0016 de que IA nunca e requisito estrutural.

Futuramente, a selecao ou adaptacao das perguntas de Pre-Entrevista podera
ser assistida por IA, quando a Feature especifica estiver habilitada
(ADR-0016 a ADR-0019). Essa adaptacao e sempre uma sugestao sobre um
conjunto de perguntas legitimo do Blueprint da Organization (Banco de
Perguntas proprio ou adotado, SPEC-009; ADR-0021, secao "Composicao"); ela
nunca introduz pergunta fora do escopo autorizado pela Organization.

Esta ADR nao define a mecanica tecnica da Pre-Entrevista (schema, fluxo de
perguntas, tempo limite, formato de resposta, representacao no pipeline).
Isso fica para SPEC futura.

### Perfil Comportamental

A partir das respostas coletadas na Pre-Entrevista, ou de instrumento
proprio futuro, o sistema pode produzir um Perfil Comportamental do
candidato. Fica formalizado:

- Perfil Comportamental e um conceito independente da Pre-Entrevista: nem
  toda Pre-Entrevista gera automaticamente um Perfil Comportamental;
  produzi-lo depende de metodologia e instrumento proprios, definidos por
  SPEC futura;
- o Perfil Comportamental e informacao de apoio, vinculada a
  `CandidateApplication`, nunca ao `Candidate` principal, seguindo o mesmo
  principio de separacao ja estabelecido pela ADR-0013, ADR-0014 e
  ADR-0015.

Esta ADR nao define a metodologia, o instrumento, o algoritmo ou o schema do
Perfil Comportamental. Isso fica para SPEC futura (secao "Fora do Escopo").

### DISC

DISC e citado nesta ADR apenas como um possivel instrumento de Perfil
Comportamental ja conhecido no mercado de recrutamento e selecao. Fica
formalizado:

- esta ADR nao define, adota ou implementa nenhuma metodologia DISC
  especifica, nenhum algoritmo de calculo, nenhuma licenca de terceiro e
  nenhum schema tecnico;
- quando utilizado, DISC deve ser tratado como um instrumento e uma
  metodologia formal e especifica, nunca como um rotulo generico aplicado a
  qualquer resultado comportamental;
- a IA nunca pode simplesmente inferir um resultado DISC formal a partir de
  respostas livres ou nao estruturadas para esse instrumento (secao "IA e
  Perfil Comportamental").

Uma SPEC futura propria devera definir, no minimo:

- instrumento;
- metodologia;
- licenciamento, quando aplicavel;
- forma de aplicacao;
- calculo;
- interpretacao;
- limitacoes;
- apresentacao dos resultados.

Quando produzido por instrumento formal valido, o resultado DISC segue
exatamente as mesmas regras do Perfil Comportamental: pertence a
`CandidateApplication`, e informacao de apoio, e nunca decide nada
automaticamente.

### IA e Perfil Comportamental

A IA pode futuramente, sobre Perfil Comportamental e DISC:

- resumir resultados ja produzidos por instrumento formal;
- correlacionar evidencias entre diferentes fontes da candidatura;
- contextualizar resultados frente a Vaga e ao Blueprint Organizacional;
- sugerir perguntas para validacao humana.

A IA nao pode, em nenhuma circunstancia:

- fabricar resultado de instrumento nao aplicado;
- apresentar inferencia como diagnostico;
- substituir metodologia formal de Perfil Comportamental ou DISC;
- declarar condicao psicologica;
- decidir contratacao.

Se existir inferencia comportamental produzida exclusivamente pela IA, sem
instrumento formal aplicado, ela deve ser identificada explicitamente como
**inferencia assistida**, ou conceito equivalente, e nunca apresentada como
resultado de DISC ou de teste formal. Essa distincao e obrigatoria em
qualquer apresentacao ao Recrutador (secao "Evidencias e Rastreabilidade").

### Analise Assistida por IA

Quando a Organization tiver IA habilitada para a Feature correspondente,
respeitando as quatro condicoes ja definidas pelas ADR-0016 e ADR-0017
(`platform_ai_allowed`, `organization_ai_enabled`,
`feature_available_on_platform`, `organization_feature_enabled`), a IA pode
analisar o material ja disponivel na candidatura: respostas da
Pre-Entrevista, Perfil Comportamental, DISC quando existir, competencias
declaradas ou observadas, e contexto do Blueprint Organizacional relevante
(ADR-0021, secao "Relacionamento com IA").

Essa analise ocorre exclusivamente atraves do `AIGateway` (ADR-0019), nunca
por chamada direta de um modulo de negocio a um provider. Toda a ordem de
autorizacao, resolucao de credencial, prompt versionado, validacao de
resposta estruturada e auditoria ja definida pela ADR-0019 se aplica
integralmente, sem excecao e sem redefinicao por esta ADR.

A distincao entre regra objetiva pre-configurada e interpretacao de IA segue
a secao "Filtros Objetivos versus IA".

Quando a IA nao estiver disponivel ou a chamada falhar, o fluxo humano da
candidatura continua normalmente, seguindo o principio de fail-safe ja
estabelecido pela ADR-0019, secao "Fail-safe": a candidatura segue seu
processo, e o RH avalia manualmente.

### Dossie Inteligente

O Dossie Inteligente e uma **composicao rastreavel de fontes ja
existentes**, nunca uma avaliacao unica, um veredito ou uma nota
consolidada. Ele reune informacao ja existente e espalhada por diferentes
entidades ligadas a `CandidateApplication` — nunca um novo dado armazenado
dentro do `Candidate` principal (ADR-0013), e nunca uma fonte de verdade
adicional que substitua as entidades originais.

O Dossie Inteligente pode reunir, quando existentes, autorizados e
disponiveis:

- dados permitidos do `Candidate`;
- dados da `CandidateApplication`;
- requisitos da Vaga (versao publicada usada pela candidatura);
- versao do Blueprint Organizacional usada (secao "Relacionamento com o
  Blueprint Organizacional");
- respostas da Pre-Entrevista;
- Perfil Comportamental, quando existir;
- resultado DISC, quando existir;
- entrevistas humanas (`Interview`, ADR-0015);
- avaliacoes humanas de entrevistadores;
- analises assistidas por IA.

Cada conclusao do Dossie deve preservar sua origem. O Dossie nunca mistura,
sem distincao explicita:

- fato declarado pelo candidato;
- resposta;
- avaliacao humana;
- resultado de instrumento formal;
- inferencia de IA.

Essa separacao segue o principio de rastreabilidade da secao "Evidencias e
Rastreabilidade" e o principio de linguagem nao deterministica da secao
"Aderencia".

O Dossie Inteligente deve conter apenas:

- resumo do candidato;
- resumo da pre-entrevista;
- perfil comportamental, quando existir;
- DISC, quando existir;
- competencias percebidas;
- pontos fortes;
- pontos de atencao;
- possiveis riscos;
- evidencias de aderencia ao cargo (nunca veredito de aderencia — secao
  "Aderencia");
- evidencias de aderencia ao Blueprint (nunca veredito de aderencia — secao
  "Aderencia");
- possiveis perguntas sugeridas para entrevista humana.

Tudo no Dossie Inteligente e sempre identificado explicitamente como
sugestao, com origem rastreavel. Nenhum campo do Dossie Inteligente e
apresentado como fato, decisao, aprovacao, reprovacao, score, ranking ou
recomendacao vinculante (secao "Scores") — esses conceitos permanecem fora
do escopo do processo seletivo, consistente com a SPEC-012, secao "Fora do
Escopo", e com `JORNADA-DO-SISTEMA.md`, secao 12.

Quando o Blueprint Organizacional (ADR-0021, ADR-0022) sustentar a analise
do Dossie, o Dossie deve poder referenciar conceitualmente:

- a Blueprint Version utilizada (ADR-0022, secao "Versao do Blueprint");
- a versao da Vaga relevante (`job_opening_version_id`, ADR-0012, ADR-0014);
- as fontes utilizadas na analise (secao "Evidencias e Rastreabilidade").

Alteracao futura do Blueprint nunca reinterpreta uma analise ja produzida.
Reanalise com um Blueprint novo, ou com uma versao de Vaga nova, e sempre
uma nova operacao explicita e auditada, nunca uma substituicao silenciosa da
analise original — mesmo principio ja exigido pela ADR-0022, secao "Nao
retroatividade", e pela ADR-0019, secao "Modelo utilizado".

O Dossie tambem deve respeitar DTOs e permissoes por perfil de acesso (secao
"Member"; secao "Platform Admin (SuperAdmin)"); nenhum papel recebe
automaticamente o Dossie completo apenas por sua existencia.

Esta ADR nao define o schema, o layout, o formato de exportacao ou o
algoritmo de geracao do Dossie Inteligente. Isso fica para SPEC futura.

### Entrevista Humana

O Dossie Inteligente, quando existir, e insumo de apoio para a preparacao da
Entrevista Humana; ele nunca a substitui. A Entrevista Humana continua
regida integralmente pela ADR-0015: pertence a `CandidateApplication`,
possui participantes com papel proprio (`lead`, `interviewer`, `observer`),
preserva snapshot de perguntas, e suas respostas e avaliacoes pertencem
exclusivamente a entrevista, nunca ao `Candidate` principal.

Esta ADR nao altera nenhuma regra ja definida pela ADR-0015. Quando o
processo seletivo da Organization exigir entrevista, ela continua
obrigatoria, independente de qualquer analise de IA ja realizada.

### Decisao Final

A decisao final sobre a candidatura segue sempre a mesma cadeia conceitual:

`Dados` -> `Evidencias` -> `Instrumentos` -> `Analises assistidas` ->
`Dossie` -> `Revisao humana` -> `Decisao humana`

A decisao nunca e output do `AIGateway` (ADR-0019). O sistema nunca
armazena uma decisao de contratacao como resultado de uma execucao de IA;
toda decisao registrada em `CandidateApplication` e um ato humano, atribuido
a um usuario autorizado, nunca a uma `AI Execution` (ADR-0019, secao "AI
Execution").

A decisao final sobre a candidatura continua sendo exclusivamente humana,
exercida por RH dentro do que sua role autoriza (ADR-0020, secao
"Responsabilidades"; SPEC-012, RN-020: somente Owner marca `hired`). Nenhuma
etapa assistida por IA desta jornada, incluindo Pre-Entrevista, Perfil
Comportamental, DISC, Analise Assistida por IA ou Dossie Inteligente, produz
decisao automatica.

Fica explicitamente definido:

- o Recrutador (RH, conforme ADR-0020) continua soberano sobre toda decisao
  da candidatura;
- a Entrevista Humana continua obrigatoria quando o processo seletivo da
  Organization exigir;
- toda contratacao continua sendo uma decisao humana, nunca automatica;
- `hired` em `CandidateApplication` continua sendo uma acao humana
  autorizada, exatamente como ja definido pela SPEC-012 (RN-020: somente
  Owner registra `hired`; RN-021: `hired` nao cria contratacao, colaborador
  ou onboarding);
- esta ADR nao cria contratacao automatica;
- esta ADR nao cria colaborador;
- esta ADR nao cria onboarding.

Apos a decisao, o fluxo normal da candidatura continua, seguindo os estados
e etapas ja definidos pela ADR-0014 (`application_status`, `current_stage`),
sem nenhuma alteracao introduzida por esta ADR.

## Papel da IA

A IA participa da jornada exclusivamente como apoio informativo. Fica
explicitamente definido:

- IA nunca elimina candidatos;
- IA nunca aprova candidatos;
- IA nunca reprova candidatos;
- IA nunca altera `Candidate`;
- IA nunca altera `CandidateApplication`;
- IA nunca altera `Interview`;
- IA nunca altera avaliacoes humanas;
- IA nunca cria score global de candidato (secao "Scores");
- IA nunca declara condicao psicologica ou resultado de instrumento formal
  nao aplicado (secao "IA e Perfil Comportamental");
- IA apenas produz informacao.

Esses limites sao uma aplicacao direta, para o contexto desta jornada, dos
principios ja estabelecidos pela ADR-0016 (IA nunca substitui decisao
humana), pela ADR-0015 (avaliacoes de entrevistadores nunca sao alteradas
por analise de IA) e pela ADR-0014 (avaliacao por IA futura pertence a
`CandidateApplication` ou entidade filha, nunca ao `Candidate` principal).

## Papel do Recrutador

O Recrutador — a pessoa que exerce RH dentro da Organization, conforme
Roles, Memberships e papeis operacionais aplicaveis (ADR-0020, secao
"Responsabilidades") — permanece soberano em toda a jornada:

- recebe o Dossie Inteligente, quando existir, como insumo de apoio, nunca
  como instrucao, sempre com origem rastreavel de cada conclusao (secao
  "Evidencias e Rastreabilidade");
- decide se, quando e como conduzir a Entrevista Humana;
- decide o resultado da candidatura, dentro do que sua role autoriza
  (SPEC-012);
- pode ignorar integralmente qualquer sugestao de IA, sem necessidade de
  justificativa tecnica perante o sistema;
- e sempre o responsavel final perante a Organization pela decisao de
  contratacao.

## Evidencias e Rastreabilidade

Toda analise assistida relevante desta jornada deve ser rastreavel as
fontes que a originaram. Nenhuma conclusao apresentada ao Recrutador pode
ficar sem origem identificavel.

O Dossie Inteligente, e qualquer relatorio equivalente produzido por esta
jornada, deve distinguir conceitualmente:

- `dado declarado` — informacao fornecida diretamente pelo candidato;
- `evidencia observada` — informacao registrada por um humano durante
  entrevista ou avaliacao;
- `resultado de instrumento` — saida de um instrumento formal aplicado (por
  exemplo, DISC, quando existir, conforme metodologia propria — secao
  "DISC");
- `avaliacao humana` — julgamento registrado por um entrevistador
  (ADR-0015);
- `inferencia de IA` — conclusao produzida por analise assistida, sem
  instrumento formal aplicado (secao "IA e Perfil Comportamental").

Esses cinco tipos de origem nunca sao apresentados de forma indistinta. Uma
conclusao sem origem identificavel nao deve ser exibida como informacao
valida do Dossie.

## Aderencia

Esta jornada evita linguagem deterministica ao descrever a relacao entre um
candidato e uma Vaga ou o Blueprint Organizacional. Ficam evitados termos
como:

- "compativel";
- "incompativel";
- "candidato ideal";
- "nao serve";
- "aprovar";
- "reprovar".

Em vez disso, esta jornada usa conceitos como:

- evidencias de aderencia;
- evidencias nao encontradas;
- pontos para validacao;
- aderencia potencial;
- inconsistencias;
- pontos de atencao.

Nenhum indicador isolado, de nenhuma fonte (instrumento, IA ou avaliacao
humana), constitui decisao automatica. Todo indicador de aderencia e sempre
uma evidencia de apoio, nunca um veredito (secao "Papel da IA"; secao
"Decisao Final").

## Scores

Esta ADR nao cria score global de candidato.

Fica explicitamente vedado nesta fase:

- ranking automatico;
- nota final universal;
- percentual definitivo de "fit";
- classificacao automatica de aprovacao ou reprovacao.

Este limite e consistente com a SPEC-012, secao "Fora do Escopo" (ranking,
matching e score ja estao fora do escopo do processo seletivo atual, e
RN-037 ja determina que `Candidate` nao recebe etapa, score, ranking,
recomendacao ou decisao), e com `JORNADA-DO-SISTEMA.md`, secao 12.

Futuras metricas, se algum dia existirem, precisam:

- ter finalidade especifica;
- possuir metodologia definida;
- ser explicaveis;
- ser contextualizadas;
- nunca substituir decisao humana.

A introducao de qualquer metrica futura desse tipo exige ADR e SPEC propria
que revisem explicitamente este limite — o mesmo padrao ja usado pela
SPEC-012 para ranking, matching e score.

## Filtros Objetivos versus IA

Esta ADR formaliza a separacao conceitual entre regra objetiva e
interpretacao por IA:

### Regra objetiva

Exemplos futuros:

- requisito obrigatorio nao atendido;
- disponibilidade incompativel;
- autorizacao legal necessaria ausente.

Uma regra objetiva pode produzir sinalizacao deterministica somente quando
previamente configurada pela Organization e permitida pela SPEC futura
correspondente. Ela nunca depende de interpretacao de IA.

### IA

A IA interpreta evidencias; ela nunca transforma uma interpretacao
subjetiva em regra eliminatoria automatica.

Uma SPEC futura devera definir qualquer mecanismo de elegibilidade
objetiva, incluindo quais requisitos podem gerar sinalizacao deterministica
e como essa sinalizacao e apresentada ao Recrutador, sempre como informacao
de apoio, nunca como eliminacao automatica de candidato (secao "Papel da
IA").

## Relacionamento com o Blueprint Organizacional

O Blueprint Organizacional (ADR-0021, ADR-0022) influencia esta jornada em
varios pontos:

- missao;
- visao;
- valores;
- competencias;
- cargo;
- perguntas;
- perfil esperado;
- cultura.

O Blueprint fornece o contexto organizacional que a Pre-Entrevista, a
Analise Assistida por IA e o Dossie Inteligente podem usar, seguindo
exatamente o principio ja definido pela ADR-0021, secao "Relacionamento com
IA": "a fonte de qualquer conhecimento organizacional usado por IA e sempre
o Blueprint — nunca uma fonte externa, generica ou de outra Organization."

O Blueprint nunca gera decisao automatica sobre um candidato. Ele
contextualiza; a decisao permanece sempre com o Recrutador (ADR-0021, secao
"Relacionamento com o Processo Seletivo": "o Blueprint nunca altera
automaticamente decisoes humanas").

Toda Pre-Analise ou Dossie que utilizar contexto organizacional deve
preservar conceitualmente:

- referencia a Blueprint Version utilizada (ADR-0022, secao "Versao do
  Blueprint");
- referencia a versao da Vaga relevante (`job_opening_version_id`);
- referencias as fontes utilizadas na analise (secao "Evidencias e
  Rastreabilidade").

Alteracao futura do Blueprint nunca reinterpreta uma analise ja produzida
com uma versao anterior. Reanalise com uma Blueprint Version nova e sempre
uma nova operacao explicita e auditada, nunca uma substituicao silenciosa da
analise original — mesmo principio ja exigido pela ADR-0022, secao "Nao
retroatividade".

Esta ADR nao redefine nenhuma regra ja estabelecida pela ADR-0021 ou pela
ADR-0022 sobre o Blueprint, seu ciclo de vida ou seu versionamento.

## Relacionamento com CandidateApplication

Toda analise, resposta, perfil comportamental, resultado DISC e Dossie
Inteligente produzidos ao longo desta jornada pertencem a
`CandidateApplication`. Nunca pertencem ao `Candidate` principal.

Isso vale explicitamente para a Pre-Entrevista (secao "Pre-Entrevista"): ela
pertence obrigatoriamente a `CandidateApplication` e nunca altera o
`Candidate` principal com score, etapa, ranking ou decisao, consistente com
a SPEC-012, RN-037.

Esse principio nao e novo: e a aplicacao direta, para os conceitos ainda sem
SPEC desta jornada (Pre-Entrevista, Perfil Comportamental, DISC, Dossie
Inteligente), do que a ADR-0013 e a ADR-0014 ja determinam para toda
avaliacao, analise ou resultado de IA associado a uma candidatura.

## Relacionamento com Entrevistas

Pre-Entrevista, Entrevista Humana e Avaliacoes Humanas sao etapas
independentes entre si, cada uma com seu proprio ciclo de vida dentro da
mesma `CandidateApplication`:

- a Pre-Entrevista nao e uma Entrevista (`Interview`, ADR-0015): e uma etapa
  anterior, tipicamente sem participante humano em tempo real;
- a Entrevista Humana continua regida integralmente pela ADR-0015, sem
  nenhuma alteracao introduzida por esta ADR;
- Avaliacoes Humanas de entrevistadores pertencem exclusivamente a entrevista
  em que foram registradas (ADR-0015), e nunca sao substituidas, alteradas ou
  reinterpretadas por resultado de Pre-Entrevista, Perfil Comportamental,
  DISC, Analise Assistida por IA ou Dossie Inteligente.

## Relacionamento com Infraestrutura de IA

Toda execucao de IA usada nesta jornada — adaptacao de perguntas de
Pre-Entrevista, Analise Assistida por IA, geracao do Dossie Inteligente — e
uma Feature que passa integralmente pela infraestrutura ja definida:

- ADR-0016: IA opcional por Organization;
- ADR-0017: politicas de funcionalidades de IA;
- ADR-0018: providers, credenciais e secret management de IA;
- ADR-0019: AI Gateway, Provider Routing, Prompt Registry e telemetria.

Nao basta a Organization "usar IA" de forma generica. Para que qualquer
Feature desta jornada execute, a Feature especifica precisa estar,
simultaneamente:

- disponivel na plataforma (`feature_available_on_platform`, ADR-0017);
- habilitada na Organization (`organization_feature_enabled`, ADR-0017);
- com routing, provider, modelo e prompt validos e configurados (ADR-0018,
  ADR-0019).

Esta ADR nao redefine nenhuma regra dessas quatro ADRs. Ela apenas declara
que a jornada do candidato e um conjunto de Features consumidoras dessa
infraestrutura, nunca um caminho alternativo de execucao de IA.

## Privacidade

Toda a jornada trata dado pessoal do candidato com o mesmo rigor ja exigido
pela ADR-0013 e pela SPEC-011:

- a jornada segue os principios de protecao de dados pessoais aplicaveis
  (LGPD), incluindo minimizacao, finalidade e retencao;
- nenhum dado do candidato e enviado para IA, interna ou externa, sem
  autorizacao — seguindo a mesma regra de consentimento e a mesma regra de
  disponibilidade de IA ja definidas pela ADR-0013, ADR-0016 e SPEC-011;
- nenhuma etapa desta jornada cria um novo repositorio de dado pessoal fora
  das entidades ja definidas (`Candidate`, `CandidateApplication`,
  `Interview`, e as entidades futuras de Pre-Entrevista, Perfil
  Comportamental e Dossie Inteligente, quando especificadas).

Cada Feature de IA usada nesta jornada recebe somente os dados necessarios a
sua finalidade especifica (ADR-0019, secao "Prompt e dados sensiveis").
Nenhuma Feature envia automaticamente ao provider:

- o `Candidate` completo;
- o historico completo da candidatura;
- notas internas completas;
- contatos do candidato;
- dados nao necessarios aquela Feature especifica;
- conteudo de outra candidatura do mesmo candidato.

O Dossie Inteligente tambem respeita DTOs e permissoes por perfil de acesso,
nunca expondo mais dado do que o papel do usuario que o consulta autoriza
(secao "Member"; secao "Platform Admin (SuperAdmin)").

## Consentimento

O consentimento do candidato segue o modelo estrutural ja definido pela
SPEC-011: registro de consentimento com estados canonicos (por exemplo,
`granted`, `pending`, `revoked`, `expired`), bloqueio de novo uso operacional
quando o consentimento nao estiver `granted`, e auditoria de toda mudanca de
consentimento (SPEC-011, RN-038).

O consentimento cobre finalidade especifica, nunca uma autorizacao generica
que se estenda automaticamente a toda analise futura. Fica formalizado:

- o consentimento operacional do `Candidate` (SPEC-011) e a base minima
  exigida para qualquer processamento;
- alem dele, futuras operacoes de Pre-Entrevista, Perfil Comportamental,
  DISC e analise assistida por IA devem observar finalidade, transparencia e
  consentimento aplicaveis a cada uma, antes do processamento
  correspondente;
- uma autorizacao generica de consentimento nao cobre automaticamente toda
  analise futura; SPEC futura devera definir os registros e textos exatos de
  consentimento para cada nova operacao desta jornada.

Aplicado a esta jornada:

- a Candidatura Publica exige o mesmo registro estruturado de consentimento
  ja exigido pela SPEC-011 no cadastro do candidato;
- a Pre-Entrevista, a Analise Assistida por IA e a geracao do Dossie
  Inteligente respeitam opt-in e opt-out de uso de IA, consistente com a
  natureza opcional de IA ja definida pela ADR-0016;
- se o consentimento operacional do candidato se tornar `pending`, `revoked`
  ou `expired` apos a criacao da `CandidateApplication`, aplica-se a mesma
  regra ja definida pela ADR-0014: a candidatura e seu historico permanecem
  preservados, mas novas acoes operacionais, incluindo novas execucoes de
  IA sobre aquele candidato, ficam bloqueadas;
- nenhum dado do candidato e enviado para IA sem autorizacao explicita e
  valida no momento do envio.

### Opt-out de IA

Quando a Organization utiliza IA, a futura experiencia da jornada devera
respeitar as politicas aplicaveis de transparencia e consentimento em cada
etapa assistida.

Quando uma execucao de IA nao for permitida — por falta de consentimento,
por Feature desabilitada, ou por indisponibilidade tecnica:

- a Pre-Entrevista nao e perdida;
- as respostas continuam preservadas conforme a politica de retencao
  aplicavel;
- o RH continua podendo analisar manualmente;
- o processo humano continua normalmente.

Esta jornada nunca torna uma candidatura impossivel apenas porque a IA esta
indisponivel, consistente com o principio de fail-safe ja estabelecido pela
ADR-0016 e pela ADR-0019, secao "Fail-safe".

Esta ADR nao define o schema ou a interface de captura de consentimento para
os conceitos ainda sem SPEC desta jornada (Pre-Entrevista, Perfil
Comportamental, Dossie Inteligente). Isso fica para SPEC futura.

## Auditoria

Toda execucao de IA usada nesta jornada continua obedecendo integralmente as
ADR-0016 a ADR-0019, incluindo os eventos ja exigidos por elas: execucao
solicitada, execucao negada por politica, routing selecionado, execucao
concluida, execucao falhou, fallback utilizado, rate limit atingido,
tentativa sem permissao, resolucao de credencial negada (ADR-0019, secao
"Auditoria").

Alem disso, cada etapa nova desta jornada (Candidatura Publica,
Pre-Entrevista, geracao de Perfil Comportamental, geracao de Dossie
Inteligente) deve gerar auditoria propria quando especificada por SPEC
futura, seguindo o mesmo padrao ja estabelecido pela ADR-0013, ADR-0014 e
ADR-0015: auditoria nunca armazena dado pessoal completo, resposta completa,
conteudo integral de pergunta, segredo, token ou header.

## Seguranca

Esta ADR nao define nenhum mecanismo tecnico de seguranca novo. Ela reforca
que nenhum dos seguintes elementos e definido, redefinido ou exposto por
esta decisao:

- nenhuma credencial;
- nenhum prompt;
- nenhum segredo;
- nenhum provider;
- nenhuma chave;
- nenhum log sensivel.

Toda a seguranca de credenciais, prompts, providers, chaves e logs
relacionados a execucao de IA continua regida integralmente pela ADR-0018 e
pela ADR-0019, sem excecao e sem alteracao por esta ADR.

## Multiempresa

Toda a jornada respeita integralmente o isolamento multiempresa ja
formalizado pela ADR-0020: dados de candidato, candidatura, pre-entrevista,
perfil comportamental, DISC e Dossie Inteligente de uma Organization nunca
sao lidos, gravados, referenciados ou afetados por outra Organization, em
nenhuma circunstancia, inclusive quando a credencial de IA subjacente e
`platform_managed` (ADR-0018, secao "Platform Managed"; ADR-0020, secao
"Isolamento Multiempresa").

O Blueprint Organizacional usado para contextualizar qualquer etapa desta
jornada e sempre o Blueprint da propria Organization do candidato, nunca de
outra (ADR-0021, secao "Relacionamento com IA").

## Member

A existencia de Dossie Inteligente, Perfil Comportamental ou Pre-Analise
assistida nao amplia automaticamente as permissoes de `member`.

Fica formalizado:

- esta ADR nao amplia, por si so, nenhuma permissao ja definida para
  `member` nas SPECs existentes (SPEC-004, SPEC-011, SPEC-012, SPEC-013);
- a existencia dessas novas fontes de informacao nao implica que `member`
  possa visualiza-las integralmente;
- SPECs futuras devem definir um DTO positivo (o que e exposto, nunca por
  omissao) e autorizacao por funcao ou papel operacional para cada nova
  fonte de informacao desta jornada, seguindo o mesmo padrao ja usado pela
  SPEC-011 (visibilidade por role) e pela ADR-0015 (papel na entrevista).

## Platform Admin (SuperAdmin)

Fica reforcado, para o contexto desta jornada, o papel ja definido pela
ADR-0003, SPEC-004 e ADR-0020:

- Platform Admin (SuperAdmin) administra a plataforma; ele nunca realiza
  triagem funcional de candidato;
- Platform Admin (SuperAdmin) nao consulta o Dossie Inteligente completo
  como parte do processo de recrutamento de nenhuma Organization;
- Platform Admin (SuperAdmin) nao aprova nem reprova candidato, em nenhuma
  circunstancia;
- qualquer leitura administrativa excepcional sobre dados desta jornada
  segue as mesmas regras de auditoria e minimizacao ja exigidas pela
  ADR-0013 a ADR-0015 e pela ADR-0020, secao "Seguranca": exige motivo, e
  auditada, e nunca substitui a autoridade de RH sobre a decisao.

## Consequencias

Esta ADR passa a servir de base arquitetural para as proximas SPECs que
detalharao cada etapa da jornada, conforme a numeracao proposta em
`docs/01-produto/BACKLOG.md`:

- SPEC-019 - Portal Publico de Vagas;
- SPEC-020 - Candidatura Publica;
- SPEC-021 - Pre-Entrevista Estruturada;
- SPEC-022 - Perfil Comportamental;
- SPEC-023 - Pre-Analise Assistida por IA;
- SPEC-024 - Dossie Inteligente do Candidato.

Cada uma dessas SPECs futuras deve respeitar integralmente os principios
desta ADR: IA nunca decide, toda analise pertence a `CandidateApplication`,
o Blueprint contextualiza sem decidir, a Entrevista Humana permanece
obrigatoria quando exigida, e a decisao final permanece sempre humana.

Nenhuma SPEC futura decorrente desta ADR pode tornar IA um requisito
estrutural de nenhuma etapa da jornada, consistente com a ADR-0016.

Esta revisao nao cria nenhuma SPEC; apenas fecha ambiguidades arquiteturais
que essas SPECs futuras deverao respeitar.

## Fora do Escopo

Esta ADR nao define:

- schema;
- API;
- UI;
- migration;
- provider;
- prompt;
- modelo de IA;
- instrumento DISC (metodologia, calculo, interpretacao, licenciamento);
- metodologia do Perfil Comportamental;
- calculo de metricas;
- algoritmos;
- pesos;
- score;
- ranking;
- regras objetivas concretas de elegibilidade;
- pipeline fisico da Pre-Entrevista;
- conteudo dos formularios de consentimento;
- implementacao.

Esses temas pertencem as SPECs futuras listadas na secao "Consequencias".
