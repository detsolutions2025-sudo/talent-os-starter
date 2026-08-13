# Runbook — Bootstrap Operacional da Pré-Análise Assistida por IA (Fase 20)

Baseado exatamente no procedimento que `tests/phase20/helpers.ts::setupExecutablePreAnalysisFeature`
exercita de ponta a ponta contra o banco real em todo teste que executa o fluxo completo — não é
um roteiro hipotético, é o mesmo conjunto de chamadas HTTP já verificado funcionalmente.

A implementação de código da Fase 20 (`SPEC-023 v1.1`, migration `0021`) não é, por si só,
operacional em um ambiente recém-instalado. `candidate_pre_analysis` depende de configuração
administrativa que nenhuma migration cria (nenhuma das 20 fases anteriores usa seed SQL — este
runbook segue a mesma convenção: administração 100% via API, nunca script de seed).

## Pré-requisito

Migration `0021_phase_20_pre_analysis.sql` aplicada (`npm run db:migrate:supabase`).

## Passo a passo

Todas as chamadas usam a API já existente da infraestrutura de IA (ADR-0016 a ADR-0019,
SPEC-014) — nenhum endpoint novo foi criado para este bootstrap.

### 1. Disponibilidade da plataforma

```
PUT /api/platform/organizations/:organizationId/ai/settings/platform-allowed
Header: x-dev-platform-admin: true
Body: { "platformAiAllowed": true }
```

Repita por Organization, ou confirme que já está habilitado se outra Feature de IA já funciona
nessa Organization (o flag é por Organization, não por Feature).

### 2. IA habilitada na Organization

```
PUT /api/organizations/:organizationId/ai/settings
Header: x-dev-user-id: <owner ou admin>
Body: { "organizationAiEnabled": true }
```

### 3. Registrar a Feature no catálogo global

```
POST /api/platform/ai/features
Header: x-dev-platform-admin: true
Body: { "featureKey": "candidate_pre_analysis", "name": "Pré-Análise Assistida por IA" }
```

`feature_key` é fixo e definitivo (`SPEC-023 §20.1`) — nunca outro valor. Se a Feature já existir
(HTTP 409), prossiga.

### 4. Disponibilizar a Feature na plataforma

```
PATCH /api/platform/ai/features/candidate_pre_analysis/availability
Header: x-dev-platform-admin: true
Body: { "featureAvailableOnPlatform": true }
```

### 5. Habilitar a Feature na Organization

```
PATCH /api/organizations/:organizationId/ai/features/candidate_pre_analysis/enabled
Header: x-dev-user-id: <owner ou admin>
Body: { "organizationFeatureEnabled": true }
```

### 6. Registrar o provider

```
POST /api/platform/ai/providers
Header: x-dev-platform-admin: true
Body: { "providerKey": "<provider real, ex: openai>", "name": "<nome>" }
```

Em produção, `providerKey` é o provider real configurado (nunca `fake` — `FakeProviderAdapter`
só existe fora de `APP_ENV=production`, ver passo 10).

### 7. Registrar o modelo

```
POST /api/platform/ai/models
Header: x-dev-platform-admin: true
Body: {
  "provider": "<provider>",
  "modelKey": "<chave interna>",
  "providerModelIdentifier": "<identificador real do modelo no provider>"
}
```

### 8. Configurar credencial (BYOK) na Organization

```
POST /api/organizations/:organizationId/ai/provider-configs
Header: x-dev-user-id: <owner>
Body: { "provider": "<provider>", "credentialMode": "customer_managed", "secret": "<segredo real>" }
```

Alternativa: `credentialMode: "platform_managed"`, configurado por Platform Admin
(`POST /api/platform/organizations/:organizationId/ai/providers/:provider/platform-managed`),
quando a Organization usa credencial da própria plataforma em vez de BYOK.

### 9. Criar a política de routing

```
POST /api/organizations/:organizationId/ai/routing
Header: x-dev-user-id: <owner>
Body: {
  "featureKey": "candidate_pre_analysis",
  "provider": "<provider>",
  "modelKey": "<modelKey>",
  "priority": 1
}
```

### 10. Criar, publicar e vincular o prompt (Prompt Registry, Platform Admin)

```
POST /api/platform/ai/prompts
Header: x-dev-platform-admin: true
Body: {
  "promptKey": "<chave unica>",
  "featureKey": "candidate_pre_analysis",
  "template": "<texto do prompt>",
  "inputSchema": {
    "type": "object",
    "properties": { "evidences": { "type": "array" } }
  },
  "outputSchema": {
    "type": "object",
    "required": ["summary", "limitations", "findings"],
    "properties": {
      "summary": { "type": "string" },
      "limitations": { "type": "string" },
      "findings": { "type": "array" }
    }
  }
}
```

