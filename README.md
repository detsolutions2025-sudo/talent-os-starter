# Talent OS

Plataforma SaaS multiempresa para gestao inteligente de talentos.

## Objetivo inicial

Construir um MVP com:

1. Empresas e usuarios
2. DNA organizacional
3. Biblioteca de cargos
4. Vagas
5. Candidatos
6. Processo seletivo
7. Avaliacao assistida por IA
8. Relatorio para decisao humana
9. Auditoria e seguranca entre empresas

## Regra principal

A IA auxilia. A decisao final e humana.

## Estado atual

Fase 0 concluida: base tecnica local, tela inicial, servidor basico, banco SQLite
de desenvolvimento, TypeScript, testes e verificacao de codigo.

## Como iniciar

1. Copie `.env.example` para `.env`.
2. Instale dependencias com `npm install`.
3. Prepare o banco local com `npm run db:push`.
4. Inicie a aplicacao com `npm run dev`.
5. Abra `http://127.0.0.1:5173`.

## Comandos uteis

- `npm run dev`: inicia web e API local.
- `npm run test`: executa testes automatizados.
- `npm run lint`: verifica padrao de codigo.
- `npm run build`: verifica tipos e gera build web.
- `npm run db:push`: cria ou atualiza o banco SQLite de desenvolvimento.

## Seguranca

- Nao use dados reais em desenvolvimento.
- Nao coloque segredos em `.env.example`, prompts, logs ou testes.
- Toda funcionalidade futura com dados de negocio deve validar a empresa atual no
  servidor.
