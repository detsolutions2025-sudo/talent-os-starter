# ADR 0013 - Candidato global por Organization

## Status

Aceita.

## Contexto

O Talent OS precisa representar pessoas candidatas sem misturar a identidade da
pessoa com participacoes em Vagas, pipeline, entrevistas, avaliacoes, documentos
ou analises futuras.

As fases anteriores estabeleceram que todo dado de negocio deve pertencer a uma
Organization, que o acesso deve ser validado no servidor e que dados de uma
Organization nunca podem atravessar outra. A SPEC-010 tambem separou Vagas de
candidatura publica, pipeline e candidatos.

Dados de candidatos sao dados pessoais e exigem protecao adicional: controle de
acesso, auditoria, minimizacao, retencao e preparacao para anonimizar dados no
futuro sem destruir integridade historica.

## Decisao

O Candidato representa uma pessoa no contexto de uma Organization.

O mesmo e-mail pode existir como candidato em Organizations diferentes. Dentro da
mesma Organization, o candidato deve possuir identidade unica por e-mail
normalizado.

O cadastro do candidato e separado da candidatura a uma Vaga. Uma pessoa pode
participar de varias Vagas da mesma Organization sem duplicar seu cadastro
principal.

Cada participacao em uma Vaga sera representada futuramente por uma entidade
propria de candidatura. Essa entidade futura devera apontar para o candidato e
para a Vaga, preservando o historico do processo seletivo sem transformar o
cadastro principal do candidato em pipeline.

Curriculos, documentos, respostas, avaliacoes e historico de processo nao devem
ficar diretamente misturados na entidade principal do candidato. Esses dados
devem ser modelados por entidades proprias ou estruturas separadas quando suas
fases forem especificadas.

Candidatos nunca sao excluidos fisicamente pelo fluxo normal. O sistema deve
suportar anonimizacao futura, preservando IDs historicos, integridade
referencial, auditoria e relacionamentos historicos. A anonimizacao futura nao
podera quebrar historico nem apagar eventos auditaveis.

Dados de candidatos nunca atravessam Organizations. Toda leitura e gravacao deve
validar User ativo, Membership ativo, Organization ativa, role autorizada e
pertencimento do candidato a Organization atual no servidor.

IA nao analisa nem decide candidatos nesta fase.

## Consequencias

- O cadastro principal do candidato permanece reutilizavel dentro da mesma
  Organization.
- A unicidade por e-mail normalizado evita duplicidade acidental dentro da
  Organization sem transformar e-mail em identificador global da plataforma.
- Candidaturas futuras poderao manter status, respostas, avaliacoes, evidencias e
  historico do processo sem poluir a entidade Candidate.
- A modelagem precisa prever dados pessoais com acesso restrito, auditoria sem
  conteudo sensivel completo e ausencia de exclusao fisica.
- Modulos futuros devem usar IDs internos, nao e-mail, nome ou telefone, como
  referencias de dominio.

## Restricoes mantidas

- Nao ha candidatura em Vaga nesta fase.
- Nao ha pipeline, entrevistas, respostas, avaliacoes, matching, propostas,
  onboarding ou contratacao.
- Nao ha curriculos, documentos ou upload de arquivos nesta fase.
- Nao ha IA nesta fase.
- Nao ha exclusao fisica.
- Platform Admin nao recebe role funcional dentro da Organization.
