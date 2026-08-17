# ADR 0024 - Identidade e Vinculo Pos-Contratacao

## Status

Aceita.

## Contexto

As fases anteriores consolidaram entidades distintas para acesso, recrutamento,
propostas e onboarding:

- `User` representa uma conta autenticavel.
- `Membership` representa autorizacao de uma conta em uma `Organization`.
- `Candidate` representa uma pessoa no contexto de recrutamento de uma
  `Organization`.
- `CandidateApplication` representa uma candidatura para uma vaga/versionamento
  especificos.
- `Proposal` e `ProposalVersion` representam ofertas formais emitidas no
  processo seletivo.
- `Onboarding` representa um checklist interno pos-aceite ainda ancorado em
  `Candidate` e `CandidateApplication`.

Nenhuma dessas entidades representa, de forma correta e estavel, a pessoa
contratada no dominio pos-contratacao nem o vinculo historico de trabalho,
prestacao ou colaboracao com a organizacao.

`Membership` nao pode ser usado para esse papel porque e uma entidade de acesso
e autorizacao. Uma pessoa pode trabalhar para a empresa sem ter conta no sistema,
e uma conta pode ter permissao administrativa sem corresponder a um colaborador
contratado.

`Candidate` tambem nao pode ser promovido para colaborador. Ele pertence ao
dominio de recrutamento, pode ter multiplas candidaturas, pode existir sem
contratacao e carrega informacoes e consentimentos proprios daquele contexto.

`CandidateApplication` registra uma jornada seletiva especifica. Mesmo quando
atinge `hired`, esse status representa uma decisao humana positiva no processo
seletivo, nao a criacao automatica de um vinculo pos-contratacao.

`Onboarding` v1 foi deliberadamente limitado a um checklist interno, usando
`Candidate` e `CandidateApplication` como ponte transitoria. A propria
especificacao reconhece que a ausencia de uma entidade `Employee` ou
`Collaborator` e uma limitacao aceitavel para aquela fase.

A SPEC-017 introduz necessidades de desenvolvimento e retencao que pertencem ao
ciclo de vida pos-contratacao. Essas necessidades exigem uma base conceitual
propria para identidade organizacional da pessoa e para seus vinculos historicos.

## Objetivo

Definir a decisao arquitetural para representar identidade humana e vinculo
pos-contratacao no Talent OS, sem implementar tabelas, migrations, codigo ou
testes nesta ADR.

Esta decisao deve:

- evitar o uso indevido de `User`, `Membership`, `Candidate` ou
  `CandidateApplication` como colaborador;
- preservar o historico de recrutamento sem transforma-lo em vinculo laboral;
- permitir recontratacao, multiplos vinculos e evolucao futura;
- manter isolamento multiempresa;
- criar uma base consistente para desenvolvimento, retencao, performance,
  offboarding e dominios posteriores.

## Decisao Arquitetural

O modelo pos-contratacao sera baseado em duas entidades conceituais distintas:

- `OrganizationPerson`;
- `Employment`.

`OrganizationPerson` representa a identidade humana de uma pessoa dentro de uma
`Organization`.

`Employment` representa um vinculo concreto dessa pessoa com a organizacao em um
periodo, contexto e estado determinados.

O sistema nao adotara `User`, `Membership`, `Candidate`,
`CandidateApplication`, `Proposal`, `Onboarding`, `Employee` monolitico ou
`Collaborator` generico como entidade central do dominio pos-contratacao.

## Separacao de Conceitos

A separacao entre pessoa, acesso, candidatura e vinculo e obrigatoria.

`OrganizationPerson` nao e:

- `User`;
- `Membership`;
- `Candidate`;
- `CandidateApplication`;
- `Employment`.

`Employment` nao e:

- conta autenticavel;
- permissao de acesso;
- cadastro de candidato;
- candidatura;
- proposta;
- checklist de onboarding.

Essa separacao evita que mudancas em acesso, recrutamento ou onboarding alterem
indevidamente o historico pos-contratacao.

## OrganizationPerson

`OrganizationPerson` e a identidade humana de uma pessoa no contexto de uma
organizacao especifica.

Caracteristicas:

- pertence exatamente a uma `Organization`;
- nao cria identidade global entre tenants;
- pode existir antes, durante ou depois de um vinculo ativo;
- pode agrupar multiplos `Employment` da mesma pessoa dentro da mesma
  organizacao;
- nao concede acesso ao sistema;
- nao substitui `Candidate`;
- nao representa, por si so, um cargo, contrato, admissao ou vinculo ativo.

A reutilizacao de uma `OrganizationPerson` em recontratacoes dentro da mesma
organizacao preserva continuidade historica sem apagar vinculos anteriores.

