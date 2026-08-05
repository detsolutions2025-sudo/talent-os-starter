# SPEC-005 — DNA Organizacional

**Status:** Rascunho
**Versão:** 1.0
**Fase:** 2
**Dependências:** SPEC-001 (Organization), SPEC-002 (User), SPEC-003 (Membership), SPEC-004 (Roles & Permissions)

---

# 1. Objetivo

Permitir que cada Organization defina oficialmente sua identidade, cultura e princípios de funcionamento.

O DNA Organizacional será a referência utilizada pelos módulos futuros de cargos, vagas, entrevistas, onboarding, desenvolvimento, retenção e inteligência artificial.

Nesta fase, o DNA será exclusivamente cadastrado e gerenciado por usuários autorizados.

---

# 2. Fora do escopo

Não fazem parte desta SPEC:

* geração automática por IA;
* DISC;
* testes comportamentais;
* perfil de cargo;
* perfil de candidato;
* matching cultural;
* avaliação de desempenho;
* onboarding;
* sugestões automáticas de melhorias.

---

# 3. Conceitos

Cada Organization possui apenas um DNA publicado por vez.

O DNA poderá existir em três estados:

* `draft`
* `published`
* `archived`

Nunca será permitido editar diretamente uma versão publicada.

Qualquer alteração em um DNA publicado deverá gerar uma nova versão em rascunho.

---

# 4. Estrutura do DNA

O DNA será composto pelos seguintes blocos.

## 4.1 Identidade

Campos:

* Missão
* Visão
* Propósito

Todos obrigatórios na publicação.

---

## 4.2 Valores

Cada valor possuirá:

* nome;
* descrição;
* significado prático;
* exemplos de comportamentos esperados;
* exemplos de comportamentos incompatíveis.

A quantidade de valores será definida pela empresa.

---

## 4.3 Cultura Organizacional

Descreve como a empresa trabalha.

Exemplos:

* tomada de decisão;
* colaboração;
* comunicação;
* inovação;
* autonomia;
* responsabilidade.

---

## 4.4 Competências Organizacionais

Competências esperadas de todos os colaboradores.

Exemplos:

* foco no cliente;
* aprendizado contínuo;
* trabalho em equipe;
* resolução de problemas.

Cada competência poderá possuir:

* descrição;
* nível de importância;
* exemplos práticos.

---

## 4.5 Estilo de Liderança

Define como líderes devem atuar.

Exemplos:

* desenvolvimento de pessoas;
* feedback;
* delegação;
* comunicação;
* tomada de decisão.

---

## 4.6 Ambiente de Trabalho

Descreve características gerais da empresa.

Exemplos:

* colaboração;
* flexibilidade;
* ritmo;
* autonomia;
* inovação;
* qualidade.

---

# 5. Versionamento

Cada publicação gera uma nova versão.

Exemplo:

* v1
* v2
* v3

Somente uma versão poderá permanecer publicada.

Versões anteriores permanecem disponíveis para consulta e auditoria.

---

# 6. Fluxo

## Criar

Owner cria um novo DNA em rascunho.

## Editar

Somente rascunhos podem ser editados.

## Publicar

Ao publicar:

* validar campos obrigatórios;
* arquivar automaticamente a versão publicada anterior;
* publicar a nova versão;
* registrar auditoria.

## Arquivar

Somente versões publicadas podem ser arquivadas.

A Organization nunca poderá ficar sem uma versão publicada por uma ação de arquivamento isolada.

---

# 7. Permissões

## Platform Admin

Pode visualizar e administrar qualquer DNA.

## Owner

Pode:

* criar;
* editar rascunhos;
* publicar;
* arquivar conforme as regras da plataforma;
* consultar histórico.

## Admin

Pode:

* criar rascunhos;
* editar rascunhos;
* consultar histórico.

Não pode publicar nem arquivar.

## Member

Pode apenas visualizar a versão publicada.

---

# 8. Auditoria

Registrar:

* criação;
* edição;
* publicação;
* arquivamento;
* restauração;
* consulta administrativa;
* tentativa de alteração sem permissão.

Não registrar informações sensíveis desnecessárias.

---

# 9. API Conceitual

Operações previstas:

* criar DNA;
* consultar DNA publicado;
* consultar versão específica;
* listar versões;
* atualizar rascunho;
* publicar versão;
* arquivar versão;
* restaurar versão anterior.

---

# 10. Banco de Dados

Entidades previstas:

* DNA Organizacional;
* Versão do DNA;
* Valores;
* Competências;
* Eventos de auditoria.

Todos os registros pertencem obrigatoriamente a uma Organization.

Toda alteração estrutural deverá possuir migração.

---

# 11. Segurança

Toda operação deve validar:

* User ativo;
* Membership ativo;
* Organization ativa;
* permissões conforme SPEC-004.

Nenhuma operação poderá acessar o DNA de outra Organization.

---

# 12. Critérios de Aceite

* Cada Organization possui apenas um DNA publicado.
* Apenas rascunhos podem ser editados.
* Publicação cria nova versão.
* Histórico permanece preservado.
* Alterações geram auditoria.
* Usuários sem permissão recebem acesso negado.
* Não existe acesso cruzado entre Organizations.

---

# 13. Testes Obrigatórios

## Funcionais

* criar rascunho;
* editar rascunho;
* publicar;
* consultar versão publicada;
* consultar histórico.

## Segurança

* member não publica;
* admin não publica;
* owner publica;
* acesso cruzado bloqueado;
* Organization arquivada bloqueia operações.

## Banco

* somente uma versão publicada por Organization;
* integridade das versões;
* auditoria persistida;
* migrações reproduzíveis.

---

# 14. Definição de Concluído

A implementação será considerada concluída quando:

* todos os critérios de aceite forem atendidos;
* testes automatizados passarem;
* lint, formatação e build forem aprovados;
* migrações forem executadas com sucesso;
* documentação estiver atualizada;
* revisão de segurança estiver aprovada.
