# ADR 0016 - IA opcional por Organization

## Status

Aceita.

## Contexto

O Talent OS ja possui modulos centrais funcionando sem qualquer dependencia de
Inteligencia Artificial: DNA Organizacional, Catalogo de Competencias, Banco de
Perguntas, Vagas versionadas, Candidatos, CandidateApplication e Entrevistas. As
ADRs anteriores (0005, 0013, 0014, 0015) ja deixam registrado, em cada uma delas,
que IA nao existe ainda e que analises futuras de IA, quando existirem,
pertencerao a `CandidateApplication` ou a `Interview`, nunca ao `Candidate`
principal.

Antes de especificar qualquer provider, modelo ou fluxo de IA, e necessario
registrar uma decisao arquitetural transversal: IA e uma capacidade adicional da
plataforma, nao uma dependencia estrutural. Isso precisa valer para todos os
modulos ja implementados e para todos os modulos futuros, evitando que qualquer
especificacao posterior transforme IA em pre-requisito de funcionamento.

A disponibilidade de IA depende de duas autoridades distintas que precisam
coexistir sem conflito: a plataforma, que decide se uma Organization pode usar
IA, e a Organization, que decide se quer usar IA dentro do que a plataforma
permite. Esta ADR tambem registra como essas duas autoridades se relacionam.

## Decisao

Fica decidido que Inteligencia Artificial e uma capacidade opcional do Talent
OS, nunca um requisito para o funcionamento da plataforma.

- O Talent OS deve operar integralmente sem IA.
- Nenhum fluxo obrigatorio da plataforma depende de IA.
- IA adiciona apoio a decisao. IA nunca substitui decisao humana.
- A ausencia de IA nunca impede a criacao ou operacao normal de `Candidate`,
  `Job Opening`, `CandidateApplication`, `Interview` ou qualquer outro fluxo,
  presente ou futuro.

Esta decisao vale para todos os modulos futuros da plataforma. Nenhuma
especificacao posterior pode tornar IA obrigatoria para um fluxo existente sem
revisar esta ADR.

## Estado canonico da IA

A disponibilidade efetiva de IA e controlada por duas camadas canonicas
independentes, cada uma booleana:

- `platform_ai_allowed`: autoridade de Platform Admin; representa se a
  plataforma permite o uso de IA para aquela Organization;
- `organization_ai_enabled`: autoridade do Owner; representa se a propria
  Organization optou por usar IA dentro do que a plataforma permite.

Nenhuma outra flag, excecao ou estado adicional pode ser usado para liberar
execucao de IA.

Quando qualquer uma das duas camadas estiver `false`, o efeito e equivalente ao
estado `disabled`: nenhuma chamada a provider externo de IA pode ocorrer para
essa Organization e nenhum dado da Organization pode ser enviado para IA,
interna ou externa. Nao ha excecao operacional para essa restricao.

## Regra efetiva de execucao

A execucao de qualquer funcionalidade de IA so e permitida quando,
simultaneamente:

- `platform_ai_allowed = true`;
- `organization_ai_enabled = true`;
- a funcionalidade especifica estiver permitida pela politica futura de
  features, a ser definida em ADR ou especificacao posterior.

A ausencia de qualquer uma dessas tres condicoes bloqueia a execucao. Nao existe
atalho administrativo, modo de emergencia ou excecao que contorne essa regra.

## Estado inicial

Toda nova Organization deve iniciar com IA desabilitada por padrao:

- `platform_ai_allowed = false`, ou o valor definido pela politica comercial da
  plataforma vigente no momento da criacao da Organization;
- `organization_ai_enabled = false`.

Mesmo quando a plataforma liberar `platform_ai_allowed = true` para uma
Organization, o Owner precisa habilitar `organization_ai_enabled`
explicitamente. Nunca existe opt-in automatico de IA.

Nenhum dado pode ser enviado para IA antes da habilitacao explicita de ambas as
camadas.

## Precedencia entre Platform Admin e Owner

Platform Admin possui autoridade de politica de plataforma sobre
`platform_ai_allowed`. Essa autoridade tem precedencia sobre a Organization.

Se Platform Admin definir `platform_ai_allowed = false` para uma Organization
por politica, seguranca, contrato, inadimplencia, limite ou qualquer outro
motivo administrativo da plataforma, o Owner nao pode reabilitar IA para aquela
Organization enquanto essa restricao estiver ativa. Uma tentativa de definir
`organization_ai_enabled = true` nessas condicoes nao tem nenhum efeito sobre a
execucao e deve ser tratada como tentativa de habilitacao negada por politica de
plataforma.

Owner so pode habilitar ou desabilitar `organization_ai_enabled` quando
`platform_ai_allowed = true`.

