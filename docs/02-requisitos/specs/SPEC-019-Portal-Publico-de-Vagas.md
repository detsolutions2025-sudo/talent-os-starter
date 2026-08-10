# SPEC-019 - Portal Público de Vagas

**Status:** Em revisão
**Versão:** 0.1
**Fase:** 16
**Responsável de negócio:** Thiago Sousa
**Última atualização:** 2026-08-09
**Dependências:** SPEC-001 - Organization, SPEC-010 - Vagas, SPEC-018 - Blueprint Organizacional / Implantação Guiada, ADR-0020, ADR-0021, ADR-0022, ADR-0023

## 1. Objetivo

Definir a especificação funcional completa do Portal Público de Vagas: a
superfície pública pela qual uma Organization divulga suas Vagas abertas e
publicadas, com identidade institucional opcional vinda do Blueprint
Organizacional, otimizada para descoberta (SEO), compartilhamento (Open
Graph, redes sociais, link direto, QR Code) e leitura por qualquer visitante,
sem exigir autenticação.

Esta SPEC formaliza o que a `JORNADA-DO-SISTEMA.md` (seção 10) já descrevia em
nível de produto e o que a ADR-0023 (seção "Portal Público") já delimitava
como fora do seu próprio escopo, remetendo explicitamente para uma SPEC
futura: "esta ADR não define a página pública renderizada, os canais de
divulgação ou a mecânica técnica do Portal Público. Isso fica para SPEC
futura." Esta é essa SPEC.

O Portal Público é exclusivamente responsável pela divulgação de vagas. Ele:

- **não** realiza candidatura;
- **não** cria `Candidate`;
- **não** cria `CandidateApplication`;
- **não** executa IA;
- **não** executa Pré-Entrevista.

Esta SPEC termina exatamente no momento em que o visitante pressiona o botão
"Quero me candidatar". A continuação pertence à SPEC-020 (Candidatura
Pública).

Esta SPEC **não redefine** nenhuma regra já aprovada pela SPEC-010 sobre
divulgação pública de Vaga (`is_public`, `public_slug`,
`application_deadline`, exibição condicional de faixa salarial, imutabilidade
de slug, eventos de auditoria de publicação/despublicação). Ela **referencia**
essas regras e constrói, sobre elas, a experiência pública agregada por
Organization (o Portal em si), SEO, Open Graph, compartilhamento, conteúdo
institucional do Blueprint, analytics anônimo, performance e acessibilidade.

## 2. Fora do Escopo

- Implementar código, banco, migrations, rotas, APIs, testes ou dependências.
- Cadastro de candidato.
- Criação de `Candidate`.
- Criação de `CandidateApplication`.
- Candidatura pública (o formulário e o envio da candidatura em si).
- Pré-Entrevista Estruturada.
- DISC.
- Perfil Comportamental.
- Qualquer execução de Inteligência Artificial.
- Dossiê Inteligente.
- Entrevista (`Interview`).
- Redefinir estados operacionais de Vaga, transições, permissões de
  publicação/abertura/pausa/encerramento/cancelamento ou o modelo de
  `is_public`/`public_slug`/`application_deadline` já aprovados pela SPEC-010.
- Redefinir o Blueprint Organizacional, seu ciclo de vida ou seu versionamento
  (já definidos por ADR-0021, ADR-0022 e SPEC-018).
- Definir domínio customizado, marca branca ou identidade visual customizável
  por Organization.
- Definir formulário de contato, chat, notificações ou qualquer canal de
  comunicação direta entre visitante e Organization.
- Excluir fisicamente qualquer dado.

Esses assuntos pertencem à SPEC-020 (Candidatura Pública), SPEC-021
(Pré-Entrevista Estruturada), SPEC-022 (Perfil Comportamental), SPEC-023
(Pré-Análise Assistida por IA), SPEC-024 (Dossiê Inteligente do Candidato),
ou a ADRs/SPECs de infraestrutura já aprovadas (SPEC-010, ADR-0021/0022).

## 3. Usuários Envolvidos

- **Visitante:** qualquer pessoa que acessa o Portal Público ou a Página
  Pública de uma Vaga sem autenticação. Nunca é um `User` da plataforma nesta
  SPEC.
- **owner:** configura o Portal Público da Organization (quais componentes do
  Blueprint são exibidos publicamente) e configura a divulgação pública de
  cada Vaga, dentro do que a SPEC-010 já autoriza.
- **admin:** configura o Portal Público e a divulgação pública de Vagas já
  abertas e publicadas, dentro do que a SPEC-010 já autoriza para este papel;
  não publica versão de Vaga nem abre Vaga (SPEC-010, seção 15).
- **member:** não possui papel especial no Portal Público além do que já
  possui sobre a Vaga internamente (SPEC-010).
- **Platform Admin (SuperAdmin):** consulta o Portal Público apenas em
  contexto administrativo auditado, com motivo, sem operar funcionalmente
  (mesmo padrão de todas as ADRs e SPECs anteriores).

`Platform Admin` não é Role de Membership e não recebe permissões funcionais
de `owner`, `admin` ou `member` dentro da Organization (ADR-0003, ADR-0020).

## 4. Conceitos

### Portal Público

Superfície pública de uma Organization: a agregação, voltada a qualquer
visitante sem autenticação, das Vagas dessa Organization que estão `open` e
com divulgação pública ativa (`is_public = true`, SPEC-010), acrescida de
conteúdo institucional opcional vindo do Blueprint Organizacional (seção 8).

O Portal Público não é uma cópia de dados: ele é a leitura conceitual
combinada de Organization (SPEC-001), Vagas públicas (SPEC-010) e Blueprint
Version ativa (SPEC-018, ADR-0022), com uma camada própria e mínima de
configuração de exibição (seção 21).