## Employment

`Employment` e o vinculo concreto entre uma `OrganizationPerson` e uma
`Organization`.

Caracteristicas:

- pertence exatamente a uma `Organization`;
- referencia uma `OrganizationPerson` da mesma organizacao;
- representa o ciclo de vida de um vinculo pos-contratacao;
- e a entidade operacional principal para dominios como desenvolvimento,
  retencao, performance, offboarding e outros processos pos-contratacao;
- nao deve sobrescrever vinculos anteriores;
- deve permitir historico de encerramento e recontratacao;
- nao concede acesso ao sistema automaticamente.

Cada novo vinculo relevante deve ser representado por um novo `Employment`,
preservando os vinculos anteriores como historico.

## Origem no Recrutamento

Um `Employment` pode manter referencias historicas opcionais a artefatos de
recrutamento, quando aplicavel:

- `Candidate`;
- `CandidateApplication`;
- `ProposalVersion`;
- `JobOpening`;
- `JobOpeningVersion`.

Essas referencias representam proveniencia e rastreabilidade. Elas nao
transformam a candidatura, a proposta ou a vaga no vinculo pos-contratacao.

O status `hired` em `CandidateApplication` continua significando apenas decisao
positiva humana no processo seletivo. Ele nao cria automaticamente
`OrganizationPerson`, `Employment`, `User`, `Membership` ou `Onboarding`.

Uma `ProposalVersion` aceita pode servir como evidencia historica de origem,
mas tambem nao cria automaticamente o vinculo pos-contratacao.

## Onboarding

O onboarding existente permanece valido como desenho v1: um checklist interno
ancorado em `Candidate` e `CandidateApplication`.

Quando `OrganizationPerson` e `Employment` forem implementados, a integracao com
onboarding devera ser aditiva e explicita. O caminho esperado e permitir que um
`Onboarding` referencie um `Employment`, sem invalidar historicos ja criados no
modelo anterior.

Esta ADR nao altera a SPEC-016 nem exige migracao imediata de onboardings
existentes.

## User e Membership

`User` e `Membership` continuam pertencendo ao dominio de identidade tecnica,
autenticacao e autorizacao.

Uma pessoa com `Employment` pode nao ter `User`.

Um `User` pode ter `Membership` administrativo sem possuir `Employment`.

Um `Employment` pode futuramente ser associado a uma conta ou membership, mas
essa associacao deve ser explicita, auditavel e revogavel. Ela nao deve ser
deduzida automaticamente da existencia do vinculo.

Suspender, encerrar ou cancelar um `Employment` nao deve, por si so, alterar
automaticamente `User` ou `Membership` sem regra funcional propria.

## Lifecycle de Employment

O ciclo de vida conceitual minimo de `Employment` sera:

- `pending`;
- `active`;
- `ended`;
- `cancelled`.

`pending` representa um vinculo planejado ou criado antes do inicio efetivo.
Permite preparar processos pos-contratacao sem exigir acesso ao sistema nem
assumir que o trabalho ja comecou.

`active` representa um vinculo vigente.

`ended` representa um vinculo historicamente encerrado. A razao detalhada do
encerramento pode pertencer a um dominio futuro de offboarding ou historico
funcional.

`cancelled` representa um vinculo planejado ou criado indevidamente que nao deve
ser tratado como vinculo ativo ou encerrado ordinariamente.

Estados de `Employment` nao substituem estados de `User`, `Membership`,
`Candidate`, `CandidateApplication`, `Proposal` ou `Onboarding`.

## Datas

O modelo deve distinguir, conceitualmente, datas e momentos diferentes:

- momento da decisao de contratacao ou origem historica;
- data efetiva prevista de inicio;
- momento real de inicio, quando aplicavel;
- data prevista ou efetiva de encerramento;
- momento de encerramento operacional, quando aplicavel;
- criacao e atualizacao tecnica do registro.

Essa separacao evita confundir aceite de proposta, decisao `hired`, inicio de
trabalho e encerramento do vinculo.

A ADR nao define nomes fisicos obrigatorios de colunas, mas estabelece que uma
SPEC futura deve preservar essas diferencas sem impor regra trabalhista,
juridica ou de folha.

## Cargo, Funcao e Estrutura Organizacional

`JobOpening` e `JobOpeningVersion` pertencem ao recrutamento. Eles podem servir
como origem historica de um `Employment`, mas nao devem ser tratados como a
posicao permanente da pessoa na organizacao.

O modelo deve deixar espaco para uma futura estrutura organizacional propria,
incluindo cargo, funcao, area, gestor, alocacao, grade, senioridade ou centro de
custo.

