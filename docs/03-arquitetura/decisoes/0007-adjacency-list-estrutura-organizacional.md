# ADR 0007 - Adjacency List para Estrutura Organizacional

## Status

Aceita na Fase 3.

## Contexto

A SPEC-006 define a Estrutura Organizacional como uma unica entidade,
`Organizational Unit`, com hierarquia por relacao pai/filhos, multiplas raizes,
limite inicial de profundidade e proibicao de ciclos.

## Decisao

Usar inicialmente o modelo Adjacency List, armazenando a hierarquia em
`organizational_units.parent_id`.

Cada unidade pertence a uma Organization e nunca muda de Organization. O banco
mantem chave estrangeira autorreferente por `(organization_id, parent_id)` para
impedir pai de outra empresa. A prevencao de ciclos e o limite de profundidade de
10 niveis ficam no servidor, cobertos por testes de integracao.

Consultas de arvore podem carregar as unidades da Organization e montar a arvore
no servidor. Consultas recursivas em PostgreSQL ficam disponiveis como evolucao,
caso o volume torne necessario.

## Consequencias

- O modelo e simples e compativel com PostgreSQL/Supabase.
- Varias unidades raiz sao permitidas naturalmente com `parent_id` nulo.
- Movimentacoes exigem validacao transacional para evitar ciclos e profundidade
  acima do limite.
- Closure Table e Materialized Path nao serao implementados nesta fase.

## Evolucao futura

Se a estrutura crescer muito ou consultas de descendentes se tornarem criticas,
o projeto pode avaliar Closure Table, Materialized Path ou indices auxiliares,
com nova ADR e migration propria.
