# ADR 0012 - Vagas versionadas

## Status

Aceita para a Fase 7.

## Contexto

O Talent OS precisa representar vagas de recrutamento sem acoplar o processo de
contratacao ao estado mutavel de Cargos, Competencias, Perguntas ou estruturas
organizacionais.

Fases anteriores estabeleceram principios que impactam esta decisao:

- Cargos possuem versoes publicadas imutaveis e vagas futuras devem referenciar
  uma versao publicada especifica;
- Competencias reutilizaveis devem ser consumidas por
  `competency_catalog_items.id`;
- Perguntas reutilizaveis devem ser consumidas por `question_catalog_items.id`;
- peso, pontuacao e obrigatoriedade pertencem ao contexto de uso, nao aos itens
  reutilizaveis;
- dados de Organization devem permanecer isolados e protegidos.

## Decisao

O Talent OS tera um modulo de Vagas versionadas.

Uma Vaga representa um processo de contratacao para uma ou mais posicoes. Ela
pertence obrigatoriamente a uma Organization e pode estar associada a uma
Organizational Unit ativa da mesma Organization.

Cada versao da Vaga deve referenciar uma versao `published` especifica de Cargo
(`job_profile_versions.id`). Alteracoes futuras no Cargo nao modificam versoes
existentes da Vaga. A Vaga nao deve usar `job_profiles.id` isoladamente como
referencia do conteudo do cargo.

A Vaga possui conteudo proprio e versionado. Publicar uma nova versao da Vaga
nao altera versoes anteriores. Versoes publicadas e arquivadas sao snapshots
imutaveis.

A quantidade de posicoes pertence ao snapshot versionado da Vaga. Portanto,
`positions_count` deve existir em `job_opening_versions`, e nao na entidade
estavel `job_openings`.

Perguntas, competencias e Cargo sao referenciados por IDs internos:

- Cargo: versao publicada especifica de Job Profile em cada versao da Vaga;
- Competencias: `competency_catalog_items.id`;
- Perguntas: `question_catalog_items.id`;
- Organizational Unit: `organizational_units.id`, quando houver.

Peso e obrigatoriedade pertencem ao contexto da Vaga. Portanto, competencias e
perguntas usadas por uma Vaga podem receber pesos e obrigatoriedade dentro dos
vinculos da propria Vaga, sem alterar o item reutilizavel original.

A divulgacao publica sera separada da entidade principal da Vaga. Dados publicos
devem usar slug proprio, sem expor IDs internos, e respeitar configuracoes de
exibicao, inclusive a protecao de faixa salarial.

A Vaga nunca e excluida fisicamente. Encerramento, cancelamento, pausa,
arquivamento de versoes e descarte de rascunhos preservam historico.

Candidatos, pipeline, entrevistas, avaliacoes, matching, IA, propostas e
candidatura publica nao fazem parte desta fase.

## Consequencias

- Uma Vaga preserva o contexto de contratacao mesmo que o Cargo, competencias ou
  perguntas sejam alterados depois.
- Modulos futuros devem consumir a Vaga por IDs internos e nao por nomes,
  titulos, codigos ou slugs publicos.
- A publicacao de Vaga exige transacao para garantir uma unica versao publicada,
  arquivamento consistente da anterior e auditoria.
- O modulo de candidatura podera ser criado futuramente sem reabrir a modelagem
  principal da Vaga.

## Restricoes mantidas

- Nao ha candidatos nesta fase.
- Nao ha pipeline nesta fase.
- Nao ha entrevistas, avaliacoes, matching, IA ou propostas nesta fase.
- Nao ha exclusao fisica.
- Platform Admin nao recebe role funcional dentro da Organization.
