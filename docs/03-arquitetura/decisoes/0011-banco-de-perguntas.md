# ADR 0011 - Banco de Perguntas

## Status

Aceita para a Fase 6.

## Contexto

O Talent OS passara a precisar de perguntas reutilizaveis em vagas,
entrevistas, avaliacoes, onboarding e recursos assistidos por IA. Essas
perguntas nao devem ficar acopladas a uma vaga ou entrevista especifica, pois o
mesmo conteudo pode ser reutilizado em diferentes contextos e Organizations.

As fases anteriores ja estabeleceram dois principios relevantes:

- competencias reutilizaveis devem ser consumidas por identificadores internos
  unificados, especialmente `competency_catalog_items.id`;
- peso, importancia, pontuacao e obrigatoriedade pertencem ao contexto de uso,
  nao ao item reutilizavel.

## Decisao

O Talent OS tera um Banco de Perguntas reutilizavel.

Perguntas nao pertencerao diretamente a uma vaga ou entrevista. Vagas,
entrevistas, avaliacoes, onboarding e IA reutilizarao perguntas pelo ID interno.

O sistema tera perguntas globais da plataforma e perguntas proprias da
Organization:

- perguntas globais sao administradas somente por Platform Admin;
- perguntas proprias sao administradas por owner e admin da Organization ativa;
- perguntas globais adotadas nao sao copiadas nem editadas pela Organization.

Perguntas nunca serao excluidas fisicamente.

Perguntas proprias poderao ser vinculadas a competencias por
`competency_catalog_items.id`, respeitando a mesma Organization e a
disponibilidade operacional da competencia. Perguntas globais nao apontarao
diretamente para catalog items de uma Organization.

Peso, pontuacao e obrigatoriedade pertencem ao contexto de uso, nao a pergunta.
Respostas, respostas corretas, criterios de avaliacao e criterios de aprovacao
nao fazem parte desta fase.

Referencias futuras devem usar sempre IDs internos, nunca texto, titulo, nome ou
codigo da pergunta.

## Consequencias

- O Banco de Perguntas podera ser reutilizado por varios modulos sem duplicar
  conteudo.
- A biblioteca global da plataforma fica separada das perguntas proprias das
  Organizations.
- A adocao de pergunta global preserva uma referencia para a pergunta original,
  sem copia de dados.
- Modulos consumidores poderao definir peso, obrigatoriedade, ordem, pontuacao,
  criterios ou snapshots proprios sem alterar a pergunta reutilizavel.
- A associacao com competencias usa a referencia operacional unificada ja
  definida para o catalogo de competencias.

## Restricoes mantidas

- Nao ha implementacao de vagas, entrevistas, avaliacoes, onboarding, matching
  ou IA nesta fase.
- Nao ha resposta correta, criterio de avaliacao, criterio de aprovacao,
  pontuacao ou peso na pergunta.
- Nao ha exclusao fisica.
- Nao ha copia de pergunta global para a Organization durante a adocao.
- Platform Admin nao recebe role funcional dentro da Organization.
