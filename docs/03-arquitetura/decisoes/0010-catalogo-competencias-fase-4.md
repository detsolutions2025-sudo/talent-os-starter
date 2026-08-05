# ADR 0010 - Catalogo de competencias da Fase 4

## Status

Aceita na Fase 4.

## Contexto

A SPEC-007 define um catalogo hibrido de competencias, com biblioteca global da
plataforma, competencias proprias por Organization e adocao de competencias
globais. Modulos futuros precisarao referenciar competencias sem depender das
tabelas internas de origem.

## Decisao

Implementar quatro estruturas:

- `global_competencies`, sem `organization_id`, administrada apenas por Platform
  Admin;
- `organization_competencies`, pertencente a uma Organization e isolada por
  `organization_id`;
- `organization_adopted_competencies`, que registra a adocao de uma competencia
  global sem copiar seu conteudo;
- `competency_catalog_items`, que fornece o identificador operacional unificado
  por Organization.

Modulos futuros devem consumir competencias pelo servico ou contrato do dominio
de Competencias e usar apenas `competency_catalog_items.id` como referencia
operacional. Eles nao devem depender diretamente de `global_competencies.id` ou
`organization_competencies.id`.

Campos estruturados de evidencias, exemplos e niveis serao armazenados em JSONB
nesta fase. A validacao forte fica no servidor, com limites e formato definidos
pela SPEC-007.

## Depreciacao

Uma Global Competency `deprecated` nao aceita novas adocoes. Adocoes ativas ja
existentes permanecem visiveis e utilizaveis enquanto a adocao estiver ativa.
Uma adocao inativa de global depreciada nao pode ser reativada.

Global Competency `inactive` bloqueia novas adocoes e novo uso operacional.
Historico e vinculos existentes permanecem preservados.

## Transacoes

As operacoes que sincronizam mais de uma estrutura usam transacao PostgreSQL:

- criacao de Organization Competency e respectivo catalog item;
- adocao global e respectivo catalog item;
- ativacao ou inativacao de competencias proprias e adocoes;
- mudancas de status global com impacto operacional;
- auditoria critica.

Falha de auditoria critica reverte a operacao.

## Consequencias

- A origem da competencia continua disponivel para exibicao e autorizacao.
- O ID operacional fica estavel e isolado por Organization.
- A modelagem evita copia de competencias globais por Organization.
- Sem versionamento formal, o catalogo representa o estado atual da
  competencia. Modulos futuros que precisarem de historico textual deverao criar
  snapshots proprios.

## Limitacoes

- Nao ha categorias personalizadas.
- Nao ha pesos em competencias.
- Nao ha cargos, vagas, entrevistas, avaliacoes, matching ou IA.
- Nao ha busca semantica ou deduplicacao automatica.
- Nao ha exclusao fisica.
