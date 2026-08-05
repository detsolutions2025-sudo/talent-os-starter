# Prompt — Fase 1: empresas, usuários e controle de acesso

Leia completamente antes de alterar código:

- README.md
- AGENTS.md
- SECURITY.md
- CHECKLIST-REVISAO.md
- docs/00-visao/roadmap.md
- docs/03-arquitetura/multi-tenancy.md
- docs/04-seguranca/constituicao-seguranca.md
- todas as decisoes existentes em docs/03-arquitetura/decisoes/

Também revise o código atual da Fase 0.

## Objetivo

Executar somente a Fase 1, criando a base de:

- empresas;
- usuários;
- vínculo entre usuários e empresas;
- funções dentro da empresa;
- seleção da empresa atual;
- validação de acesso no servidor;
- auditoria inicial;
- testes de isolamento entre empresas.

Não desenvolver ainda:

- DNA organizacional;
- estrutura organizacional;
- cargos;
- vagas;
- candidatos;
- recrutamento;
- DISC;
- onboarding;
- inteligência artificial;
- cobrança;
- integrações externas.

## Antes de alterar qualquer arquivo

Apresente:

1. resumo do que entendeu;
2. modelo de dados sugerido;
3. fluxo simples de acesso;
4. arquivos que pretende criar ou alterar;
5. riscos de segurança;
6. testes que serão criados;
7. como a solução permanecerá compatível com o ambiente de desenvolvimento local e com o PostgreSQL/Supabase, preservando a portabilidade da arquitetura e evitando dependências desnecessárias de um fornecedor específico.

Não implemente antes de apresentar esse plano.

## Regras obrigatórias

### Empresas

Cada empresa deve possuir, no mínimo:

- identificador;
- nome;
- nome simplificado para endereço ou referência;
- status;
- data de criação;
- data de atualização.

### Usuários

Cada usuário deve possuir, no mínimo:

- identificador;
- nome;
- e-mail;
- status;
- data de criação;
- data de atualização.

O e-mail deve ser tratado de forma consistente para evitar duplicidade causada por letras maiúsculas ou espaços.

### Vínculo entre usuário e empresa

Um usuário pode participar de mais de uma empresa.

O vínculo deve possuir:

- usuário;
- empresa;
- função;
- status;
- data de entrada.

Funções iniciais:

- owner;
- admin;
- member.

Não permita vínculos duplicados entre o mesmo usuário e a mesma empresa.

Toda empresa deve possuir ao menos um proprietário durante sua criação.

### Empresa atual

A empresa atual deve ser determinada e validada no servidor.

Não confie apenas em um identificador enviado pelo navegador.

O servidor deve verificar:

1. quem é o usuário;
2. qual empresa ele está tentando acessar;
3. se existe vínculo ativo;
4. se sua função permite a operação.

### Autenticação temporária de desenvolvimento

Como ainda não existe autenticação completa, implemente uma forma temporária, clara e isolada para identificar usuários durante o desenvolvimento.

Essa solução:

- deve funcionar apenas no ambiente de desenvolvimento ou teste;
- não pode ser apresentada como autenticação pronta para produção;
- deve ser documentada;
- deve ser fácil de remover na fase de autenticação real;
- não deve aceitar acesso irrestrito silenciosamente;
- não deve criar um usuário administrador automaticamente em produção.

Registre essa decisão em um novo documento de arquitetura.

### Auditoria inicial

Registre, no mínimo:

- criação de empresa;
- criação de usuário;
- criação de vínculo;
- mudança de função;
- ativação ou desativação de vínculo;
- tentativas negadas de acesso entre empresas.

Não registre:

- senhas;
- tokens;
- segredos;
- conteúdo pessoal desnecessário.

## API inicial esperada

Crie apenas os caminhos necessários para a Fase 1.

Exemplos conceituais:

- criar empresa;
- listar empresas acessíveis ao usuário atual;
- consultar uma empresa acessível;
- criar usuário para desenvolvimento;
- vincular usuário a uma empresa;
- listar membros da empresa atual;
- alterar função de um membro;
- selecionar ou informar o contexto da empresa atual.

Você pode ajustar os caminhos conforme os padrões do projeto, desde que documente a decisão.

## Interface inicial

Criar uma interface simples, sem preocupação estética avançada, que permita:

- visualizar o usuário de desenvolvimento atual;
- visualizar empresas às quais ele pertence;
- selecionar uma empresa;
- visualizar informações básicas da empresa selecionada;
- visualizar seus membros;
- identificar claramente quando um acesso for negado.

Não criar um painel completo de administração.

## Testes obrigatórios

Crie testes automatizados para comprovar:

1. usuário acessa empresa da qual participa;
2. usuário não acessa empresa da qual não participa;
3. alteração manual do identificador da empresa não libera acesso;
4. membro comum não executa ação exclusiva do proprietário ou administrador;
5. administrador executa apenas ações autorizadas;
6. usuário inativo não acessa a empresa;
7. vínculo inativo não permite acesso;
8. empresa criada possui proprietário;
9. vínculo duplicado é recusado;
10. e-mails equivalentes não geram usuários duplicados;
11. tentativa negada gera auditoria;
12. listagem retorna apenas empresas autorizadas;
13. dados de uma empresa não aparecem na resposta de outra.

Os testes de acesso cruzado entre empresas são obrigatórios e não podem ser substituídos apenas por testes unitários da função de tenant.

## Banco de dados

O SQLite continuará sendo utilizado apenas para desenvolvimento local nesta fase.

Evite recursos excessivamente específicos do SQLite que dificultem uma futura migração para PostgreSQL.

Toda alteração no banco deve possuir mecanismo reproduzível de criação ou atualização.

Não alterar manualmente o arquivo `dev.db` como método oficial de desenvolvimento.

## Critérios de conclusão

A Fase 1 estará concluída somente quando:

- empresas puderem ser criadas;
- usuários puderem ser criados no modo de desenvolvimento;
- usuários puderem ser vinculados às empresas;
- funções puderem ser definidas;
- o servidor validar o contexto da empresa;
- acessos cruzados forem bloqueados;
- ações importantes forem auditadas;
- a interface básica funcionar;
- todos os testes passarem;
- lint passar;
- formatação passar;
- build passar;
- documentação estiver atualizada;
- uma nova decisão arquitetural estiver registrada.

## Entrega final obrigatória

Ao concluir, informe:

1. resumo do que foi criado;
2. arquivos criados e alterados;
3. modelo de dados final;
4. caminhos da API;
5. como testar manualmente;
6. comandos executados;
7. resultados dos testes;
8. limitações;
9. riscos ainda existentes;
10. o que não foi implementado;
11. decisão registrada;
12. confirmação explícita de que usuários de empresas diferentes não conseguem acessar os dados uns dos outros nos testes realizados.