**Atenção crítica adicional, confirmada por esta revisão (nunca omitir `inputSchema.properties.
evidences`):** `MinimalJsonSchema.properties` também é usado por `minimizeInput`
(`src/server/ai/prompt-renderer.ts`) para decidir quais chaves do `input` sobrevivem antes de
chegar ao provider — é o próprio mecanismo de minimização exigido por `SPEC-014` ("Prompt e
dados sensíveis"). Um `inputSchema` sem `properties.evidences` declarado (por exemplo,
`{ "type": "object" }` sozinho, sem `properties`) faz o Gateway reduzir **todo** o payload da
Fase 20 a `{}` **vazio**, silenciosamente, sem nenhum erro — a execução ainda retorna
`completed`, mas o provider nunca recebeu nenhuma evidência real. Confirmado empiricamente
(`minimizeInput({evidences:[...]}, {type:"object"})` retorna `{}`) e coberto por teste dedicado
(`tests/phase20/pre-analysis-postgres.test.ts`, verificação positiva de que o conteúdo real do
candidato chega a `adapter.lastRequest.data`, não apenas ausência de PII). O `inputSchema` acima
já está correto — nunca publicar um prompt real para `candidate_pre_analysis` sem essa
declaração.

```
POST /api/platform/ai/prompts/:promptKey/versions/:version/publish
Header: x-dev-platform-admin: true
```

```
PATCH /api/platform/ai/features/candidate_pre_analysis/default-prompt
Header: x-dev-platform-admin: true
Body: { "promptKey": "<chave>" }
```

**Atenção crítica, confirmada pela revisão destrutiva desta Fase:** o validador de
`outputSchema` do `AIGateway` (`src/server/ai/prompt-renderer.ts`, `MinimalJsonSchema`) é
deliberadamente simplificado e **nunca implementa `additionalProperties`** — declarar
`additionalProperties:false` no schema acima não bloqueia campos extra na resposta do provider.
A defesa real contra campos fora do contrato (`score`, `recommendation` etc.) é feita
inteiramente pelo `PreAnalysisService` (`parseGatewayOutput`), nunca pelo Gateway. Isso não muda
nada neste bootstrap, mas quem administra o Prompt Registry não deve presumir que o
`outputSchema` sozinho garante essa proteção.

### 11. Validar a credencial (opcional, recomendado)

```
POST /api/organizations/:organizationId/ai/provider-configs/:provider/test-connection
Header: x-dev-user-id: <owner>
```

### 12. Smoke test

Com um `Candidate` ativo + consentimento `purpose = "ai_pre_analysis"` + `CandidateApplication`
`active`:

```
POST /api/organizations/:organizationId/candidate-applications/:applicationId/pre-analyses
Header: x-dev-user-id: <owner ou admin>
```

Resposta esperada: `201`, `status: "completed"` (ou `"failed"`/`"unavailable"` com
`errorCategory` explicando a causa, nunca um erro genérico sem categoria).

## Ambiente de desenvolvimento/teste

`APP_ENV` diferente de `production` usa, por padrão, `InMemorySecretManager` +
`FakeProviderAdapter` (`src/server/ai/service.ts`) — não é necessário um provider real para
testar a Feature de ponta a ponta; use `providerKey: "fake"` nos passos 6–9. Este é exatamente o
caminho que `tests/phase20/helpers.ts::setupExecutablePreAnalysisFeature` automatiza.

## Produção

Em `APP_ENV=production`, `InMemorySecretManager`/`FakeProviderAdapter` nunca são usados —
`AIService` é criado com `UnavailableSecretManager`/`UnavailableProviderAdapter`
(`src/server/index.ts`). A Feature fica **implementada mas operacionalmente indisponível** até
que uma infraestrutura real de Secret Manager e um adapter de provider real sejam configurados —
uma limitação herdada da Fase 11, não desta Fase.

## Verificação rápida do estado de bootstrap

Nenhum endpoint único resume "a Feature está pronta?" — verifique cada camada:

| Camada                             | Como confirmar                                                            |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `platform_ai_allowed`              | `GET /api/platform/organizations/:id/ai/settings`                         |
| `organization_ai_enabled`          | `GET /api/organizations/:id/ai/settings`                                  |
| Feature no catálogo + disponível   | `GET /api/platform/ai/features`                                           |
| Feature habilitada na Organization | `GET /api/organizations/:id/ai/features`                                  |
| Routing                            | `GET /api/organizations/:id/ai/routing/candidate_pre_analysis`            |
| Credencial configurada             | `GET /api/organizations/:id/ai/provider-configs/:provider`                |
| Prompt publicado e vinculado       | `GET /api/platform/ai/prompts/:promptKey` + `defaultPromptKey` da Feature |

Se qualquer camada faltar, uma solicitação de Pré-Análise não falha com erro genérico: transita
para `unavailable` com `error_category` explicando exatamente qual condição não foi satisfeita
(`SPEC-023 §20`, §21`) — nunca bloqueia o fluxo normal da candidatura (fail-safe, ADR-0016).
