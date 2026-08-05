# ADR 0005 - DNA Organizacional da Fase 2

## Status

Aceita na Fase 2.

## Contexto

A SPEC-005 define o DNA Organizacional como identidade cultural e operacional de
uma Organization. A implementacao precisa preservar isolamento multiempresa,
versionamento imutavel, auditoria e persistencia PostgreSQL/Supabase.

## Decisao

Implementar o DNA Organizacional como snapshots completos em
`organization_dna_versions`.

Cada versao pertence a uma Organization. Versoes `published` e `archived` sao
imutaveis. Rascunhos usam status `draft`; rascunho ativo significa
`status = 'draft'` e `discarded_at IS NULL`.

Valores e competencias ficam em JSONB estruturado nesta fase. Essa escolha reduz
complexidade inicial, preserva o snapshot completo e nao impede migracao futura
para tabelas proprias.

## Restricoes de versao

O banco aplica:

- status canonicos `draft`, `published` e `archived`;
- no maximo uma versao `published` por Organization;
- no maximo um rascunho ativo por Organization;
- `version_number` unico por Organization quando preenchido;
- `version_number` obrigatorio para `published` e `archived`.

## Publicacao

A publicacao ocorre em transacao:

1. valida User, Membership, Organization e role;
2. bloqueia versoes da Organization;
3. valida rascunho ativo;
4. valida campos obrigatorios e limites;
5. arquiva a versao publicada anterior;
6. atribui o proximo `version_number`;
7. publica o rascunho;
8. registra auditoria;
9. confirma ou reverte tudo.

Duas publicacoes simultaneas nao podem gerar duas versoes publicadas.

## Auditoria

Eventos de criacao, edicao, descarte, publicacao, arquivamento automatico e
consultas administrativas sao persistidos em `audit_events`.

A auditoria nao copia o conteudo completo do DNA; registra somente metadados
minimos como `versionId`, `versionNumber`, role ou motivo administrativo.

## Limitacoes

- Nao ha IA nesta fase.
- Nao ha DISC, cargos, vagas, candidatos, matching, onboarding,
  desenvolvimento ou retencao.
- Nao ha restauracao ou republicacao direta de versoes antigas.
- A interface e simples e operacional.
- Autenticacao continua temporaria ate especificacao propria.