Platform Admin nao participa do uso funcional de IA dentro da Organization.
Platform Admin controla exclusivamente a disponibilidade da capacidade
(`platform_ai_allowed`), nunca o uso operacional dela.

## Independencia entre avaliacao humana e IA

Avaliacoes humanas permanecem independentes das analises de IA.

Resultados produzidos por humanos e resultados produzidos por IA pertencem a
entidades distintas. Um resultado de IA nunca substitui, sobrescreve ou se
mistura com um resultado humano na mesma entidade. Essa separacao e consistente
com a ADR-0015, que ja determina que avaliacoes de entrevistadores pertencem a
`Interview` e que analises futuras de IA, se existirem, pertencerao a
`Interview` ou a `CandidateApplication`, nunca ao `Candidate` principal.

## Autorizacao

- `owner` pode habilitar ou desabilitar `organization_ai_enabled`, desde que
  `platform_ai_allowed = true`.
- `admin` pode visualizar as configuracoes e o status de IA da Organization, mas
  nao pode habilitar nem desabilitar IA nesta primeira versao.
- `member` nao pode visualizar configuracoes administrativas de IA nem alterar
  o estado de IA da Organization.
- Platform Admin continua fora das Roles de Membership; assim como nas ADRs
  anteriores, nao recebe role funcional dentro da Organization. Sua autoridade
  sobre `platform_ai_allowed` e exercida como autoridade de plataforma, exige
  motivo administrativo e gera auditoria.

## Alteracao de configuracao e auditoria

Alterar a configuracao de IA, em qualquer camada, nunca remove historico.
Registros, avaliacoes e quaisquer resultados de IA ja produzidos antes da
alteracao permanecem preservados e acessiveis conforme as regras de cada modulo
e a politica de retencao vigente.

Devem ser auditados separadamente, como eventos distintos:

- liberacao ou bloqueio de `platform_ai_allowed` pela plataforma;
- habilitacao ou desabilitacao de `organization_ai_enabled` pelo Owner;
- tentativa de habilitacao de IA negada por politica de plataforma, incluindo
  quando o Owner tenta definir `organization_ai_enabled = true` com
  `platform_ai_allowed = false`.

Cada registro de auditoria identifica quem executou a acao, quando, o estado
resultante e o motivo administrativo quando aplicavel. A auditoria nunca
registra segredos, credenciais, tokens ou o conteudo enviado ou recebido de um
provider de IA.

## Historico

- Desabilitar IA, em qualquer camada (`platform_ai_allowed` ou
  `organization_ai_enabled`), nunca apaga analises ou resultados de IA ja
  produzidos.
- Resultados historicos de IA permanecem disponiveis conforme a permissao do
  usuario e a politica de retencao vigente.
- Novas execucoes de IA ficam imediatamente bloqueadas assim que qualquer uma
  das duas camadas passar para `false`.

## Consequencias

- Todo modulo existente continua funcionando integralmente sem IA.
- Qualquer modulo futuro que incorporar IA precisa verificar as duas camadas de
  disponibilidade da Organization antes de qualquer chamada a provider externo
  e recusar a chamada quando `platform_ai_allowed` ou `organization_ai_enabled`
  forem `false`.
- Resultados humanos permanecem como fonte de verdade independente de IA estar
  disponivel, habilitada ou de mudar de estado ao longo do tempo.
- Habilitar IA nao apaga, sobrescreve ou reinterpreta avaliacoes humanas ja
  registradas.
- Desabilitar IA, em qualquer camada, nao apaga resultados de IA ja produzidos;
  apenas impede novas chamadas a provider externo.
- Futuras ADRs de IA (provider, credenciais, prompts, modelos, custos, politica
  de features) devem respeitar as duas camadas e a regra efetiva de execucao
  definidas aqui como pre-condicao obrigatoria de qualquer chamada.

## Fora do escopo

Esta ADR nao define nem implementa:

- provider de IA;
- credenciais, chaves ou segredos de acesso a provider;
- prompts, modelos ou parametros de inferencia;
- custos, limites de uso ou cotas;
- endpoints, contratos de API ou formato de resposta de IA;
- quais modulos especificos usarao IA e como;
- interface de usuario para configuracao ou visualizacao de IA;
- politica futura de features especificas de IA;
- politica detalhada de retencao de resultados historicos de IA.

Esses temas deverao possuir ADRs ou especificacoes proprias quando forem
priorizados.

## Restricoes mantidas

- IA nao e requisito para nenhum fluxo do Talent OS.
- Nenhum dado e enviado a IA quando `platform_ai_allowed` ou
  `organization_ai_enabled` forem `false`.
- IA nao aprova nem reprova candidatos sozinha.
- Platform Admin nao recebe role funcional dentro da Organization.
- Nao ha exclusao de historico ao alterar a configuracao de IA em nenhuma
  camada.
- Nao existe opt-in automatico de IA para nenhuma Organization.
