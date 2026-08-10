# SPEC-020 - Candidatura Pública

**Status:** Aprovada
**Versão:** 1.1
**Fase:** 17
**Responsável de negócio:** Thiago Sousa
**Última atualização:** 2026-08-09
**Dependências:** SPEC-010 - Vagas, SPEC-011 - Candidatos (v1.2), SPEC-012 - Processo Seletivo (v1.1), SPEC-019 - Portal Público de Vagas, ADR-0013, ADR-0014, ADR-0020, ADR-0023

**Nota de revisão (v1.1):** esta versão (a) torna a regra de reaplicação
após `cancelled` determinística — bloqueada nesta primeira versão, pela
ausência de classificação estruturada do motivo de cancelamento (antes
era condicional a uma interpretação de texto livre, o que não é
implementável com segurança); (b) formaliza o mecanismo conceitual de
`Idempotency-Key` como metadado de cabeçalho HTTP, nunca campo pessoal do
formulário; (c) desvincula a referência de rate limiting de qualquer
autoridade específica do módulo de IA — o rate limiting público é um
componente técnico comum, independente de IA; (d) referencia a autoria
condicional de `CandidateConsent` (SPEC-011 v1.2) e de
`CandidateApplication` (SPEC-012 v1.1), agora ambas formalizadas.

## 1. Objetivo

Definir funcionalmente como um visitante interessado em uma Vaga Pública se
transforma em um `Candidate` válido (novo ou reutilizado) e cria uma
`CandidateApplication` dentro da Organization responsável pela vaga, sem
autenticação prévia e sem qualquer participação de Inteligência Artificial.

Esta SPEC começa exatamente quando o visitante pressiona "Quero me
candidatar" no Portal Público (SPEC-019) e termina quando:

- o `Candidate` está identificado/criado ou reutilizado com segurança;
- os consentimentos obrigatórios foram registrados;
- a `CandidateApplication` foi criada;
- uma confirmação segura foi apresentada ao visitante.

Esta SPEC formaliza exatamente o passo já antecipado, em nível de produto e
arquitetural, pela ADR-0023 (seção "Candidatura Pública"): "o candidato
realiza seu cadastro a partir do Portal Público. Esse cadastro cria, ou
reutiliza, um `Candidate` da Organization (ADR-0013)... A partir do cadastro
e da intenção de participar de uma Vaga específica, é criada uma
`CandidateApplication` (ADR-0014)."

Esta SPEC **reutiliza integralmente** as entidades `Candidate` (SPEC-011) e
`CandidateApplication` (SPEC-012) já aprovadas — não cria nenhuma entidade
nova para representar a pessoa ou a candidatura. Não redefine nenhuma regra
já aprovada por essas SPECs; apenas define o **novo caminho de acesso
público e não autenticado** por meio do qual essas entidades passam a poder
ser criadas.

Esta SPEC **não executa Pré-Entrevista**.

## 2. Fora do Escopo

Não pertence à SPEC-020:

- Pré-Entrevista Estruturada;
- DISC;
- Perfil Comportamental;
- Inteligência Artificial, em qualquer forma;
- Pré-Análise Assistida por IA;
- Dossiê Inteligente;
- `Interview` (Entrevista);
- score, ranking ou matching;
- decisão de contratação, onboarding ou qualquer efeito de RH após a
  candidatura;
- acompanhamento completo do candidato após a submissão;
- portal autenticado do candidato (área logada para o próprio candidato
  acompanhar suas candidaturas);
- redefinir o modelo de dados, permissões ou regras já aprovadas pela
  SPEC-011 (Candidatos) ou SPEC-012 (Processo Seletivo);
- redefinir a mecânica de divulgação pública de Vaga já aprovada pela
  SPEC-010;
- implementar código, banco, migrations, rotas, APIs, testes ou
  dependências;
- excluir fisicamente qualquer dado.

Esses assuntos pertencem à SPEC-021 (Pré-Entrevista Estruturada), SPEC-022
(Perfil Comportamental), SPEC-023 (Pré-Análise Assistida por IA), SPEC-024
(Dossiê Inteligente do Candidato), ou a SPECs próprias ainda não priorizadas
(portal autenticado do candidato, entrevistas humanas subsequentes — já
cobertas pela SPEC-013 quando aplicável ao processo interno).

## 3. Usuários Envolvidos

- **Visitante:** pessoa não autenticada que acessa uma Vaga Pública e
  inicia a candidatura. Ver seção 4.
- **Candidato:** o mesmo Visitante, a partir do momento em que seus dados
  resultam em um `Candidate` criado ou reutilizado (SPEC-011). Não é uma
  role de acesso administrativo.
- **owner / admin / member:** nenhum é necessário para o Visitante
  submeter a candidatura pública. Suas permissões internas sobre
  `Candidate` e `CandidateApplication`, já definidas por SPEC-011 e
  SPEC-012, não são alteradas por esta SPEC.
- **Platform Admin (SuperAdmin):** não participa funcionalmente da
  candidatura pública; mantém apenas a leitura administrativa auditada já
  definida pelas SPECs anteriores.

Esta SPEC não cria nenhuma role nova.

## 4. Conceitos

### Visitante

Pessoa não autenticada que acessa uma Vaga Pública (SPEC-019) e pode:
visualizar a vaga, iniciar a candidatura, fornecer os dados necessários,
aceitar ou recusar os consentimentos aplicáveis. Um Visitante nunca recebe
permissão administrativa e nunca é um `User` (SPEC-002) nem um
`Membership` (SPEC-003) — ver seção 16.

### Candidate

O mesmo `Candidate` já definido integralmente pela SPEC-011: "entidade
principal da pessoa candidata dentro de uma Organization". Esta SPEC não
cria `PublicCandidate`, `ApplicantProfile`, `Prospect`, `Lead` ou qualquer
outra entidade paralela. Um `Candidate` criado pela candidatura pública é,
em todos os aspectos de modelo de dados, permissões e regras, o mesmo
`Candidate` que um owner/admin poderia criar manualmente (SPEC-011, seção
6.1) — a única diferença é o canal de origem (público, sem Membership) e o
valor de `source` (seção 8.3 da SPEC-011 já prevê `career_page` como origem
canônica compatível com este fluxo).

### CandidateApplication

A mesma entidade já definida integralmente pela SPEC-012: "representa a
candidatura de um `Candidate` para uma `Job Opening`". Esta SPEC não
redefine nenhum de seus estados canônicos, transições, regras de
unicidade ou de consentimento — apenas formaliza que a candidatura pública
é **um** dos caminhos pelos quais uma `CandidateApplication` nasce.

## 5. Fronteira com SPEC-019