### Página Pública

A página pública individual de **uma** Vaga, acessível pelo `public_slug`
já definido pela SPEC-010. É onde o visitante lê o conteúdo completo da Vaga
e decide pressionar "Quero me candidatar". O Portal Público é a porta de
entrada; a Página Pública é o destino de cada Vaga específica.

### Slug

Esta SPEC não cria um novo conceito de slug. Reutiliza dois já existentes:

- o `slug` da Organization (SPEC-001, já definido como "identificador textual
  simplificado, usado para referência interna ou futura composição de URLs");
- o `public_slug` da Vaga (SPEC-010, seção 4.5 e seção 14), único, sem IDs
  internos, imutável após a primeira divulgação pública.

### URL Canônica

A URL pública definitiva de uma Página Pública, combinando conceitualmente a
identidade pública da Organization (seu `slug`, SPEC-001) e o `public_slug`
da Vaga (SPEC-010) — nunca contém identificador interno (`id` de
Organization, Vaga, versão, Blueprint ou qualquer outra entidade). Esta SPEC
não define o formato exato de composição da URL (isso é detalhe de rota,
fora do escopo conceitual), apenas exige que ela seja: única, estável,
imutável enquanto a Vaga permanecer publicada, e reconstruível apenas a
partir dos dois slugs já existentes.

### Compartilhamento

Ação de divulgar a URL Canônica de uma Vaga por um canal externo (rede
social, mensageiro, QR Code ou cópia direta do link). Compartilhar nunca gera
uma URL alternativa: todo canal compartilha exatamente a mesma URL Canônica
(seção 10).

### SEO

Conjunto de metadados e práticas que tornam a Página Pública descobrível e
corretamente apresentada por mecanismos de busca (seção 9).

### Open Graph

Conjunto de metadados usados por redes sociais e aplicativos de mensagem para
pré-visualizar um link compartilhado (título, descrição, imagem) sem a
necessidade de acessar a página (seção 9).

### Vaga Pública

Vaga cuja versão publicada está com divulgação pública ativa
(`is_public = true`) e cujo estado operacional é `open` — exatamente a
definição já estabelecida pela SPEC-010 (seção 14: "apenas Vaga `open` pode
ficar pública").

### Vaga Encerrada

Para os fins do Portal Público, uma Vaga deixa de ser uma Vaga Pública quando
sai do estado `open` (por pausa, encerramento ou cancelamento, SPEC-010
seção 13) ou quando seu `application_deadline` expira (SPEC-010, RN-069).
Esta SPEC reutiliza esse conceito sem alterá-lo; a seção 11 desta SPEC define
apenas o comportamento de leitura pública nesse cenário.

### Empresa

Termo público, orientado ao visitante, para se referir à Organization. É o
mesmo registro de dados da `Organization` (SPEC-001); "Empresa" é apenas a
palavra usada na experiência pública, nunca "Organization", "tenant" ou
qualquer termo técnico interno.

### Blueprint Version

Já definida pela ADR-0022 e pela SPEC-018: a versão `active` vigente do
Blueprint Organizacional de uma Organization — manifesto agregado e
imutável do contexto organizacional. O Portal Público consome
exclusivamente a Blueprint Version `active`, nunca uma `draft`, nunca uma
`archived` (seção 8).

### Organização

Sinônimo de `Organization` (SPEC-001) usado nesta SPEC quando o contexto é a
entidade de dados, em vez do termo público "Empresa" (usado na experiência
voltada ao visitante).

## 5. Regras Gerais

- Toda Vaga Pública possui uma URL Canônica.
- A URL Canônica é imutável enquanto a Vaga permanecer com o mesmo
  `public_slug` — consistente com a SPEC-010 (RN-075: "depois da primeira
  publicação pública, o slug não pode ser alterado nesta fase").
- O `public_slug` da Vaga é único, conforme já garantido pela SPEC-010
  (RN-074).
- O `public_slug` nunca é reaproveitado por outra Vaga, mesmo após retirada,
  encerramento ou cancelamento — consistente com a SPEC-010 (RN-075: "slugs
  antigos não são reutilizados... o slug permanece reservado após retirada,
  encerramento ou cancelamento").
- Alterar o `title` interno da Vaga (SPEC-010, RN-056) ou o `public_title` de
  uma nova versão nunca quebra a URL Canônica de uma Vaga já publicada
  publicamente, porque a URL depende apenas do `public_slug`, nunca do
  título.
- Toda Página Pública deve declarar sua Canonical URL nos metadados de SEO
  (seção 9), mesmo quando acessada por um caminho alternativo (por exemplo,
  parâmetros de rastreamento de campanha).
- Esta SPEC não altera, em nenhuma hipótese, as regras de imutabilidade e
  unicidade de slug já definidas pela SPEC-010.

## 6. Publicação

Esta seção é uma referência à mecânica já aprovada pela SPEC-010, seções 12.1
("Publicação"), 13 ("Estado Operacional da Vaga"), 14 ("Divulgação
Pública") e 15 ("Permissões") — não uma redefinição. Nenhuma nova regra de
publicação, despublicação, arquivamento ou reabertura de Vaga é criada por
esta SPEC.

- **Quando uma Vaga pode ficar pública:** somente quando existe uma versão
  `published` válida e a Vaga está `open` (SPEC-010, RN-049).
- **Quem publica a versão da Vaga:** somente `owner` (SPEC-010, seção 12.1;
  permissão "Publicar versão").
- **Quem configura a divulgação pública (torna a Vaga pública/despublica):**
  `owner` sempre; `admin` somente quando já existe versão publicada válida,
  a Vaga está `open` e a publicação interna foi feita por `owner` (SPEC-010,
  seção 6.5 e seção 15.2).
- **Quem despublica (retira da divulgação pública) sem alterar o estado
  operacional:** `owner` e `admin`, dentro da mesma permissão de configurar
  divulgação pública.
- **Quem arquiva:** esta SPEC não usa "arquivar" para Vaga — o termo
  aplicável já existente é "encerrar" (`closed`) ou "cancelar"
  (`cancelled`), ambos estados finais (SPEC-010, seção 13). "Arquivar" nesta
  SPEC refere-se apenas ao efeito de retirada permanente da divulgação
  pública que encerramento e cancelamento já produzem (SPEC-010, seção 14:
  "encerrar ou cancelar remove da página pública").
- **Quem reabre:** a transição `paused -> open` já existe e segue a mesma
  permissão de "Abrir Vaga" (somente `owner`, SPEC-010 seção 15). Reabertura
  de Vaga `closed` ou `cancelled` continua fora de escopo (SPEC-010, RN-031,
  RN-073) — esta SPEC não altera essa restrição.
- **Estados possíveis e transições permitidas:** exatamente os já definidos
  pela SPEC-010, seção 13 (`draft -> open`, `open -> paused`,
  `paused -> open`, `open -> closed`, `paused -> closed`,
  `draft -> cancelled`, `open -> cancelled`, `paused -> cancelled`).

O único comportamento novo desta SPEC em relação à publicação é a
**apresentação agregada** dessas Vagas Públicas no Portal (seção 7 em
diante) — nunca uma nova regra de quem pode publicar, abrir, pausar,
encerrar, cancelar ou reabrir.

## 7. Informações Exibidas

Uma Página Pública pode exibir, exclusivamente a partir do conteúdo já
definido pela SPEC-010 (seção 8.4, "Conteúdo da Vaga"):

- título público (`public_title`, SPEC-010);
- descrição;
- responsabilidades;
- requisitos (quando não sensíveis);
- benefícios;
- localização (cidade, região/estado, país; endereço público quando
  informado);
- modalidade de trabalho (`onsite`, `hybrid`, `remote`, `flexible`);
- tipo/jornada de contratação (jornada semanal, turno, quando aplicável);
- faixa salarial, **somente quando a configuração de exibição pública
  permitir** (SPEC-010, RN-048, seção 9.7: "página pública só mostra faixa
  salarial quando a configuração permitir");
- competências vinculadas à Vaga, quando a Organization optar por exibi-las
  publicamente, sempre pelo nome/categoria da competência, nunca pelo peso
  contextual (ADR-0009: peso pertence ao contexto de uso, nunca é dado
  público);
- departamento/Organizational Unit, quando informado e a Organization optar
  por exibi-lo;
- data de publicação pública (`public_published_at`, SPEC-010);
- data limite de candidatura (`application_deadline`, SPEC-010), quando
  informada;
- quantidade de posições (`positions_count`, SPEC-010), quando a
  Organization optar por exibi-la.

Nunca exibidos publicamente, em nenhuma circunstância:

- instruções internas (`internal_instructions`, SPEC-010, RN-047);
- responsável interno pela Vaga (autoria administrativa);
- histórico de versões, rascunhos ou dados administrativos;
- perguntas de triagem (Banco de Perguntas) e seus pesos;
- qualquer identificador interno (seção 13).

"Responsável" citado no pedido original desta SPEC não é exibido
publicamente: a autoria interna de uma Vaga (quem criou, quem publicou) é
dado administrativo, nunca dado público, consistente com a SPEC-010, seção
20 ("Segurança").

## 8. Blueprint Organizacional

O Portal Público pode exibir, como conteúdo institucional da Empresa, os
seguintes componentes do Blueprint Organizacional (ADR-0021, seção
"Composição"; SPEC-018), sempre a partir da Blueprint Version `active`
vigente:

- missão;
- visão;
- valores;
- propósito;
- cultura;
- ambiente de trabalho;
- benefícios institucionais (distintos dos benefícios específicos de cada
  Vaga, SPEC-010);
- diferenciais.

Regras:

- todo conteúdo institucional exibido publicamente **vem exclusivamente do
  Blueprint**, nunca é duplicado ou reescrito na Vaga (ADR-0021, seção
  "Relacionamento com o Processo Seletivo": "o Blueprint influencia... nunca
  gera decisão automática" — aqui aplicado à exibição: o Blueprint informa,
  a Vaga nunca copia);
- a Organization decide, componente a componente, **se** cada um desses
  itens do Blueprint aparece publicamente — a exibição pública é sempre
  opt-in, nunca automática por padrão (consistente com a ADR-0020, "Isolamento
  Multiempresa": nenhum dado de uma Organization é exposto sem decisão
  explícita dela);
- quando um componente não estiver disponível na Blueprint Version `active`
  (por exemplo, a Organization ainda não preencheu "propósito"), a Página
  Pública e o Portal simplesmente omitem esse item, sem erro e sem bloquear
  a divulgação das Vagas — consistente com o princípio de fail-safe já
  estabelecido para toda ausência de configuração opcional (ADR-0016,
  aplicado aqui por analogia: ausência de conteúdo institucional nunca
  bloqueia a divulgação de Vagas);
- o Blueprint em `draft` nunca é exibido publicamente; apenas a versão
  `active` (ADR-0022, "Estados conceituais");
- alterar o Blueprint (nova ativação) atualiza o conteúdo institucional
  exibido publicamente a partir da próxima leitura — o Portal Público
  sempre reflete a Blueprint Version `active` mais recente, nunca uma cópia
  congelada, porque o conteúdo institucional do Portal não é um registro
  histórico como o Manifest de uma Vaga (SPEC-018 trata apenas do
  Manifest interno de rastreabilidade; a exibição pública é sempre "ao
  vivo").

## 9. SEO

Toda Página Pública deve prever, conceitualmente:

- **Canonical:** URL Canônica da Vaga (seção 5), declarada explicitamente
  para evitar conteúdo duplicado percebido por mecanismos de busca.
- **Meta description:** resumo textual curto gerado a partir da descrição
  pública da Vaga, sem dado sensível.
- **Open Graph:** ver detalhamento abaixo.
- **Robots:** uma Vaga Pública é indexável (`index, follow`) enquanto
  permanecer pública; uma Vaga que deixou de ser pública (seção 11) nunca
  deve permanecer indexável, e a página correspondente deve sinalizar
  `noindex` a partir do momento da retirada.
- **Indexação:** o Portal Público (a página agregada da Organization) e cada
  Página Pública de Vaga aberta e pública são indexáveis; nenhuma tela
  administrativa, de rascunho ou de configuração é indexável.
- **Schema.org:** dados estruturados de vaga de emprego (tipo conceitual
  "JobPosting" ou equivalente), preenchidos a partir do mesmo conteúdo já
  exibido na seção 7 — título público, descrição, localização, modalidade,
  data de publicação, data limite, faixa salarial quando permitida. Nunca
  inclui dado não exibido publicamente.
- **Título:** título público da Vaga (`public_title`, SPEC-010) combinado
  com o nome da Empresa.
- **Descrição:** a mesma meta description.
- **Imagem:** imagem representativa opcional da Empresa ou da Vaga, usada
  tanto para SEO quanto para Open Graph; nunca uma imagem que contenha dado
  pessoal de candidato (não há candidato nesta fase) ou dado interno.

## 10. Compartilhamento

Canais de compartilhamento previstos (produto, não integração técnica
obrigatória nesta fase):

- WhatsApp;
- Status do WhatsApp;
- LinkedIn;
- Facebook;
- Instagram;
- X;
- copiar link;
- QR Code.

Regras:

- todos os canais compartilham exatamente a URL Canônica (seção 5) — nunca
  uma URL alternativa, encurtada de forma não rastreável até a URL
  Canônica, ou com IDs internos;
- o QR Code é apenas uma representação visual da URL Canônica, sem
  codificar nenhum dado adicional;
- parâmetros de rastreamento de campanha (quando existirem, implementação
  futura) nunca alteram a Canonical URL declarada no SEO (seção 9);
- compartilhar uma Vaga que deixou de ser pública (seção 11) deve continuar
  funcionando como link (sem erro técnico), mas a Página Pública deve
  informar claramente que a Vaga não está mais disponível, consistente com
  a SPEC-010 (RN-070: "página pública por slug expirado deve sinalizar que
  o prazo encerrou").

## 11. Vagas Expiradas

Aplica-se tanto à expiração de `application_deadline` quanto à saída do
estado `open` (pausa, encerramento, cancelamento) — SPEC-010, seções 13 e
14.

- **O que acontece:** a Vaga deixa de aceitar candidatura pública e sai da
  listagem pública de oportunidades abertas do Portal (SPEC-010, RN-069).
- **Como responder:** a Página Pública, quando acessada por uma URL
  Canônica antiga, deve continuar existindo (nunca retornar erro genérico
  de "não encontrado" quando a Vaga já existiu publicamente), mas deve
  sinalizar claramente que a oportunidade não está mais disponível/o prazo
  encerrou, sem expor dados internos (SPEC-010, RN-070, CA-070).
- **Quando mostrar:** enquanto a Vaga estiver `open`, com divulgação
  pública ativa e dentro do `application_deadline` (quando houver).
- **Quando ocultar (da listagem do Portal, não da Página Pública
  individual):** assim que sair de `open` ou o prazo expirar — a Vaga some
  da lista agregada do Portal, mas sua Página Pública individual continua
  acessível pela URL Canônica, no estado "não disponível" descrito acima.
- **Quando arquivar (no sentido de nunca mais reaparecer):** quando a Vaga
  atinge um estado final (`closed`, `cancelled`) — a Página Pública
  permanece acessível apenas como registro de que a URL existiu, sempre no
  estado "não disponível", nunca reaberta automaticamente (SPEC-010, RN-073).

## 12. Analytics

O Portal Público pode registrar, de forma agregada e anônima:

- visualizações (contagem por Vaga, por período);
- compartilhamentos (contagem por canal, quando o próprio botão de
  compartilhamento for acionado pelo visitante);
- origem do acesso (por exemplo, canal de referência — link direto, rede
  social — quando essa informação estiver disponível de forma não invasiva).

Regras:

- **nunca** dados pessoais: nenhum identificador de visitante, nenhum
  endereço IP completo, nenhum fingerprint de dispositivo, nenhum
  identificador publicitário;
- **nunca** tracking invasivo: nenhum cookie de rastreamento entre sites,
  nenhuma correlação entre visitantes ao longo do tempo, nenhuma venda ou
  compartilhamento de dado de acesso com terceiros;
- conforme a LGPD, analytics agregado e anônimo desta natureza (contadores
  sem identificação individual) não constitui tratamento de dado pessoal
  sensível, mas a implementação futura deve, ainda assim, documentar a
  finalidade e evitar qualquer coleta que permita reidentificação;
- analytics do Portal Público nunca se mistura com o consentimento
  operacional do `Candidate` (SPEC-011) — são conceitos completamente
  diferentes: um visitante do Portal Público **não é** um `Candidate` (essa
  transformação só ocorre na SPEC-020, quando e se houver candidatura);
- os dados agregados de analytics pertencem exclusivamente à Organization
  da Vaga correspondente (isolamento multiempresa, seção 14).

## 13. Segurança

O Portal Público e toda Página Pública nunca expõem:

- IDs internos de qualquer entidade (Organization, Job Opening, Job Opening
  Version, Job Profile, Organizational Unit, competências, perguntas,
  Blueprint Version);
- `organization_id` bruto;
- IDs de Blueprint ou de qualquer componente do Blueprint;
- dados de `User`, `Membership` ou `Role` (nome, e-mail, papel de quem
  criou, publicou ou administra a Vaga);
- `provider`, `feature`, configurações de IA ou qualquer dado das ADR-0016
  a ADR-0019 (infraestrutura de IA nunca é exposta publicamente — o Portal
  Público não executa IA, seção 2);
- qualquer configuração administrativa (Feature Settings, Provider Settings,
  routing, credenciais);
- qualquer dado privado da Organization não explicitamente marcado para
  exibição pública (opt-in, seção 8).

Toda leitura pública é somente leitura, nunca aceita nenhuma escrita que
altere dado de negócio (a única ação de escrita prevista nesta SPEC é o
registro de analytics agregado e anônimo, seção 12). O clique em "Quero me
candidatar" não escreve nenhum dado nesta SPEC — apenas transiciona o
visitante para o fluxo da SPEC-020.

Toda consulta pública deve validar no servidor que a Vaga referenciada é
efetivamente uma Vaga Pública (seção 4) no momento da consulta — nunca
confiar em cache desatualizado para decidir se um dado sensível (como faixa
salarial) deve ou não ser exibido.

## 14. Multiempresa

O Portal Público de uma Organization nunca mostra, mistura ou referencia
dados de outra Organization, em nenhuma circunstância — mesmo princípio já
estabelecido pela ADR-0020 ("Isolamento Multiempresa") e reafirmado por toda
SPEC anterior:

- a listagem do Portal Público de uma Organization contém exclusivamente
  Vagas Públicas daquela Organization;
- o conteúdo institucional do Blueprint exibido é exclusivamente da
  Blueprint Version `active` daquela Organization;
- analytics agregado nunca mistura contadores de Organizations diferentes;
- uma URL Canônica de uma Organization nunca resolve para dado de outra
  Organization, mesmo em caso de erro de digitação ou tentativa deliberada.

## 15. Permissões

| Ação | Platform Admin | owner | admin | member | Visitante |
| --- | :---: | :---: | :---: | :---: | :---: |
| Configurar quais componentes do Blueprint aparecem no Portal | Não | Sim | Sim | Não | Não |
| Configurar divulgação pública de uma Vaga (tornar pública/despublicar) | Não | Sim | Sim (quando já publicada e aberta, SPEC-010) | Não | Não |
| Publicar versão da Vaga | Não | Sim | Não | Não | Não |
| Abrir/pausar/encerrar/cancelar Vaga (regra herdada, não redefinida aqui) | Não | Ver SPEC-010, seção 15 | Ver SPEC-010, seção 15 | Não | Não |
| Visualizar Portal Público | Sim | Sim | Sim | Sim | Sim |
| Visualizar Página Pública de Vaga Pública | Sim | Sim | Sim | Sim | Sim |
| Compartilhar uma Vaga Pública | Sim | Sim | Sim | Sim | Sim |
| Consultar analytics agregado do Portal | Não (exceto leitura administrativa auditada) | Sim | Sim | Não | Não |
| Consulta administrativa auditada do Portal | Sim | Não | Não | Não | Não |

### 15.1 Platform Admin (SuperAdmin)

Consulta o Portal Público apenas como qualquer visitante (dado já público)
ou, para fins administrativos excepcionais, com motivo e auditoria (mesmo
padrão da SPEC-010, seção 15.4). Nunca configura o Portal, nunca publica
Vaga, nunca opera funcionalmente.

### 15.2 Owner

Configura o Portal Público (seleção de componentes do Blueprint exibidos) e
toda a divulgação pública de Vagas, dentro do que a SPEC-010 já autoriza.

### 15.3 Admin

Configura o Portal Público (mesma permissão do owner para esta
configuração específica, análoga à permissão já concedida pela SPEC-010
para configurar divulgação pública de Vaga já aberta e publicada) e a
divulgação pública de Vagas já publicadas e abertas. Não publica versão de
Vaga.

### 15.4 Member

Nenhuma permissão administrativa sobre o Portal Público, além do que já
possui sobre a Vaga internamente (SPEC-010).

### 15.5 Visitante

Acesso público, sem autenticação, somente leitura: Portal Público, Páginas
Públicas de Vagas Públicas, compartilhamento. Nunca acessa dado não
explicitamente público.

## 16. API Conceitual

| Operação | Finalidade |
| --- | --- |
| Consultar Portal Público da Organization | Retornar Vagas Públicas atuais e conteúdo institucional do Blueprint selecionado para exibição, sem IDs internos. |
| Consultar Página Pública de uma Vaga por URL Canônica | Retornar o conteúdo público de uma Vaga específica (SPEC-010 já prevê esta operação como "Consultar página pública por slug"; esta SPEC apenas a compõe com o restante do Portal). |
| Configurar componentes do Blueprint exibidos no Portal | Permitir que owner/admin escolham quais itens do Blueprint (seção 8) aparecem publicamente. |
| Registrar evento de analytics agregado | Registrar visualização ou compartilhamento anônimo, sem dado pessoal. |
| Consultar analytics agregado do Portal | Retornar contadores agregados para owner/admin da Organization. |
| Leitura administrativa auditada do Portal | Consulta excepcional por Platform Admin, com motivo. |

Esta SPEC não define nenhum endpoint de candidatura, cadastro de candidato
ou qualquer operação de escrita relacionada a `Candidate` ou
`CandidateApplication` (SPEC-020).

Todas as operações de leitura pública devem validar no servidor que a Vaga
ou o conteúdo consultado é efetivamente público no momento da consulta —
nunca confiar em um identificador enviado pelo cliente como prova de que o
dado é público.

## 17. Interface Conceitual

- **Tela do Portal Público:** identidade da Empresa (nome, conteúdo
  institucional opcional do Blueprint), lista de Vagas Públicas atuais,
  ação de compartilhar o Portal em si.
- **Tela da Página Pública de uma Vaga:** conteúdo completo permitido da
  Vaga (seção 7), ações de compartilhamento (seção 10), botão "Quero me
  candidatar".
- **Componentes conceituais:** cabeçalho institucional (Blueprint),
  cartão de Vaga (na listagem do Portal), corpo da Página Pública,
  barra/menu de compartilhamento, indicador de "vaga não disponível"
  quando aplicável (seção 11).
- **Fluxo:** visitante acessa o Portal Público ou diretamente uma Página
  Pública via URL Canônica → visualiza o conteúdo permitido → opcionalmente
  compartilha → opcionalmente pressiona "Quero me candidatar", momento em
  que esta SPEC termina e a SPEC-020 assume.

Esta SPEC não define layout, wireframe, paleta de cores ou biblioteca de
componentes visuais.

## 18. Performance

- **Cache:** o conteúdo do Portal Público e das Páginas Públicas deve poder
  ser armazenado em cache, já que é dado público e de escrita pouco
  frequente (mudanças acontecem apenas em publicação/despublicação de Vaga
  ou ativação de nova Blueprint Version); o cache deve poder ser invalidado
  quando qualquer um desses eventos ocorrer.
- **CDN:** a entrega de conteúdo estático (imagens institucionais, ativos
  visuais) deve poder ser distribuída por CDN.
- **Compressão:** respostas HTTP e ativos devem poder ser comprimidos.
- **Lazy loading:** imagens e conteúdo abaixo da dobra devem poder ser
  carregados sob demanda.
- **Imagem:** imagens devem poder ser servidas em formatos e tamanhos
  otimizados para a experiência pública, sem depender de upload de arquivo
  pesado sem otimização (implementação técnica exata fica para
  especificação futura).
- **SEO e performance:** tempo de carregamento da Página Pública é um fator
  relevante de SEO (seção 9) e deve ser considerado desde o desenho técnico
  futuro, embora esta SPEC não fixe métricas numéricas específicas.

## 19. Acessibilidade

- **WCAG:** a interface pública deve buscar conformidade com diretrizes de
  acessibilidade web amplamente adotadas (WCAG), sem esta SPEC fixar um
  nível numérico específico (AA, AAA) — isso fica para especificação
  técnica ou de design futura.
- **Responsividade:** o Portal Público e as Páginas Públicas devem
  funcionar em diferentes tamanhos de tela (celular, tablet, desktop), já
  que o compartilhamento (seção 10) inclui canais predominantemente móveis
  (WhatsApp, Instagram).
- **Semântica:** a estrutura da página deve usar marcação semântica
  apropriada (títulos, landmarks, texto alternativo de imagem), tanto para
  acessibilidade quanto para SEO (seção 9).

## 20. Auditoria

Esta SPEC não duplica os eventos de auditoria já exigidos pela SPEC-010
para o ciclo de vida da Vaga e de sua divulgação pública — eles continuam
válidos e obrigatórios sem alteração:

- `job_opening.public_published` (SPEC-010) — publicação da divulgação
  pública de uma Vaga;
- `job_opening.public_unpublished` (SPEC-010) — despublicação;
- `job_opening.opened` / `job_opening.paused` / `job_opening.closed` /
  `job_opening.cancelled` (SPEC-010) — transições operacionais que afetam a
  disponibilidade pública ("arquivamento"/"reabertura" no sentido usado
  pela seção 6 desta SPEC).

Novos eventos, específicos do Portal Público (nível de Organization, não de
Vaga individual):

- `public_portal.settings_updated` — alteração de quais componentes do
  Blueprint são exibidos publicamente;
- `public_portal.administrative_read` — leitura administrativa auditada por
  Platform Admin;
- `public_portal.permission_denied` — tentativa negada de configurar o
  Portal Público.

A auditoria nunca registra o conteúdo institucional completo do Blueprint,
apenas quais componentes foram habilitados/desabilitados, o ator, a data e
o motivo quando aplicável — mesmo padrão já exigido pela SPEC-018 para
auditoria do Blueprint ("nunca registra o conteúdo completo").

Eventos de analytics (visualização, compartilhamento, seção 12) **não**
fazem parte da tabela de auditoria de segurança (`audit_events`) — são
contadores agregados e anônimos, de natureza distinta de um evento de
auditoria de ação administrativa, consistente com o restante do projeto,
que nunca mistura telemetria de alto volume com auditoria de segurança.

## 21. Banco Conceitual

Sem schema físico, sem migration. Apenas os conceitos mínimos necessários,
reaproveitando ao máximo o que já existe:

### Entidades já existentes, apenas consumidas por esta SPEC

- `organizations` (SPEC-001) — fonte do nome público da Empresa e do `slug`
  usado na URL Canônica.
- `job_openings` / `job_opening_versions` (SPEC-010) — fonte de toda Vaga
  Pública e seu conteúdo, incluindo `is_public`, `public_slug`,
  `public_published_at`, `public_unpublished_at`, `application_deadline`.
- Blueprint Version ativa (ADR-0022, SPEC-018) — fonte do conteúdo
  institucional opcional.

### Conceito novo mínimo desta SPEC

**Configuração de exibição do Portal (`organization_public_portal_settings`,
nome conceitual):**

- `organization_id`;
- lista/conjunto de componentes do Blueprint habilitados para exibição
  pública (missão, visão, valores, propósito, cultura, ambiente, benefícios
  institucionais, diferenciais — seção 8), cada um como um sinalizador
  independente;
- autoria (quem configurou por último);
- timestamps.

Este conceito nunca duplica o conteúdo do Blueprint — armazena apenas quais
componentes estão habilitados para exibição, nunca o texto em si (o texto
sempre vem, em tempo de leitura, da Blueprint Version `active`).

**Analytics agregado (`public_portal_view_events`/`public_portal_share_events`,
nomes conceituais, apenas contadores):**

- `organization_id`;
- `job_opening_id`, quando aplicável;
- contagem agregada por período e, quando aplicável, por canal de
  compartilhamento;
- nunca um identificador de visitante individual.

A forma física exata (tabela relacional, agregação periódica, ou outro
mecanismo) fica para especificação técnica futura; esta SPEC apenas exige
que o resultado seja sempre agregado e nunca individualizável (seção 12).

## 22. Critérios de Aceite

- CA-001: Toda Vaga Pública possui URL Canônica derivada do `slug` da
  Organization e do `public_slug` da Vaga.
- CA-002: A URL Canônica nunca contém identificador interno.
- CA-003: A URL Canônica permanece a mesma enquanto a Vaga estiver
  publicamente divulgada.
- CA-004: Alterar o título interno ou público de uma Vaga já divulgada
  nunca altera sua URL Canônica.
- CA-005: O Portal Público de uma Organization lista exclusivamente as
  Vagas Públicas daquela Organization.
- CA-006: Uma Vaga que não está `open` ou não está com divulgação pública
  ativa nunca aparece na listagem do Portal.
- CA-007: A Página Pública de uma Vaga permite acesso somente leitura, sem
  autenticação.
- CA-008: A Página Pública nunca expõe faixa salarial quando a configuração
  de exibição não permitir (SPEC-010).
- CA-009: A Página Pública nunca expõe instruções internas.
- CA-010: A Página Pública nunca expõe autoria administrativa
  (responsável interno).
- CA-011: A Página Pública nunca expõe IDs internos de nenhuma entidade.
- CA-012: O conteúdo institucional exibido no Portal vem exclusivamente da
  Blueprint Version `active`.
- CA-013: Um componente do Blueprint não habilitado para exibição pública
  nunca aparece no Portal, mesmo que preenchido internamente.
- CA-014: A ausência de conteúdo institucional preenchido no Blueprint
  nunca bloqueia a exibição das Vagas Públicas.
- CA-015: Somente owner e admin configuram quais componentes do Blueprint
  aparecem no Portal.
- CA-016: Member não configura o Portal Público.
- CA-017: Platform Admin não configura o Portal Público funcionalmente.
- CA-018: Platform Admin realiza apenas leitura administrativa auditada,
  com motivo obrigatório.
- CA-019: Toda Página Pública declara Canonical URL nos metadados de SEO.
- CA-020: Toda Página Pública declara meta description coerente com o
  conteúdo público.
- CA-021: Toda Página Pública declara metadados de Open Graph (título,
  descrição, imagem, URL).
- CA-022: Uma Vaga Pública é indexável (`index, follow`).
- CA-023: Uma Vaga que deixou de ser pública deixa de ser indexável
  (`noindex`) a partir da retirada.
- CA-024: Dados estruturados (Schema.org) nunca incluem dado não exibido
  publicamente.
- CA-025: Todo canal de compartilhamento distribui exatamente a mesma URL
  Canônica.
- CA-026: O QR Code codifica exclusivamente a URL Canônica.
- CA-027: Compartilhar uma Vaga expirada/encerrada continua funcionando
  como link, exibindo indicação de indisponibilidade, sem erro técnico.
- CA-028: Vaga com `application_deadline` expirado sai da listagem do
  Portal sem alterar automaticamente seu estado operacional (SPEC-010).
- CA-029: Vaga com `application_deadline` expirado continua acessível por
  sua Página Pública, sinalizando indisponibilidade.
- CA-030: Vaga pausada some da listagem pública, mas sua Página Pública
  permanece acessível como indisponível.
- CA-031: Vaga encerrada ou cancelada some definitivamente da listagem
  pública.
- CA-032: Nenhum evento de analytics registra dado pessoal ou identificador
  de visitante.
- CA-033: Analytics é sempre agregado, nunca individualizável.
- CA-034: Analytics de uma Organization nunca se mistura com o de outra.
- CA-035: Nenhuma referência cruzada entre Organizations é permitida em
  nenhuma consulta pública.
- CA-036: Consulta pública sempre revalida no servidor se o dado é
  efetivamente público no momento da consulta.
- CA-037: Nenhuma escrita de dado de negócio ocorre nesta SPEC, exceto
  configuração do Portal (owner/admin) e analytics agregado.
- CA-038: O clique em "Quero me candidatar" não cria `Candidate` nem
  `CandidateApplication` nesta SPEC.
- CA-039: Esta SPEC não expõe nenhum dado de infraestrutura de IA
  (provider, feature, configuração).
- CA-040: Alterações de configuração do Portal geram auditoria
  (`public_portal.settings_updated`).
- CA-041: Tentativas negadas de configurar o Portal geram auditoria.
- CA-042: Leitura administrativa do Portal gera auditoria com motivo.
- CA-043: Auditoria do Portal nunca registra o conteúdo institucional
  completo.
- CA-044: Organization arquivada (SPEC-001) nunca expõe Portal Público nem
  Vagas Públicas (consistente com SPEC-010, seção 16: "Organization
  arquivada... nenhuma Vaga pode ficar pública").
- CA-045: Página Pública é responsiva em diferentes tamanhos de tela.
- CA-046: Página Pública usa marcação semântica apropriada.
- CA-047: Não existe exclusão física de nenhum dado nesta SPEC.
- CA-048: Nenhuma funcionalidade de SPEC-020 a SPEC-024 é implementada
  antecipadamente por esta SPEC.

## 23. Testes Obrigatórios

Quando esta SPEC for implementada, os testes devem comprovar, no mínimo:

### Publicação e despublicação

1. Vaga `open` e publicamente divulgada aparece no Portal.
2. Vaga despublicada (mas ainda `open`) some do Portal.
3. Republicar a divulgação pública da mesma Vaga restaura sua presença no
   Portal com a mesma URL Canônica.

### Slug e URLs

4. URL Canônica é derivada do `slug` da Organization e do `public_slug` da
   Vaga.
5. URL Canônica nunca contém ID interno.
6. Alterar título interno não altera a URL Canônica.
7. Alterar `public_title` de uma nova versão não altera a URL Canônica
   (que depende apenas do `public_slug`, não do título).
8. `public_slug` retirado permanece reservado e não é reaproveitado.

### SEO

9. Canonical URL presente e correta em toda Página Pública.
10. Meta description presente e coerente com o conteúdo público.
11. Vaga pública é indexável.
12. Vaga que deixou de ser pública deixa de ser indexável.
13. Dados estruturados (Schema.org) nunca incluem faixa salarial quando não
    permitida.

### Open Graph

14. Metadados de Open Graph presentes (título, descrição, imagem, URL).
15. Imagem de Open Graph nunca inclui dado interno ou sensível.

### Compartilhamento

16. Todo canal de compartilhamento gera exatamente a mesma URL Canônica.
17. QR Code decodifica exatamente para a URL Canônica.
18. Compartilhar Vaga expirada resulta em página de indisponibilidade, não
    em erro técnico.

### Blueprint

19. Conteúdo institucional exibido reflete a Blueprint Version `active`.
20. Componente do Blueprint não habilitado nunca aparece publicamente.
21. Blueprint sem conteúdo preenchido não bloqueia exibição das Vagas.
22. Blueprint em `draft` nunca é exibido publicamente.
23. Nova ativação de Blueprint Version atualiza o conteúdo institucional
    exibido.

### Permissões

24. Owner configura componentes do Blueprint exibidos.
25. Admin configura componentes do Blueprint exibidos.
26. Member não configura o Portal Público.
27. Platform Admin não configura o Portal Público.
28. Platform Admin realiza leitura administrativa somente com motivo.
29. Visitante acessa Portal e Páginas Públicas sem autenticação.

### LGPD / Analytics

30. Evento de analytics nunca registra identificador de visitante.
31. Evento de analytics nunca registra IP completo ou fingerprint.
32. Analytics é sempre consultado de forma agregada.

### Multiempresa

33. Portal Público de uma Organization nunca lista Vaga de outra
    Organization.
34. Conteúdo institucional de uma Organization nunca aparece no Portal de
    outra.
35. Analytics de uma Organization nunca se mistura com o de outra.
36. Manipulação de identificador não concede acesso a dado de outra
    Organization.

### Arquivamento (retirada permanente)

37. Vaga encerrada some definitivamente da listagem pública.
38. Vaga cancelada some definitivamente da listagem pública.
39. Página Pública de Vaga encerrada/cancelada permanece acessível apenas
    como indisponível.

### Performance

40. Conteúdo público suporta cache com invalidação em publicação,
    despublicação ou nova ativação de Blueprint.
41. Imagens públicas suportam carregamento otimizado/lazy loading.

### Acessibilidade

42. Página Pública é responsiva em diferentes tamanhos de tela.
43. Página Pública usa estrutura semântica (títulos, texto alternativo).

### Segurança e auditoria

44. Nenhum ID interno é exposto em nenhuma resposta pública.
45. Nenhum dado de `User`, `Membership` ou Role é exposto publicamente.
46. Nenhum dado de infraestrutura de IA é exposto publicamente.
47. Alteração de configuração do Portal gera auditoria.
48. Tentativa negada de configurar o Portal gera auditoria.
49. Organization arquivada nunca expõe Portal Público.
50. Persistência dos dados de configuração do Portal após recriar a
    aplicação.

## 24. Limitações Conhecidas

- Esta SPEC não implementa código, banco, migrations, rotas, APIs, testes
  ou dependências.
- Não define domínio customizado nem marca branca.
- Não define identidade visual customizável por Organization além da
  seleção de conteúdo institucional do Blueprint.
- Não define candidatura pública, cadastro de candidato, Pré-Entrevista,
  DISC, Perfil Comportamental, IA ou Dossiê Inteligente.
- Não define o mecanismo físico exato de cache, CDN ou otimização de
  imagem — apenas exige que sejam previstos conceitualmente.
- Não fixa nível numérico de conformidade WCAG.
- Não define integração técnica real com nenhuma rede social ou
  mensageiro — apenas a garantia de que a URL compartilhada é sempre a
  Canônica.
- Não define formato físico de armazenamento do analytics agregado.
- Reabertura de Vaga `closed` ou `cancelled` continua fora de escopo,
  herdado da SPEC-010.

## 25. Definição de Concluído

Para a implementação futura desta SPEC:

- SPEC aprovada antes do desenvolvimento;
- nenhuma regra da SPEC-010 sobre divulgação pública de Vaga foi
  redefinida ou contradita;
- critérios de aceite atendidos;
- testes obrigatórios implementados e passando;
- testes de segurança, multiempresa e LGPD passando;
- regras de SEO e Open Graph verificadas;
- regras de acessibilidade básicas verificadas;
- migrations reproduzíveis quando houver banco;
- lint passando;
- formatação passando;
- build passando;
- documentação atualizada;
- auditoria revisada;
- nenhuma funcionalidade das SPEC-020 a SPEC-024 implementada
  antecipadamente;
- commit realizado.