Essa estrutura futura nao deve ser acoplada permanentemente a vagas de
recrutamento.

## Recontratacao e Multiplos Vinculos

Recontratacoes devem preservar historico.

Quando uma pessoa retorna para a mesma organizacao, o modelo deve permitir
reutilizar a mesma `OrganizationPerson` e criar um novo `Employment`.

O modelo tambem nao deve impedir, por principio arquitetural, multiplos vinculos
sequenciais ou simultaneos quando uma regra funcional futura justificar esse
cenario.

Entre organizacoes diferentes, nao deve haver identidade global compartilhada
nem deduplicacao automatica de pessoas.

## Privacidade e Minimizacao

`OrganizationPerson` e `Employment` devem nascer como entidades minimas.

Elas nao devem ser usadas como deposito geral de dados sensiveis ou de baixa
governanca, incluindo:

- documentos pessoais;
- dados bancarios;
- informacoes de saude;
- dependentes;
- remuneracao detalhada;
- avaliacoes de performance;
- anotacoes livres sem finalidade clara;
- documentos juridicos ou admissionais.

Esses dados, quando forem necessarios, devem pertencer a dominios especificos,
com controles proprios de acesso, retencao, auditoria e minimizacao.

## Multiempresa

Todo `OrganizationPerson` e todo `Employment` devem pertencer explicitamente a
uma `Organization`.

Leituras e gravacoes desses dados devem validar a organizacao atual.

Nao deve existir busca, deduplicacao, correlacao ou enriquecimento automatico
entre organizacoes.

Referencias a entidades de recrutamento, onboarding ou acesso devem respeitar a
mesma `Organization`.

## Auditoria

Eventos relevantes devem ser auditaveis quando o modelo for implementado,
incluindo:

- criacao de `OrganizationPerson`;
- criacao de `Employment`;
- ativacao de `Employment`;
- encerramento de `Employment`;
- cancelamento de `Employment`;
- associacao ou desassociacao futura com `User` ou `Membership`;
- vinculacao a artefatos de origem, como candidatura ou proposta.

A auditoria deve registrar ator, organizacao, momento e contexto suficiente para
rastreabilidade, sem armazenar dados sensiveis desnecessarios.

## Consequencias

Beneficios:

- separa acesso, recrutamento e pos-contratacao;
- evita sobrecarregar `Membership` ou `Candidate`;
- preserva historico de recontratacoes;
- cria base estavel para desenvolvimento, retencao, performance e offboarding;
- permite pessoas sem acesso ao sistema;
- permite usuarios administrativos sem vinculo empregaticio;
- reduz risco de vazamento entre tenants.

Custos:

- exige novas entidades e uma SPEC fundacional antes da implementacao;
- exige integracoes explicitas com onboarding e dominios futuros;
- aumenta a quantidade de referencias historicas a governar;
- exige regras claras para transicoes de lifecycle e auditoria.

## Impacto Futuro

Esta ADR devera orientar:

- uma SPEC fundacional para `OrganizationPerson` e `Employment`;
- futuras revisoes aditivas da SPEC-016;
- a implementacao da SPEC-017;
- dominios de performance, desenvolvimento, retencao, offboarding,
  remuneracao, beneficios e analytics;
- futuras decisoes sobre estrutura organizacional e cargo.

Qualquer implementacao futura deve preservar a compatibilidade conceitual com
esta decisao ou registrar nova ADR substitutiva.

## Fora do Escopo

Esta ADR nao define:

- schema fisico;
- migrations;
- APIs;
- telas;
- testes;
- folha de pagamento;
- beneficios;
- documentos admissionais;
- contrato juridico;
- dados bancarios;
- dados de saude;
- regras trabalhistas;
- avaliacao de performance;
- offboarding detalhado;
- politicas de acesso;
- modelo detalhado de contractor, freelancer, estagiario ou terceiros.

## Conflitos e Ambiguidades

Esta decisao resolve a ambiguidade central entre pessoa contratada, conta,
membership, candidato e candidatura.

Permanece em aberto, para SPEC futura:

- nomes fisicos finais de tabelas e colunas;
- cardinalidades operacionais detalhadas;
- regras de transicao entre estados;
- relacao com estrutura organizacional futura;
- momento exato em que um `Employment` pode ser criado a partir de recrutamento;
- estrategia de integracao aditiva com onboardings existentes;
- permissoes necessarias para administrar pessoas e vinculos;
- eventos de auditoria finais;
- regras de retencao e minimizacao por dominio.

Enquanto essas definicoes nao existirem, nenhum dominio pos-contratacao deve
usar `User`, `Membership`, `Candidate` ou `CandidateApplication` como substituto
de `Employment`.
