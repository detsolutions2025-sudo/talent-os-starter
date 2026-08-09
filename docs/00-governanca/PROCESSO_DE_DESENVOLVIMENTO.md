# Processo de Desenvolvimento do DoF — Gente & Seleção

## Fluxo obrigatório

1. Escolher uma tarefa pequena.
2. Criar ou atualizar uma especificação.
3. Revisar a especificação.
4. Pedir o plano ao agente.
5. Aprovar o plano.
6. Implementar.
7. Validar testes, lint, formatação e build.
8. Revisar segurança.
9. Atualizar documentação.
10. Registrar no Git.

## Não aprovar um plano quando

- tentar desenvolver módulos futuros;
- mudar arquitetura sem registrar decisão;
- não prever testes;
- ignorar segurança multiempresa;
- pedir acesso direto à produção.

## Estados de uma tarefa

- Rascunho
- Em revisão
- Aprovada
- Em desenvolvimento
- Em testes
- Concluída
- Bloqueada

## Regra prática

Não iniciar nova tarefa enquanto a atual não estiver testada, documentada e registrada no Git.