A SPEC-019 termina no clique em "Quero me candidatar". A página pública de
uma Vaga (SPEC-019) nunca cria `Candidate` nem `CandidateApplication` — ela
é somente leitura (SPEC-019, seção 13: "nenhuma escrita de dado de negócio
ocorre... exceto configuração do Portal e analytics agregado").

A SPEC-020 começa imediatamente após esse clique.

## 6. Fronteira com SPEC-021

A SPEC-020 termina depois da criação válida da `CandidateApplication` e da
apresentação da mensagem de confirmação (seção 21). A partir daí:

- nenhuma pergunta de Pré-Entrevista é criada, exibida ou respondida nesta
  SPEC;
- nenhuma chamada de IA ocorre;
- nenhuma análise é iniciada.

A próxima etapa da jornada do candidato (Pré-Entrevista Estruturada)
pertence exclusivamente à SPEC-021, que poderá, quando especificada,
utilizar a `CandidateApplication` recém-criada como seu ponto de partida.

## 7. Fluxo Principal

```text
Portal Público (SPEC-019)
↓
"Quero me candidatar"
↓
Validação da Vaga (seção 11)
↓
Identificação do Candidate (seção 8)
↓
Consentimentos (seção 10)
↓
Cadastro / atualização permitida de dados (seção 8, seção 9)
↓
Candidate (criado ou reutilizado)
↓
CandidateApplication (criada)
↓
Confirmação (seção 21)
```

Nenhuma etapa de inteligência, pontuação, triagem automática ou decisão é
adicionada a este fluxo.

## 8. Identificação e Cadastro do Candidate

### 8.1 Princípio de identificação

Antes de criar um novo `Candidate`, o sistema deve tentar identificar se já
existe um `Candidate` correspondente **dentro da mesma Organization**
responsável pela Vaga. A identificação nunca pode atravessar Organizations
— consistente com a ADR-0013 ("o mesmo e-mail pode existir como candidato
em Organizations diferentes... dentro da mesma Organization, o candidato
deve possuir identidade única por e-mail normalizado") e com a SPEC-011
(RN-009, RN-010).

Esta SPEC não cria um "Candidate global compartilhado entre clientes". O
`Candidate` continua isolado por Organization, sem exceção, mesmo quando
originado por um fluxo público sem Membership.

### 8.2 E-mail

O e-mail é o identificador operacional usado para a busca de
correspondência, reutilizando integralmente as regras já definidas pela
SPEC-011 (seção 8.2): normalização (remoção de espaços laterais,
minúsculas), unicidade por Organization (nunca entre Organizations
diferentes), e-mail nunca usado isoladamente como referência de domínio
técnico (a referência técnica continua sendo o `id` interno do
`Candidate`).

Comparação para fins de identificação: sempre pelo e-mail normalizado, nunca
pelo e-mail exibido.

Concorrência: duas submissões simultâneas com o mesmo e-mail normalizado, na
mesma Organization, nunca podem resultar em dois `Candidate` distintos — a
unicidade de `normalized_email` por Organization, já garantida pela SPEC-011
(seção 13.1), é a autoridade final (banco, não aplicação).

Mensagem pública: a interface pública nunca deve informar diretamente "este
e-mail já existe como candidato nesta empresa" de forma que permita a um
visitante mal-intencionado enumerar quais e-mails já são candidatos de uma
Organization (seção 22). O comportamento correto (criar nova candidatura
para o `Candidate` já existente) deve ocorrer de forma transparente para um
uso legítimo, sem expor essa distinção ao Visitante como uma mensagem de
erro.

### 8.3 Candidate existente

Se já existir um `Candidate` ativo na mesma Organization com o mesmo e-mail
normalizado:

- não criar um `Candidate` duplicado;
- criar uma nova `CandidateApplication` somente quando permitido pelas
  regras já definidas pela SPEC-012 (RN-011: no máximo uma
  `CandidateApplication` `active` por par Candidate + Job Opening; ver
  seção 14 desta SPEC);
- respeitar o consentimento vigente do `Candidate` (seção 10);
- respeitar o isolamento multiempresa (seção 26).

Dados já cadastrados do `Candidate` existente podem ser atualizados pelo
próprio fluxo público somente dentro do que for estritamente necessário
para a nova candidatura (por exemplo, atualizar um currículo desatualizado,
quando esse recurso existir — seção 9), nunca sobrescrevendo dados
sensíveis sem que o Visitante os informe explicitamente.

### 8.4 Candidate novo e dados mínimos

Quando não existir `Candidate` correspondente, coletar apenas os dados
necessários à candidatura, reutilizando integralmente os campos e
validações já definidos pela SPEC-011 (seção 8), nunca um segundo schema de
candidato.

Conjunto mínimo positivo, avaliado a partir da SPEC-011:

- `full_name` (obrigatório, SPEC-011 RN-014);
- `preferred_name` (opcional, SPEC-011 RN-015);
- `email` (obrigatório, SPEC-011 RN-009);
- `phone` (opcional, exigido apenas quando a Organization o considerar
  necessário para aquele processo — SPEC-011 não o torna obrigatório;
  esta SPEC não cria uma obrigatoriedade nova);
- localização (opcional, SPEC-011 seção 8.4);
- `source`, preenchido automaticamente como origem pública (o valor
  canônico mais próximo já existente na SPEC-011 é `career_page`; esta SPEC
  não cria um novo valor canônico de origem, reutilizando o já aprovado);
- consentimento estruturado (obrigatório, SPEC-011 RN-035; seção 10 desta
  SPEC).

Aplicar minimização: nenhum outro campo estruturado da SPEC-011 (experiências,
escolaridade, certificações, idiomas, links profissionais, competências
declaradas, disponibilidade, autorização de trabalho, salário pretendido) é
exigido nesta SPEC como obrigatório — todos permanecem exatamente como
opcionais, já definidos pela SPEC-011. A Organization pode optar por
solicitar alguns desses campos na candidatura pública, sempre dentro dos
limites e formatos já aprovados pela SPEC-011, nunca inventando um campo
novo.

### 8.5 Candidate inativo

Quando o e-mail informado corresponde a um `Candidate` com status
`inactive` na mesma Organization (SPEC-011, seção 5), a política é
definitiva a partir desta revisão:

- **nunca reativar automaticamente ou silenciosamente**;
- **nunca criar um `Candidate` duplicado** (a unicidade de
  `normalized_email` por Organization, SPEC-011 RN-009, não abre exceção
  para candidatos inativos);
- **nunca criar uma nova `CandidateApplication` enquanto o `Candidate`
  permanecer `inactive`** — a SPEC-011 (RN-046: "candidato inativo não
  pode ser usado em novas candidaturas futuras") e a SPEC-012 (RN-024:
  "Candidate `inactive` não pode receber nova candidatura") já proíbem
  isso explicitamente, sem exceção para origem pública;
- **nunca alterar o `status` do `Candidate`** como efeito colateral da
  tentativa de candidatura pública;
- a submissão pública é recusada com uma resposta pública neutra e segura,
  idêntica em forma à de qualquer outra candidatura que não pode ser
  concluída (seção 21), nunca revelando ao Visitante que o motivo
  específico é um `Candidate` inativo — por exemplo (texto ilustrativo, não
  vinculante — a redação final de UI não pertence a esta SPEC): "Não foi
  possível concluir sua candidatura. Verifique os dados ou entre em
  contato com a organização responsável.";
- o bloqueio é registrado internamente, de forma minimizada e auditada,
  quando aplicável (seção 24), para uso administrativo de owner/admin —
  essa informação nunca é exposta ao Visitante;
- a reativação do `Candidate` continua sendo, exclusivamente, uma ação
  administrativa explícita de owner/admin, exatamente como já definida
  pela SPEC-011 (seção 6.5), nunca disparada automaticamente por um
  Visitante ou por esta SPEC.

Depois que o `Candidate` for reativado por um ator autorizado (owner/admin),
ele volta a poder participar normalmente de um novo fluxo público, desde
que os demais requisitos desta SPEC continuem válidos (Vaga apta,
consentimento válido, ausência de `CandidateApplication` `active` para o
mesmo par Candidate + Job Opening). Isso fecha o ciclo sem exigir nenhuma
regra nova em SPEC-011 além da já existente (seção 6.5): a candidatura
pública nunca reativa, mas também nunca permanece bloqueada
indefinidamente — a reativação administrativa é o único caminho, e ele já
está definido.

## 9. Currículo

A SPEC-011, seção 2 ("Fora do Escopo") e seção 18 ("Limitações
Conhecidas"), afirma explicitamente: "implementar upload de currículo,
documentos ou arquivos" está fora do escopo, e "não há upload de
currículo" é uma limitação conhecida e ainda vigente. **O `Candidate`, tal
como aprovado hoje, não possui nenhum campo de arquivo ou currículo.**

Portanto, esta SPEC:

- **não pode** tornar currículo obrigatório, porque não existe hoje
  nenhuma estrutura aprovada para armazená-lo;
- trata currículo como uma capacidade **condicional e ainda não
  disponível**: a candidatura pública deve funcionar integralmente sem
  currículo;
- registra a necessidade conceitual de suporte a currículo como um
  requisito para uma extensão futura da SPEC-011 (ou uma SPEC própria de
  anexos/documentos do candidato), **fora do escopo desta revisão** — esta
  SPEC não estende nem altera a SPEC-011;
- quando essa extensão existir, os princípios já antecipados por este
  documento devem valer: currículo nunca é armazenado em auditoria
  (consistente com SPEC-011, seção 15: "não registrar... perfil completo");
  currículo nunca é enviado para IA nesta SPEC (fora de escopo, seção 2);
  formatos permitidos, tamanho máximo e o exato pertencimento do arquivo
  (ao `Candidate` ou à `CandidateApplication`) ficam para o planejamento
  técnico daquela extensão futura, respeitando a arquitetura já
  estabelecida (ADR-0013: "currículos, documentos, respostas... não devem
  ficar diretamente misturados na entidade principal do candidato").

## 10. Consentimento

Ponto central desta SPEC. Reutiliza integralmente o modelo estrutural já
aprovado pela SPEC-011 (seção 8.14): estados canônicos `granted`,
`revoked`, `expired`, `pending`; campos conceituais de status, data,
origem, versão do termo, finalidade, data de expiração e data de
revogação.

### 10.1 Transparência

Antes da confirmação final, o Visitante precisa saber, de forma clara:

- para qual Empresa (Organization, SPEC-019 seção 4) está se candidatando;
- para qual Vaga;
- a finalidade do processamento de seus dados;
- que os dados serão utilizados no processo seletivo daquela candidatura;
- que etapas adicionais futuras (por exemplo, Pré-Entrevista, quando
  existir) poderão exigir novos consentimentos próprios.

### 10.2 Consentimento obrigatório

O consentimento operacional mínimo — necessário para criar o `Candidate` e
a `CandidateApplication`, e para que os dados sejam utilizados no processo
seletivo — é obrigatório. Se esse consentimento não for concedido
(`granted`), a candidatura não deve ser concluída como funcional:

- nenhuma `CandidateApplication` `active` é criada;
- o comportamento é o mesmo já definido pela SPEC-012 para consentimento
  inválido (RN-026 a RN-031): a submissão não avança, sem estado
  parcialmente criado (seção 12).

### 10.3 Consentimentos opcionais

Consentimentos relacionados a capacidades futuras — IA, Perfil
Comportamental, DISC, comunicação comercial — **nunca são obrigatórios**
para realizar a candidatura básica desta SPEC, salvo se uma SPEC própria
futura estabelecer fundamento jurídico específico que exija o contrário.
Esta SPEC não mistura finalidade de marketing/comunicação comercial com a
finalidade de recrutamento e seleção.

### 10.4 Consentimento anterior (Candidate reutilizado)

Quando o `Candidate` já possuir um registro de consentimento (seção 8.3),
a nova candidatura deve revalidar, nunca inferir automaticamente que o
registro existente ainda é válido:

- se a finalidade do registro existente ainda cobre esta operação;
- se o status é `granted`;
- se não expirou (`expires_at`);
- se não foi revogado (`revoked_at`).

Um registro de consentimento existir não significa, por si só, que ele
ainda autoriza a operação atual.

### 10.5 Novo consentimento

Quando um novo registro de consentimento for necessário, ele deve conter,
no mínimo, os mesmos campos já exigidos pela SPEC-011 (seção 8.14):
finalidade, versão do texto/política quando aplicável, timestamp, origem
(pública), e demais dados mínimos já exigidos pela SPEC-011. Nunca
armazenar apenas um sinalizador isolado ("aceito") sem essa rastreabilidade
estruturada.

**Autoria do consentimento público:** formalizada pela SPEC-011 (v1.2,
seção 8.14.1, RN-061 a RN-065) — o consentimento registrado por esta SPEC
sempre possui `source = public_application`, e `created_by_user_id` é
nulo, sem atribuição a nenhum User, Platform Admin ou ator fictício.
Nenhum campo novo foi criado para representar essa origem; o campo
`source`, já parte do modelo de consentimento desde a SPEC-011 v1.0, é
reutilizado.

### 10.6 Revogação

Depois de concluída a candidatura, a revogação de consentimento segue
exatamente as regras já definidas pela SPEC-011 (RN-037, RN-038) e pela
SPEC-012 (RN-026 a RN-031): nunca apaga automaticamente o histórico, nunca
altera retroativamente a `CandidateApplication` já criada, apenas bloqueia
novo uso operacional futuro.

## 11. Validação da Vaga

### 11.1 Vaga válida

A candidatura só pode iniciar e concluir quando a Vaga estiver apta a
receber candidatura pública, validando conceitualmente, a partir das
regras já aprovadas pela SPEC-010:

- Organization ativa (não arquivada — SPEC-010, seção 16);
- Job Opening correta e pertencente à mesma Organization do contexto
  resolvido pelo Portal Público (SPEC-019, seção 14);
- existe versão `published` válida (SPEC-010, RN-025, RN-026);
- Vaga está `open` (SPEC-010, RN-049);
- divulgação pública está ativa (`is_public = true`, SPEC-010, seção 14);
- `application_deadline`, quando informado, não expirou (SPEC-010,
  RN-069);
- Vaga não está `paused`, `closed` ou `cancelled` (SPEC-010, seção 13).

### 11.2 Vaga expirando durante o cadastro

Cenário: o Visitante abre o formulário enquanto a Vaga está válida; antes
de confirmar, a Vaga expira, é pausada, encerrada ou cancelada.

- O servidor deve **revalidar todas as condições da seção 11.1 no momento
  do envio final (submit)**, nunca confiar apenas na validação feita no
  momento em que o formulário foi aberto.
- Se a Vaga não estiver mais apta no momento do envio, a
  `CandidateApplication` não deve ser criada.
- Deve-se evitar estado parcialmente criado sempre que possível (seção
  12).
- Se um `Candidate` novo já tiver sido persistido antes da falha de
  validação da Vaga, a estratégia transacional (seção 12) deve evitar essa
  criação órfã desnecessária — preferindo validar a Vaga **antes** de
  qualquer escrita relacionada ao `Candidate`, dentro da mesma operação
  atômica.

## 12. Atomicidade

A submissão final deve ser atomicamente consistente. Fluxo conceitual:

1. validar a Vaga (seção 11);
2. validar a Organization;
3. normalizar os dados recebidos;
4. localizar ou preparar a criação do `Candidate` (seção 8);
5. registrar o consentimento (seção 10);
6. criar a `CandidateApplication` (SPEC-012);
7. gerar evento de auditoria aplicável (seção 24);
8. confirmar (commit).

Falha crítica em qualquer etapa: reverter tudo (rollback). Nunca deixar uma
`CandidateApplication` parcialmente criada, nunca deixar um `Candidate`
novo órfão sem consentimento registrado quando a operação como um todo
falhar.

Quando um `Candidate` novo é criado nesta submissão (seção 8.4), a criação
do `Candidate` (incluindo `creation_origin = public_application`, seção
16), o registro do consentimento (seção 10) e a criação da
`CandidateApplication` (SPEC-012) devem ser tratados como uma única
unidade transacional: se qualquer uma dessas três etapas falhar, nenhuma
delas persiste. Um `Candidate` recém-criado exclusivamente por causa desta
submissão nunca deve permanecer órfão (sem consentimento e sem
`CandidateApplication`) quando a submissão como um todo falhar.

Quando um `Candidate` **existente** é reutilizado (seção 8.3), a submissão
não deve alterar seus dados além do estritamente necessário para a nova
candidatura — reutilização nunca é pretexto para sobrescrever dados que o
Visitante não informou explicitamente.

Este princípio é uma aplicação direta, ao contexto público, do mesmo padrão
já exigido pela SPEC-010 para publicação de Vaga (seção 12.1: "falha em
qualquer etapa deve causar rollback completo") e pela SPEC-012 (RN
implícita de transação atômica para criação de `CandidateApplication`).

## 13. Concorrência

Cenários a cobrir, com o banco de dados como autoridade final de unicidade
(nunca a aplicação sozinha):

- dois envios simultâneos com o mesmo e-mail normalizado, na mesma
  Organization: apenas um `Candidate` deve prevalecer;
- dois envios simultâneos para a mesma Vaga, pelo mesmo `Candidate`:
  apenas uma `CandidateApplication` `active` deve prevalecer (SPEC-012,
  RN-011, RN-012: "a unicidade ativa por Candidate + Job Opening deve ser
  protegida contra concorrência");
- `Candidate` sendo criado concorrentemente com outra tentativa para o
  mesmo e-mail: resolvido pela restrição de unicidade de
  `normalized_email` por Organization (SPEC-011);
- `Candidate` existente sendo reutilizado concorrentemente por duas
  submissões: ambas devem localizar o mesmo `Candidate`, e a proteção de
  concorrência da `CandidateApplication` (ponto anterior) evita
  duplicidade da candidatura;
- fechamento da Vaga durante a submissão: coberto pela revalidação no
  submit (seção 11.2);
- duas tentativas simultâneas de reaplicação (seção 14) para o mesmo par
  Candidate + Job Opening, após uma candidatura anterior finalizada: apenas
  uma nova `CandidateApplication` `active` deve prevalecer; a outra recebe
  conflito seguro, nunca duplicidade — mesma proteção de RN-011/RN-012 da
  SPEC-012, aplicada também a este cenário.

## 14. Reaplicação e Candidatura Duplicada

`Candidate` pode se candidatar a vagas diferentes da mesma Organization —
princípio já estabelecido pela SPEC-011 (RN-005) e pela SPEC-012.

Regra herdada, não redefinida: deve existir apenas uma
`CandidateApplication` `active` por par Candidate + Job Opening dentro da
mesma Organization (SPEC-012, RN-011). Uma tentativa pública de candidatura
duplicada (mesmo `Candidate`, mesma Vaga, candidatura `active` já
existente) deve:

- retornar uma resposta pública segura, sem expor detalhes internos (seção
  22);
- nunca criar uma segunda `CandidateApplication` `active`.

### Reaplicação após candidatura finalizada

A SPEC-012 já define os estados finais de `CandidateApplication`
(`withdrawn`, `rejected`, `hired`, `cancelled` — RN-014, RN-015) e afirma
que estados finais "nunca retornam para `active`" (RN-016). A SPEC-012 não
define explicitamente, para o canal público, se um `Candidate` pode criar
uma **nova** `CandidateApplication` para a **mesma** Vaga depois de uma
candidatura anterior finalizada — mas a própria SPEC-012 antecipa que essa
decisão pertence a uma fase futura (seção "Testes Obrigatórios", teste 20:
"candidatura duplicada após estado final **conforme regra da fase**").
Esta SPEC preenche exatamente essa lacuna deliberadamente deixada aberta
pela SPEC-012, sem redefinir nenhuma regra já aprovada por ela.

**Política definitiva desta SPEC (v1):**

Uma `CandidateApplication` finalizada é imutável e nunca é reaberta —
reaplicação sempre significa uma **nova** `CandidateApplication`, com novo
`id`, novo `applied_at`, novo histórico próprio, referenciando a versão
publicada vigente no momento da nova submissão, e nunca altera ou substitui
a candidatura anterior.

Uma nova `CandidateApplication` para a mesma Vaga só pode ser criada
quando, simultaneamente: o `Candidate` está `active`; o consentimento
operacional está válido; a Job Opening continua aberta e pública (seção
11); o prazo ainda permite candidatura; e não existe `CandidateApplication`
`active` para o mesmo par Candidate + Job Opening (SPEC-012, RN-011).

O status da candidatura **anterior** determina se essa nova candidatura é
permitida:

| Status anterior | Nova candidatura à mesma Vaga |
| --- | --- |
| `active` | Bloqueada — duplicidade (SPEC-012, RN-011). |
| `withdrawn` | Permitida, se a Vaga continuar apta. |
| `cancelled` | **Bloqueada nesta primeira versão.** `finalization_reason` é campo de texto livre, sem nenhuma classificação estruturada — não há forma determinística de avaliar programaticamente se "a causa do cancelamento não impede nova submissão" sem interpretar texto livre, o que esta SPEC nunca faz (seção 20, reforço geral de não-interpretação automática de conteúdo). Bloquear é o comportamento determinístico e conservador; uma futura evolução poderá introduzir uma classificação estruturada (por exemplo, um `cancellation_reason_code` canônico) que permita reabrir essa decisão com segurança. |
| `rejected` | **Bloqueada nesta primeira versão.** Tecnicamente não proibida pela SPEC-012, mas, na ausência de uma política própria e configurável da Organization sobre reabertura de candidaturas rejeitadas, esta SPEC prefere o comportamento mais conservador — bloquear — a inventar uma reabertura sem base normativa. Fica para uma revisão futura tornar isso configurável. |
| `hired` | **Bloqueada.** Permitir nova candidatura à mesma Vaga depois de uma contratação já registrada para o mesmo par Candidate + Job Opening produziria incoerência de negócio (duas candidaturas concorrendo por uma vaga já preenchida por aquele mesmo Candidate). Bloqueado salvo decisão futura específica. |

Esta tabela é uma política de negócio nova, definida por esta SPEC para o
canal público — ela não contradiz nenhuma RN da SPEC-012 (que deixou o
assunto em aberto), mas também não foi, até este momento, replicada para o
fluxo de criação **interna** de `CandidateApplication` (SPEC-012, seção
6.1.1, executado por owner/admin). Esta SPEC não redefine esse fluxo
interno; **registra como observação não bloqueante**: se a mesma
restrição (em especial os bloqueios após `cancelled` e `hired`) deve
valer também para a criação interna, para evitar inconsistência entre
canais, fica pendente de alinhamento em uma revisão própria e futura da
SPEC-012.

## 15. Idempotência

A submissão pública precisa de uma estratégia de idempotência: reenviar a
mesma submissão (por exemplo, por causa de uma falha de rede ou duplo
clique) nunca deve criar:

- dois `Candidate`;
- duas `CandidateApplication`;
- dois registros de consentimento indevidos para a mesma submissão.

**Mecanismo conceitual preferencial:** `Idempotency-Key` como **cabeçalho
HTTP** da requisição de submissão, nunca como campo funcional do
formulário. O Visitante não preenche nem controla semanticamente essa
chave — o frontend a gera e gerencia de forma transparente, como um
detalhe técnico da submissão, não um dado pessoal.

O servidor:

- valida a presença e o formato da chave;
- associa a chave à Vaga/Organization resolvida (a mesma chave usada para
  Vagas diferentes não deve ser tratada como a mesma submissão);
- nunca registra a chave bruta quando a persistência puder usar hash
  (mesmo princípio de proteção de segredo já aplicado a outras partes do
  projeto);
- nunca usa e-mail + Vaga como substituto da chave de idempotência —
  isso impediria reaplicações legítimas (seção 14).

Esta SPEC não define a tabela física de persistência da idempotência. Fica
para planejamento técnico futuro, seguindo o mesmo princípio conceitual já
estabelecido pela ADR-0019 para execuções de IA (seção "Idempotência":
"Features com risco de... persistência de resultado duplicado devem
fornecer `idempotency_key`") — aplicado aqui, por analogia, à submissão
pública, embora esta SPEC não envolva IA e a chave nesta SPEC seja
transportada como cabeçalho HTTP, não como campo de payload.

## 16. Autenticação e Identidade

A candidatura pública não exige conta nem autenticação prévia:

- não exige `Membership` (SPEC-003);
- não cria um `User` (SPEC-002) administrativo automaticamente;
- `Candidate` **não é** `User` — são entidades completamente distintas,
  reafirmando a separação já estabelecida pela ADR-0013 e pela SPEC-011
  (o `Candidate` nunca acessa a plataforma como usuário autenticado nesta
  SPEC).

Se uma confirmação por e-mail existir futuramente (seção 17), isso não
transforma o `Candidate` em `Membership`, nem concede a ele qualquer forma
de acesso administrativo. A identidade administrativa (User/Membership) e
a identidade do candidato (`Candidate`) nunca se misturam nesta SPEC.

### Ator técnico de criação

A ADR-0013 e a SPEC-011 (até a versão 1.0) foram escritas assumindo que
todo `Candidate` é criado por um `owner` ou `admin` autenticado (com
`Membership` ativo). A candidatura pública introduz, pela primeira vez, um
caminho de criação **sem nenhum `User` autenticado envolvido** — o
Visitante nunca é um `User`.

Este ponto foi formalmente resolvido pela SPEC-011 (versão 1.1, seção
4.1.1, seção 6.1.2 e RN-054 a RN-060): existem dois modos válidos de
criação de `Candidate` — **criação interna** (`created_by_user_id`
obrigatório, `creation_origin = internal_user`) e **criação pública**
(`created_by_user_id` nulo, `creation_origin = public_application`
obrigatório). O Candidate criado por esta SPEC usa sempre o segundo modo:

- `created_by_user_id` é nulo;
- `creation_origin` é sempre `public_application`, nunca ausente;
- a criação nunca é atribuída a Platform Admin, `owner`, `admin` ou a
  qualquer usuário fictício ou "de sistema" (SPEC-011, RN-058);
- o Candidate resultante permanece isolado por Organization e nunca se
  torna `User` nem recebe `Membership` (SPEC-011, RN-059, RN-060).

Este mecanismo de autoria é o mesmo padrão conceitual já usado pela
Blueprint Version (Fase 15) para registros criados sem ator humano direto
(`created_source`) — reforçando consistência arquitetural entre módulos.

O mesmo padrão foi estendido pela SPEC-012 (v1.1, seção 4.1.1, seção
6.1.2, RN-074 a RN-080) para a `CandidateApplication` criada por esta
SPEC: `created_by_user_id` nulo, `source = public_portal` obrigatório,
sem atribuição a nenhum User, Platform Admin ou ator fictício. E pela
SPEC-011 (v1.2, seção 8.14.1, RN-061 a RN-065) para o `CandidateConsent`
registrado nesta SPEC: `source = public_application`, `created_by_user_id`
nulo. Os três contratos de autoria (Candidate, CandidateConsent,
CandidateApplication) seguem exatamente o mesmo princípio, sem exigir
nenhum ator inventado em nenhum dos três.

## 17. Confirmação de E-mail

Não há, em nenhuma ADR ou SPEC aprovada até o momento (ADR-0013, SPEC-011,
SPEC-012), qualquer definição de mecanismo de confirmação/verificação de
e-mail para `Candidate`. Esta SPEC não inventa um mecanismo técnico (OTP,
token, link de confirmação) sem base documental normativa.

**Decisão definitiva desta SPEC (v1): confirmação de e-mail NÃO é
pré-requisito obrigatório para criar a `CandidateApplication`.**

Motivos funcionais:

- reduz fricção na candidatura pública, consistente com o objetivo de
  baixa fricção já estabelecido pela seção 16;
- não existe infraestrutura normativa aprovada para OTP ou link de
  verificação em nenhuma ADR ou SPEC até o momento;
- a candidatura pública deve funcionar integralmente sem criar `User`
  (seção 16), e confirmação de e-mail tradicionalmente pressupõe algum
  mecanismo de conta;
- segurança contra duplicidade e abuso continua sendo responsabilidade do
  backend (normalização, unicidade, proteção contra enumeração — seções
  8.2 e 22), independentemente de o e-mail estar confirmado.

Uma Feature futura poderá introduzir verificação por link, OTP, confirmação
posterior à submissão, ou uma política configurável por Organization — não
implementada nem definida por esta SPEC.

### E-mail não confirmado

Mesmo sem confirmação, o e-mail informado deve, como já definido pela
seção 8.2: ser normalizado; ter seu formato validado; respeitar a
unicidade por Organization; ser protegido contra enumeração (seção 22);
ter sua concorrência tratada (seção 13); e respeitar a idempotência (seção
15).

O sistema nunca declara, para um e-mail sem confirmação, que ele está
"verificado". Esta SPEC distingue conceitualmente **e-mail informado**
(o único conceito usado por esta versão) de **e-mail confirmado/verificado**
(capacidade futura, ainda sem mecanismo definido) — os dois nunca devem ser
apresentados como equivalentes na interface ou na API.

## 18. Uploads e Segurança de Arquivos

Esta seção é registrada apenas como princípio para quando o suporte a
currículo (seção 9) existir, já que nenhum upload de arquivo é
implementado ou obrigatório nesta SPEC:

- todo arquivo deve ser validado no servidor, nunca confiando em extensão,
  MIME informado pelo navegador ou nome do arquivo;
- tipo permitido e tamanho máximo ficam para o planejamento técnico
  daquela extensão futura;
- verificação de malware/antivírus, quando aplicável, é um controle
  futuro;
- armazenamento deve ser privado, nunca uma URL pública permanente;
- todo acesso ao arquivo deve ser autorizado no servidor, nunca por
  simples posse de uma URL;
- nenhum currículo é servido publicamente sem autorização — mesmo
  princípio de proteção já aplicado pela ADR-0013 a "currículos,
  documentos, respostas".

## 19. LGPD e Dados Sensíveis

Reforço de princípios de produto (não é aconselhamento jurídico):

- **finalidade:** os dados coletados servem exclusivamente ao processo
  seletivo da Vaga e Organization indicadas;
- **necessidade e minimização:** nenhum dado é solicitado sem finalidade
  específica (seção 8.4);
- **transparência:** seção 10.1;
- **consentimento/fundamento adequado:** seção 10;
- **retenção:** segue a mesma política já aplicável ao `Candidate`
  (SPEC-011, RN-039, RN-040: sem exclusão automática nesta fase,
  anonimização fica para fase futura);
- **revogação:** seção 10.6;
- **isolamento:** seção 26.

### Dados sensíveis

A candidatura pública nunca solicita, sem justificativa legal específica e
fora do escopo desta SPEC: religião, orientação sexual, dado de saúde,
opinião política, dado biométrico ou dado equivalente sensível. Nenhum
campo sensível é usado para filtragem ou decisão automática (ver também
seção 20).

### Diversidade e não discriminação

A candidatura pública não introduz nenhum critério discriminatório
automático. Esta SPEC não cria ranking, score, "fit" ou reprovação
automática — reforço direto do que a SPEC-012 (seção "Fora do Escopo") e a
ADR-0023 (seção "Papel da IA") já proíbem para toda a jornada. Campos
demográficos, se algum dia existirem por necessidade legítima, exigem
finalidade e governança próprias, definidas por SPEC futura — nunca
introduzidos silenciosamente por esta SPEC.

## 20. IA e Pré-Entrevista (reforço de exclusão)

Nenhuma IA é usada nesta SPEC. Nenhuma chamada a `AIGateway`, a nenhum
Provider, a nenhum modelo ou ao Prompt Registry (ADR-0019) ocorre em
nenhum passo desta SPEC. IA desabilitada, indisponível ou inexistente não
altera absolutamente nada no comportamento da candidatura pública —
consistente com a ADR-0016 (IA nunca é requisito estrutural).

Nenhuma Pré-Entrevista é iniciada. Depois que a `CandidateApplication` é
criada, o sistema pode, futuramente (SPEC-021), apresentar a próxima etapa
— nesta SPEC, o único conteúdo apresentado é a mensagem "candidatura
recebida" (seção 21). Nenhum questionário é executado aqui.

## 21. Mensagens Públicas

### Mensagem de sucesso

Deve conter, conceitualmente:

- confirmação de que a candidatura foi recebida;
- identificação da Vaga;
- identificação da Empresa (Organization, em linguagem pública);
- indicação genérica de próximo passo (por exemplo, "a empresa entrará em
  contato" ou equivalente);
- informação de que eventuais etapas adicionais serão comunicadas
  oportunamente.

Nunca prometer, na mensagem de sucesso: aprovação, entrevista ou
contratação.

### Mensagens de falha

Devem ser seguras e genéricas para todos os cenários a seguir, sem revelar
qual é o motivo técnico exato quando isso representar risco de exposição
indevida (seção 22):

- Vaga encerrada, pausada ou cancelada;
- prazo (`application_deadline`) expirado;
- candidatura duplicada (`CandidateApplication` `active` já existente);
- dados inválidos (formato, tamanho, campo obrigatório ausente);
- arquivo inválido, quando aplicável (seção 18);
- `Candidate` inativo (seção 8.5) — mensagem idêntica à de qualquer outra
  candidatura não concluída;
- erro temporário do sistema.

Nunca expor: stack trace, SQL, IDs internos, status interno do
`Candidate`, ou qualquer indicação de existência indevida de dados de
outra pessoa.

## 22. Segurança Pública

### Proteção contra enumeração

A API pública nunca deve revelar, por meio de diferenças de resposta,
tempo de resposta perceptível ou mensagens diferentes: se um `Candidate`
já existe, se uma candidatura anterior existe, ou se um e-mail pertence a
uma pessoa já conhecida da Organization. A resposta pública ao Visitante
deve ser segura e uniforme para os cenários que não devem ser
diferenciáveis externamente; o servidor decide internamente o fluxo
correto (reutilizar `Candidate`, bloquear duplicidade, etc.) sem expor essa
decisão como informação diferenciada ao Visitante.

### Rate limiting

A candidatura pública precisa prever proteção conceitual contra abuso:
spam, bots, submissões repetidas, tentativas de enumeração. Esta SPEC não
define valores numéricos de limite — ficam para o planejamento técnico.

Rate limiting é um componente técnico comum da plataforma, não uma
capacidade exclusiva de IA — o endpoint público de candidatura precisa de
proteção por escopo relevante (por exemplo, por IP e por Vaga) da mesma
forma que qualquer outro endpoint público ou sensível, **independentemente
de qualquer módulo de IA estar habilitado, indisponível ou inexistente**
(reforço direto da seção 20: nenhuma dependência de IA nesta SPEC). A
infraestrutura técnica usada para essa proteção pode ser compartilhada com
a já existente na plataforma para outras finalidades, mas isso é decisão
de planejamento técnico, não desta SPEC.

### Anti-bot

Deve ser previsto um mecanismo futuro compatível com: rate limit, honeypot,
desafio/CAPTCHA quando necessário, e controles de comportamento. Esta SPEC
não escolhe nenhum provedor específico e não pode tornar a candidatura
inacessível para tecnologia assistiva (ver também seção 25).

### CSRF / origem

A ausência de autenticação não significa ausência de proteção. Uma
avaliação conceitual de proteção apropriada para um endpoint público
(validação de origem, proteção contra submissão forjada) deve ser prevista
para o planejamento técnico futuro. Detalhes técnicos exatos ficam fora
desta SPEC.

## 23. Analytics

O fluxo de candidatura pode registrar eventos agregados, reutilizando o
mesmo princípio já definido pela SPEC-019 (seção 12) para o Portal
Público:

- candidatura iniciada;
- candidatura concluída;
- abandono agregado (por exemplo, taxa de desistência entre o início e a
  conclusão do formulário).

Nunca registrar em analytics: conteúdo completo do formulário, currículo,
ou o consentimento completo como payload analítico. Analytics é sempre
agregado e nunca identifica um Visitante ou `Candidate` individualmente —
mesmo princípio de proteção de dados já exigido pela SPEC-019.

## 24. Auditoria

Eventos conceituais desta SPEC:

- `public_application.started`, quando aplicável (início de uma
  submissão rastreável);
- `public_application.completed`;
- `public_application.denied` (Vaga inválida, consentimento ausente,
  dados inválidos, etc.);
- `candidate.created_from_public_application`;
- `candidate.existing_reused_from_public_application`;
- `candidate.consent_registered` (mesmo evento conceitual já previsto pela
  SPEC-011, aplicado a esta origem);
- `candidate_application.duplicate_blocked`;
- `candidate_application.cross_organization_attempt_denied`;
- `public_application.denied_inactive_candidate` (registro interno e
  minimizado do bloqueio descrito na seção 8.5, visível apenas para
  owner/admin — nunca exposto ao Visitante).

`candidate.created_from_public_application` deve registrar, no mínimo:
origem pública (`creation_origin = public_application`); Organization; Job
Opening associada; timestamp; a ação realizada (criação ou reutilização).
Este evento nunca atribui a criação a Platform Admin, `owner`, `admin` ou a
qualquer ator fictício ou "de sistema" — consistente com SPEC-011, RN-058
(v1.1).

`candidate_application.created`, gerado por esta SPEC, registra `source =
public_portal` (SPEC-012, RN-074 a RN-080, v1.1) e nunca atribui a criação
a um `User`, Platform Admin ou ator fictício. O registro de consentimento
correspondente registra `source = public_application` (SPEC-011, RN-061 a
RN-065, v1.2), com a mesma garantia.

Regras, herdadas do padrão já estabelecido pela SPEC-011 (seção 15) e pela
SPEC-012 (seção "Auditoria"):

- nunca registrar dado pessoal completo (perfil completo, e-mail completo
  quando evitável, endereço completo, telefone completo);
- nunca registrar currículo;
- nunca registrar o conteúdo completo do consentimento (apenas seu
  status, finalidade e metadados);
- nunca registrar o conteúdo completo do formulário submetido;
- nunca registrar token, header, segredo;
- falha de auditoria crítica na criação de `Candidate` ou
  `CandidateApplication` causa rollback (mesmo padrão já exigido pela
  SPEC-011 e pela SPEC-012).

## 25. DTOs e IDs Públicos

### DTO público de entrada

Princípio de allow-list: o servidor aceita somente os campos
explicitamente permitidos por esta SPEC (seção 8.4) e pela SPEC-011.
Bloquear explicitamente qualquer tentativa de mass assignment de:

- `id`;
- `organization_id`;
- `status` (de `Candidate` ou de `CandidateApplication`);
- `active`;
- `created_by`/`created_by_user_id`;
- `creation_origin` (SPEC-011, seção 4.1.1) — sempre definido pelo
  servidor como `public_application` neste fluxo, nunca aceito do cliente;
- `updated_by`/`updated_by_user_id`;
- timestamps de qualquer entidade;
- status de consentimento definido manualmente pelo cliente (o status
  inicial de um novo consentimento é sempre definido pelo servidor a
  partir da ação do Visitante, nunca aceito como valor livre);
- `application_status`;
- `current_stage`;
- dados de finalização (`finalization_reason`, etc.);
- notas internas;
- score, ranking ou qualquer campo equivalente (que, aliás, não existe em
  nenhuma entidade aprovada — reforço de que não deve ser criado aqui).

A chave de idempotência (seção 15) **nunca** é um campo do corpo/DTO de
dados pessoais — é transportada exclusivamente como cabeçalho HTTP
(`Idempotency-Key`), fora do escopo da allow-list de dados funcionais
acima. Misturar os dois conceitos (metadado técnico de transporte e dado
pessoal do formulário) não é permitido.

### DTO público de saída

A resposta ao Visitante nunca retorna o `Candidate` completo. Deve conter,
no mínimo:

- confirmação de sucesso ou falha segura;
- um identificador de acompanhamento, quando necessário (ver "IDs
  públicos" abaixo), nunca um ID interno previsível;
- estado seguro da submissão (por exemplo, "recebida").

Nunca expor na resposta pública: `Candidate.id` interno, `CandidateApplication.id`
interno quando não estritamente necessário, `organization_id`, registros
de consentimento, status interno do `Candidate`, notas internas, dados de
auditoria.

### IDs públicos

Se uma experiência futura precisar de um identificador de acompanhamento
para o Visitante (por exemplo, para consultar o status de sua candidatura
sem autenticação completa), esse identificador nunca deve ser um ID
interno previsível. Esta SPEC registra apenas a necessidade conceitual de
um identificador público/opaco — mesmo princípio já aplicado pela SPEC-010
ao `public_slug` de Vaga — sem definir seu mecanismo físico.

## 26. Multiempresa

Toda operação desta SPEC deriva a Organization exclusivamente da Vaga
Pública já resolvida pelo Portal Público (SPEC-019) — nunca de um
`organization_id` enviado livremente pelo formulário público. Um
`organization_id` recebido do cliente nunca é aceito como prova de
pertencimento, mesmo princípio já estabelecido pela ADR-0020 ("o
identificador enviado pelo cliente nunca prova pertencimento ou
permissão") e por toda SPEC anterior.

`Candidate` e `CandidateApplication` originados por esta SPEC são sempre
criados dentro da Organization dona da Vaga, nunca em outra. Nenhuma
identificação de `Candidate` existente (seção 8) atravessa Organizations,
em nenhuma circunstância.

## 27. Vaga, Versão e Blueprint

### Vaga e versão referenciada

A `CandidateApplication` criada por esta SPEC deve referenciar exatamente,
como já exigido pela SPEC-012 (RN-002, RN-003, RN-008): a `Job Opening` e a
`Job Opening Version` **publicada** correspondente ao contexto exato da
candidatura (a versão pública vigente no momento da submissão, revalidada
no submit — seção 11.2). Mudança posterior na Vaga nunca reinterpreta essa
candidatura já criada (SPEC-012, RN-010, RN-016).

### Blueprint

Esta SPEC não executa nenhuma análise de Blueprint Organizacional. Pode,
quando a arquitetura de versionamento do Blueprint (ADR-0022) já
especificar esse mecanismo para módulos futuros, preservar uma referência
contextual à Blueprint Version vigente no momento da candidatura — como já
antecipado, de forma prospectiva e sem implementação, pela ADR-0022 (seção
"Snapshot e referência histórica": "`CandidateApplication` futura pode
preservar referência contextual ao Blueprint quando necessário"). Esta
SPEC não decide o mecanismo físico dessa referência agora, e o Blueprint
nunca é usado para decidir, filtrar ou influenciar automaticamente o
resultado da candidatura.

## 28. Permissões

| Ação | Platform Admin | owner | admin | member | Visitante |
| --- | :---: | :---: | :---: | :---: | :---: |
| Iniciar/submeter candidatura pública | Não | Não necessário | Não necessário | Não necessário | Sim |
| Consultar candidatura recém-criada (confirmação) | Não | — | — | — | Sim (resposta imediata da submissão) |
| Operar `Candidate`/`CandidateApplication` internamente após a criação | Ver SPEC-011/SPEC-012 | Ver SPEC-011/SPEC-012 | Ver SPEC-011/SPEC-012 | Ver SPEC-011/SPEC-012 | Não |
| Aprovar/reprovar candidatura | Não | Ver SPEC-012 | Ver SPEC-012 | Não | Não |
| Leitura administrativa auditada | Sim (com motivo) | Não | Não | Não | Não |

### Platform Admin (SuperAdmin)

Não participa funcionalmente da candidatura pública. Não cria `Candidate`
via fluxo público em nome de uma pessoa. Não aprova nem reprova. Leitura
administrativa excepcional permanece exatamente conforme já definida pela
SPEC-011 e SPEC-012 (com motivo e auditoria).

### Owner, Admin, Member

Nenhum é necessário para o Visitante submeter a candidatura pública. Suas
permissões continuam relevantes apenas para a operação interna posterior
(consultar, mover no pipeline, finalizar — SPEC-012), sem nenhuma
alteração introduzida por esta SPEC.

## 29. Banco Conceitual

Sem schema físico, sem migration. Esta SPEC descreve apenas como o fluxo
público se integra às estruturas já conceitualmente definidas:

- `candidates` (SPEC-011) — recebe o novo `Candidate` ou é apenas
  consultada quando reutilizado;
- `candidate_consents` (SPEC-011) — recebe o novo registro de
  consentimento;
- `candidate_applications` (SPEC-012) — recebe a nova
  `CandidateApplication`;
- `job_openings` / `job_opening_versions` (SPEC-010) — apenas consultadas
  para validar a Vaga;
- futura estrutura de upload/currículo, quando existir (seção 9) — fora
  do escopo desta SPEC.

Esta SPEC não propõe nenhuma tabela nova. Os três contratos de autoria
envolvidos estão integralmente formalizados pelas SPECs que definem cada
entidade, não por esta SPEC:

- `Candidate` (`created_by_user_id` nulo, `creation_origin =
  public_application`) — SPEC-011 v1.2, seção 4.1.1, seção 8.1;
- `CandidateConsent` (`created_by_user_id` nulo, `source =
  public_application`) — SPEC-011 v1.2, seção 8.14.1;
- `CandidateApplication` (`created_by_user_id` nulo, `source =
  public_portal`) — SPEC-012 v1.1, seção 4.1.1, seção 9.1.

Nenhuma coluna física ou migration é criada por nenhuma das três SPECs.

## 30. API Conceitual

| Operação | Finalidade |
| --- | --- |
| Obter configuração pública da candidatura para uma Vaga | Retornar quais campos são solicitados para aquela Vaga/Organization, sem dado interno. |
| Submeter candidatura | Executar o fluxo atômico da seção 12 (validar Vaga, identificar/criar Candidate, registrar consentimento, criar CandidateApplication). |

Esta SPEC não define endpoints finais obrigatórios (nomes de rota exatos)
nem expõe nenhuma API administrativa. Toda operação deve validar no
servidor: a Vaga resolvida (nunca um `organization_id` do cliente), o
consentimento informado, e os dados enviados contra o DTO de entrada
(seção 25).

## 31. Interface Conceitual

```text
Vaga (Página Pública, SPEC-019)
↓
"Quero me candidatar"
↓
Dados pessoais mínimos
↓
Currículo (quando disponível — seção 9)
↓
Consentimentos
↓
Revisão
↓
Enviar candidatura
↓
Confirmação
```

Sem layout detalhado. A interface deve ser responsiva e acessível (seção
32) e nunca deve ser a única camada de validação — o servidor permanece a
autoridade final (mesmo princípio já reforçado pela SPEC-010 e SPEC-019).

## 32. Acessibilidade e Performance

### Acessibilidade

- rótulos (`labels`) associados a cada campo;
- mensagens de erro associadas ao campo correspondente, não apenas a um
  resumo genérico no topo;
- navegação por teclado e gerenciamento de foco adequados;
- contraste adequado;
- compatibilidade com leitores de tela;
- upload acessível, quando existir;
- textos de consentimento compreensíveis, não apenas juridicamente
  corretos.

Referência a WCAG sem fixar um nível numérico específico, pelo mesmo
motivo já registrado pela SPEC-019 (seção 19): ausência de padrão
normativo próprio definido até o momento.

### Performance e recuperação de erro

- o fluxo deve funcionar adequadamente em dispositivos móveis e conexões
  limitadas, consistente com os canais de acesso já previstos pela
  SPEC-019 (predominantemente móveis);
- upload, quando existir, não deve bloquear desnecessariamente a
  experiência;
- se um upload ou a submissão falhar, o reenvio não deve induzir
  duplicação (ligação direta com a idempotência, seção 15) — o
  planejamento técnico futuro deve considerar isso explicitamente.

## 33. Critérios de Aceite

1. CA-001: Vaga Pública válida aceita candidatura.
2. CA-002: Vaga sem divulgação pública ativa bloqueia a candidatura.
3. CA-003: Vaga `paused`, `closed` ou `cancelled` bloqueia a candidatura.
4. CA-004: Vaga com `application_deadline` expirado bloqueia a
   candidatura.
5. CA-005: Organization arquivada bloqueia a candidatura.
6. CA-006: `Candidate` novo é criado corretamente quando não existe
   correspondência na Organization.
7. CA-007: `Candidate` existente na mesma Organization é reutilizado, sem
   duplicidade.
8. CA-008: `Candidate` de outra Organization nunca é reutilizado, mesmo
   com e-mail idêntico.
9. CA-009: E-mail é normalizado antes de qualquer comparação ou
   persistência.
10. CA-010: Concorrência com o mesmo e-mail nunca cria dois `Candidate`.
11. CA-011: `CandidateApplication` `active` duplicada é bloqueada,
    respeitando SPEC-012 RN-011.
12. CA-012: `CandidateApplication` referencia exatamente a `Job Opening`
    e a `Job Opening Version` publicada vigente no momento da submissão.
13. CA-013: Consentimento operacional obrigatório ausente bloqueia a
    conclusão da candidatura.
14. CA-014: Consentimento inválido (`pending`, `revoked`, `expired`)
    bloqueia a conclusão.
15. CA-015: Consentimento anterior é sempre revalidado, nunca inferido
    automaticamente como válido.
16. CA-016: Nenhuma chamada de IA ocorre em nenhum passo desta SPEC.
17. CA-017: Nenhuma Pré-Entrevista é executada ou iniciada.
18. CA-018: Nenhum score, ranking ou "fit" é produzido.
19. CA-019: Tentativa de mass assignment de campos protegidos (seção 25)
    é bloqueada.
20. CA-020: Nenhum ID interno é exposto na resposta pública.
21. CA-021: Currículo não é exigido para concluir a candidatura (SPEC-011
    ainda não define suporte a currículo).
22. CA-022: Auditoria nunca registra PII completa nem currículo.
23. CA-023: Proteção conceitual de rate limiting está prevista.
24. CA-024: Reenvio da mesma submissão não duplica `Candidate`,
    `CandidateApplication` ou consentimento (idempotência).
25. CA-025: O servidor revalida a Vaga no momento do envio final, não
    apenas na abertura do formulário.
26. CA-026: Falha crítica durante a submissão causa rollback total, sem
    `CandidateApplication` parcial.
27. CA-027: Toda operação deriva a Organization exclusivamente da Vaga
    resolvida, nunca de `organization_id` enviado pelo cliente.
28. CA-028: `Candidate` inativo correspondente ao e-mail informado nunca
    é reutilizado nem reativado silenciosamente.
29. CA-029: Owner, Admin e Member não são necessários para o Visitante
    concluir a submissão.
30. CA-030: Platform Admin não opera funcionalmente o fluxo de
    candidatura pública.
31. CA-031: Mensagens públicas de erro nunca expõem detalhe técnico
    interno nem diferenciam indevidamente cenários sensíveis (seção 22).
32. CA-032: Dados de candidatura persistem após recriar a aplicação.
33. CA-033: Revogação de consentimento após a candidatura nunca apaga
    automaticamente o histórico nem altera retroativamente a
    `CandidateApplication`.
34. CA-034: O fluxo completo funciona integralmente com a infraestrutura
    de IA desabilitada ou inexistente.
35. CA-035: `Candidate` nunca é tratado como `User`; nenhuma Membership é
    criada pelo fluxo público.
36. CA-036: `Candidate` inativo nunca recebe nova `CandidateApplication`
    enquanto permanecer `inactive`, e seu `status` nunca é alterado como
    efeito colateral da tentativa de candidatura pública.
37. CA-037: `Candidate` criado por esta SPEC sempre possui
    `created_by_user_id` nulo e `creation_origin = public_application`
    (SPEC-011, RN-054 a RN-057).
38. CA-038: Nenhuma criação de `Candidate` por esta SPEC é atribuída a
    Platform Admin, `owner`, `admin` ou a usuário fictício/de sistema.
39. CA-039: `CandidateApplication` finalizada nunca é reaberta; toda
    reaplicação cria uma `CandidateApplication` nova, com novo `id` e novo
    `applied_at`.
40. CA-040: Reaplicação após `withdrawn` é permitida quando a Vaga
    continua apta.
41. CA-041: Reaplicação após `rejected` é bloqueada nesta primeira versão.
42. CA-042: Reaplicação após `hired` é bloqueada.
43. CA-043: A candidatura pública é concluída com sucesso sem exigir
    confirmação/verificação de e-mail.
44. CA-044: Nenhuma resposta da API ou da interface declara um e-mail
    informado como "verificado" ou "confirmado".
45. CA-045: Tentativa de mass assignment de `creation_origin` ou
    `created_by_user_id` (de `Candidate`) é bloqueada.
46. CA-046: Reaplicação após `cancelled` é bloqueada nesta primeira
    versão, de forma determinística, sem interpretar `finalization_reason`.
47. CA-047: `CandidateConsent` registrado por esta SPEC possui `source =
    public_application` e pode possuir `created_by_user_id` nulo
    (SPEC-011 v1.2).
48. CA-048: `CandidateApplication` criada por esta SPEC possui `source =
    public_portal` e pode possuir `created_by_user_id` nulo (SPEC-012
    v1.1).
49. CA-049: Nenhuma criação de `CandidateConsent` ou `CandidateApplication`
    por esta SPEC é atribuída a Platform Admin, `owner`, `admin` ou a
    usuário fictício/de sistema.
50. CA-050: Tentativa de mass assignment de `created_by_user_id` ou
    `source` de `CandidateApplication`, ou de `created_by_user_id` de
    `CandidateConsent`, é bloqueada.
51. CA-051: `Idempotency-Key` é tratada exclusivamente como cabeçalho
    HTTP, nunca como campo do corpo/DTO de dados pessoais.
52. CA-052: O rate limiting do endpoint público funciona
    independentemente de qualquer módulo de IA estar habilitado,
    indisponível ou inexistente.

## 34. Testes Obrigatórios

Quando esta SPEC for implementada, os testes devem comprovar, no mínimo:

### Vaga

1. candidatura aceita para Vaga pública válida;
2. candidatura bloqueada para Vaga privada (sem divulgação pública);
3. candidatura bloqueada para Vaga fechada;
4. candidatura bloqueada para Vaga cancelada;
5. candidatura bloqueada para Vaga com prazo expirado;
6. Vaga alterada (pausada/encerrada) entre abertura do formulário e
   submissão bloqueia a criação no submit.

### Candidate

7. criação de `Candidate` novo;
8. reutilização de `Candidate` existente na mesma Organization;
9. `Candidate` inativo nunca reutilizado nem reativado silenciosamente;
10. e-mail concorrente não duplica `Candidate`;
11. `Candidate` de outra Organization nunca é reutilizado
    (cross-Organization);
12. `Candidate` inativo nunca recebe nova `CandidateApplication` enquanto
    permanecer `inactive`;
13. tentativa de candidatura pública para `Candidate` inativo não altera
    seu `status`;
14. `Candidate` reativado por owner/admin volta a poder participar de novo
    fluxo público.

### Criação pública (autoria)

15. `Candidate` criado por esta SPEC possui `created_by_user_id` nulo;
16. `Candidate` criado por esta SPEC possui `creation_origin =
    public_application`;
17. nenhum `User` é criado pelo fluxo público;
18. nenhuma `Membership` é criada pelo fluxo público;
19. tentativa de atribuir a criação a Platform Admin, `owner`, `admin` ou
    usuário fictício/de sistema é impossível pelo fluxo público;
20. `CandidateConsent` registrado por esta SPEC possui `source =
    public_application` e `created_by_user_id` nulo (SPEC-011 v1.2);
21. `CandidateApplication` criada por esta SPEC possui `source =
    public_portal` e `created_by_user_id` nulo (SPEC-012 v1.1);
22. tentativa de mass assignment de `created_by_user_id` ou `source` de
    `CandidateApplication`, ou de `created_by_user_id` de
    `CandidateConsent`, é bloqueada;
23. tentativa de combinar `source = public_portal` com
    `created_by_user_id` preenchido é recusada.

### CandidateApplication

24. criação bem-sucedida referenciando Job Opening e versão publicada
    corretas;
25. candidatura duplicada (`active` já existente) é bloqueada;
26. concorrência de duas submissões para a mesma Vaga e mesmo Candidate
    nunca cria duas `CandidateApplication` `active`;
27. rollback completo quando qualquer etapa crítica falha.

### Reaplicação

28. reaplicação após `withdrawn` cria nova `CandidateApplication` quando a
    Vaga continua apta;
29. reaplicação após `cancelled` é bloqueada nesta primeira versão, de
    forma determinística, sem interpretar `finalization_reason`;
30. reaplicação após `rejected` é bloqueada nesta primeira versão;
31. reaplicação após `hired` é bloqueada;
32. candidatura finalizada nunca é reaberta ou alterada por uma nova
    tentativa;
33. duas tentativas simultâneas de reaplicação nunca duplicam
    `CandidateApplication` `active`.

### E-mail

34. candidatura pública é concluída sem exigir confirmação de e-mail;
35. nenhuma resposta declara o e-mail como "verificado" ou "confirmado".

### Consentimento

36. consentimento `granted` permite a conclusão;
37. consentimento `pending` bloqueia a conclusão;
38. consentimento `revoked` bloqueia a conclusão;
39. consentimento `expired` bloqueia a conclusão;
40. finalidade do consentimento é registrada corretamente;
41. novo consentimento é registrado com metadados completos;
42. consentimento anterior é revalidado, nunca assumido como válido.

### Segurança

43. tentativa de enumeração de e-mail não produz resposta diferenciada
    indevida;
44. mass assignment de campos protegidos é bloqueado, incluindo
    `creation_origin` e `created_by_user_id`;
45. nenhuma PII completa é registrada em auditoria;
46. nenhum ID interno é exposto na resposta pública;
47. upload inválido é recusado (quando o recurso existir);
48. proteção conceitual de rate limit está prevista, e funciona
    independentemente de qualquer módulo de IA estar habilitado,
    indisponível ou inexistente;
49. proteção conceitual anti-bot está prevista.

### IA

50. nenhuma chamada a `AIGateway`, provider, modelo ou Prompt Registry
    ocorre em nenhum teste desta SPEC.

### Pré-Entrevista

51. nenhuma pergunta de Pré-Entrevista é criada ou apresentada.

### Multiempresa

52. isolamento total: nenhuma operação cruza Organizations, mesmo com
    manipulação de identificador.

### Idempotência

53. reenvio da mesma submissão não duplica `Candidate`,
    `CandidateApplication` ou consentimento;
54. `Idempotency-Key` é lida do cabeçalho HTTP, nunca de um campo do
    corpo/DTO de dados pessoais;
55. duas requisições com a mesma `Idempotency-Key` produzem o mesmo
    resultado seguro, sem duplicar dados;
56. a mesma `Idempotency-Key` usada para Vagas diferentes não é tratada
    como a mesma submissão.

### Auditoria

57. eventos obrigatórios (seção 24) são registrados corretamente,
    incluindo `candidate.created_from_public_application` com
    `creation_origin` e sem atribuição a ator fictício;
58. `candidate_application.created` registra `source = public_portal` sem
    atribuição a ator fictício;
59. nenhum conteúdo sensível completo é registrado.

Esta SPEC não implementa os testes acima — apenas os especifica.

## 35. Limitações Conhecidas

- Esta SPEC não implementa código, banco, migrations, rotas, APIs, testes
  ou dependências.
- Currículo/upload de arquivo ainda depende de uma extensão futura da
  SPEC-011 (ou SPEC própria de anexos) — não implementado nem exigido
  aqui.
- Confirmação/verificação de e-mail é uma decisão definitiva de **não
  exigir** nesta v1 (seção 17); o mecanismo físico de uma futura
  verificação (OTP, link, política configurável) não é definido nesta
  SPEC.
- Valores numéricos de rate limit não são definidos nesta SPEC — apenas
  que a proteção deve existir e não depende de IA.
- Provedor de anti-bot não é definido nesta SPEC.
- Mecanismo físico de persistência da idempotência (tabela, hash da
  chave) não é definido nesta SPEC — apenas que a chave é transportada
  como cabeçalho HTTP (seção 15).
- Acompanhamento futuro completo da candidatura pelo próprio candidato
  (portal autenticado) está fora do escopo.
- Pré-Entrevista pertence exclusivamente à SPEC-021.
- A política de reaplicação após `rejected` (seção 14) é deliberadamente
  conservadora (bloqueada) nesta primeira versão, até que exista política
  configurável por Organization.
- A política de reaplicação após `cancelled` (seção 14) é bloqueada nesta
  primeira versão, de forma determinística, até que exista classificação
  estruturada do motivo de cancelamento (por exemplo, um
  `cancellation_reason_code` canônico) que permita reabrir essa decisão
  com segurança.
- A consistência entre a política de reaplicação do canal público (seção
  14) e o fluxo de criação interna de `CandidateApplication` (SPEC-012,
  seção 6.1.1) não foi verificada nem alinhada nesta revisão — fica como
  observação não bloqueante para uma revisão futura da SPEC-012.
- O contrato físico de `creation_origin`, do `source` de autoria pública
  em `CandidateConsent` e do `source = public_portal` em
  `CandidateApplication` (nomes de coluna, migrations, constraints) ainda
  não existe; a SPEC-011 v1.2 e a SPEC-012 v1.1 definem apenas o contrato
  conceitual.
- SPEC-012 não reavalia, nesta revisão, se outros valores de `source`
  hoje em uso pela criação interna (por exemplo, `import`) também podem,
  em algum cenário real, carecer de um User responsável — isso permanece
  como observação para uma revisão futura e própria da SPEC-012, não
  resolvida aqui para evitar uma constraint excessivamente rígida sem
  necessidade comprovada.

## 36. Definição de Concluído

Para a implementação futura desta SPEC:

- SPEC aprovada antes do desenvolvimento;
- os pontos revisados nas duas rodadas de saneamento (autoria pública de
  Candidate, CandidateConsent e CandidateApplication; Candidate inativo;
  reaplicação determinística por status anterior, incluindo `cancelled`;
  confirmação de e-mail; idempotência via cabeçalho HTTP; rate limiting
  independente de IA) permanecem consistentes com a SPEC-011 v1.2 e a
  SPEC-012 v1.1 no momento da implementação — qualquer nova ambiguidade
  descoberta durante a implementação deve ser tratada como revisão
  própria, não corrigida silenciosamente;
- nenhuma regra já aprovada pela SPEC-010, SPEC-011 ou SPEC-012 foi
  redefinida ou contradita;
- critérios de aceite atendidos;
- testes obrigatórios implementados e passando;
- testes de segurança, LGPD e multiempresa passando;
- testes de concorrência e idempotência passando;
- rollback de transação crítica verificado;
- migrations reproduzíveis quando houver banco;
- lint passando;
- formatação passando;
- build passando;
- documentação atualizada;
- auditoria revisada;
- nenhuma funcionalidade das SPEC-021 a SPEC-024 implementada
  antecipadamente;
- commit realizado.
