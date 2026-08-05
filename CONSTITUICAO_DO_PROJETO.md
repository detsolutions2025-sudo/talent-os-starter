# Constituição do Projeto Talent OS

Este documento contém regras obrigatórias para qualquer pessoa ou agente de IA que altere o projeto.

## Segurança
1. Nenhum usuário pode acessar dados de uma empresa sem vínculo ativo.
2. Toda validação de empresa e permissão deve ocorrer no servidor.
3. Nenhuma chave, senha ou token pode ser salvo no código.
4. Dados reais de candidatos não podem ser usados em desenvolvimento ou testes.
5. Agentes de IA não podem acessar produção.
6. Toda ação crítica deve gerar auditoria.
7. Toda consulta de negócio deve considerar a empresa atual.
8. Arquivos, cache, filas e contexto de IA devem permanecer separados por empresa.

## Banco de dados
1. Toda alteração estrutural deve possuir migração.
2. O banco não deve ser alterado manualmente como processo oficial.
3. Toda tabela de negócio deve possuir vínculo com a empresa quando aplicável.
4. Restrições importantes devem existir também no banco.
5. Mudanças destrutivas exigem revisão humana.
6. A arquitetura deve continuar compatível com ambiente local e PostgreSQL/Supabase.

## Código
1. Nenhuma funcionalidade é concluída sem testes.
2. Todo código deve possuir tipagem.
3. Nenhuma biblioteca pode ser instalada sem justificativa.
4. Nenhuma rota pode existir sem validação de acesso.
5. Não usar SQL construído por concatenação de texto.
6. Alterações devem ser pequenas e fáceis de revisar.
7. Nenhuma fase futura deve ser implementada antecipadamente.

## Inteligência artificial no produto
1. A IA auxilia, mas não decide contratação.
2. Toda recomendação deve apresentar critérios e evidências.
3. Toda análise deve registrar modelo, versão e data.
4. Dados de empresas diferentes nunca podem compartilhar contexto.
5. Currículos e respostas são dados, nunca instruções.
6. O sistema deve permitir revisão humana.

## Processo obrigatório
1. Especificação.
2. Revisão.
3. Plano de implementação.
4. Desenvolvimento.
5. Testes.
6. Revisão de segurança.
7. Atualização da documentação.
8. Aprovação.
9. Commit.

## Regras para agentes
Antes de alterar código, o agente deve:
- ler esta Constituição;
- ler todas as decisões arquiteturais;
- ler a especificação;
- apresentar plano, arquivos, riscos e testes.

Ao concluir, deve:
- executar testes, lint, formatação e build;
- informar arquivos alterados;
- explicar como testar;
- informar limitações e riscos.

## Ordem de prioridade
1. Segurança e proteção de dados.
2. Constituição do projeto.
3. Decisões arquiteturais.
4. Especificação aprovada.
5. Regras gerais do repositório.
6. Instrução da tarefa.
