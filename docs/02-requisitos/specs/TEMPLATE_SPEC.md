# SPEC-XXX — Nome da funcionalidade

**Status:** Rascunho  
**Fase:** X  
**Responsável de negócio:** Thiago Sousa  
**Última atualização:** AAAA-MM-DD

## 1. Objetivo

Explique o que será criado e qual problema resolve.

## 2. Fora do escopo

Liste o que não será desenvolvido nesta tarefa.

## 3. Usuários envolvidos

Liste os perfis que usarão a funcionalidade.

## 4. Fluxo principal

1. Usuário acessa.
2. Preenche ou seleciona dados.
3. Sistema valida.
4. Sistema salva ou responde.
5. Sistema confirma.

## 5. Regras de negócio

- RN-001:
- RN-002:
- RN-003:

## 6. Dados necessários

| Campo   | Obrigatório | Observação |
| ------- | ----------: | ---------- |
| Exemplo |         Sim | Explicação |

## 7. Permissões

Explique quem pode visualizar, criar, alterar, excluir e administrar.

## 8. Interface

Descreva telas, informações, ações e mensagens de erro.

## 9. API

| Operação  | Finalidade                   |
| --------- | ---------------------------- |
| Criar     | Criar registro               |
| Listar    | Listar registros permitidos  |
| Consultar | Consultar registro permitido |
| Atualizar | Alterar registro permitido   |

## 10. Banco de dados

Explique tabelas, campos, vínculos, restrições e migrações.

## 11. Segurança

Confirmar:

- validação no servidor;
- separação por empresa;
- permissões;
- auditoria;
- nenhuma informação sensível em logs.

## 12. Auditoria

Liste os eventos registrados.

## 13. Critérios de aceite

- CA-001:
- CA-002:
- CA-003:

## 14. Testes obrigatórios

### Funcionamento

- caminho normal;
- dados inválidos;
- registro inexistente.

### Segurança

- usuário sem permissão;
- usuário de outra empresa;
- alteração manual de identificador;
- vínculo inativo.

### Banco

- restrições;
- duplicidade;
- migração.

## 15. Limitações conhecidas

Liste o que ficará para fases futuras.

## 16. Definição de concluído

- critérios atendidos;
- testes passando;
- lint passando;
- formatação passando;
- build passando;
- documentação atualizada;
- segurança revisada;
- commit realizado.
