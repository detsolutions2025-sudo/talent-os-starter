# Backup, Restore e Disaster Recovery mínimo

Bloco operacional (Production Hardening, guarda-chuva ADR-0027) — não é
feature de produto, não cria nova Fase, não substitui revisão humana de
um incidente real. Documenta o que existe hoje e como usá-lo; não afirma
cobertura além do que está implementado e testado.

## 1. Escopo

Cobre exclusivamente:

- o banco PostgreSQL (schema + dados) descrito por `db/migrations/`;
- a ferramenta de backup/restore lógico deste repositório
  (`src/server/backup-restore/`).

**Não cobre** (limites explícitos, nunca assumidos como cobertos):

- Supabase Storage ou qualquer outro armazenamento de arquivo — o
  projeto não usa Storage hoje (`STORAGE_URL` existe em `.env.example`
  mas não é lida em nenhum lugar de `src/`); se isso mudar, este runbook
  precisa ser revisado antes de se considerar "recuperação completa";
- segredos/configuração (`.env`, `SUPABASE_SERVICE_ROLE_KEY`,
  `TRUSTED_FRONTEND_ORIGINS` etc.) — vivem fora do banco, sob
  responsabilidade do operador/gestor de segredos, nunca neste backup;
- qualquer serviço terceiro (AI Gateway, provedor de auth) além dos dados
  que o próprio Postgres já guarda sobre eles.

## 2. Estratégia (A/B/C)

**A) Capacidades gerenciadas pelo provedor (Supabase).** Supabase Cloud
anuncia backups automáticos gerenciados (PITR em planos pagos, backups
diários no plano padrão). **Isto não foi verificado fisicamente contra a
conta real deste projeto** — é uma capacidade de plataforma, não uma
garantia que este repositório testa ou controla.
**Verificação operacional pendente:** confirmar no painel Supabase do
projeto real (Settings → Database → Backups) qual é o plano ativo, a
retenção configurada, e se PITR está habilitado, antes de declarar
qualquer RPO/RTO como "coberto pelo provedor".

**B) Backup lógico controlado por este projeto.** `src/server/backup-restore/`
— dump/restore em Node/`pg` (sem `pg_dump`/`pg_restore`: não estão
disponíveis neste ambiente de desenvolvimento, e não foram instalados
automaticamente, conforme a regra deste bloco). Cobre schema + dados de
todas as tabelas de domínio (exclui apenas `schema_migrations`, que é
bookkeeping do próprio migration runner, recriado por `npm run
db:migrate:supabase`). Testado de ponta a ponta (seção 8).

**C) Responsabilidade operacional externa.** Rotação/retenção de longo
prazo dos arquivos de backup, cofre de segredos, e a decisão de qual
ambiente de hosting/rede está em uso são responsabilidade de quem opera
a conta Supabase real — fora do escopo deste repositório.

### Caminho recomendado quando houver `pg_dump`/`pg_restore` disponíveis

Este projeto **não instalou** essas ferramentas (ausentes no ambiente em
que este bloco foi implementado). Onde estiverem disponíveis (ex.: uma
máquina de operação com PostgreSQL client tools, ou o próprio Supabase
CLI), o caminho de mais alta fidelidade para um backup completo é:

```
pg_dump --format=custom --no-owner --dbname="$SUPABASE_DATABASE_URL" --file=backup.dump
pg_restore --no-owner --dbname="$TARGET_DATABASE_URL" backup.dump
```

Isso não foi executado nem testado neste bloco (ferramenta ausente) —
citado apenas como referência para quando o ambiente de operação real
tiver essas ferramentas.

## 3. A ferramenta deste repositório

```
npm run db:backup  -- --schema <nome-do-schema> --out-dir <diretorio>
npm run db:restore -- --file <arquivo.json> --target-schema <schema> --confirm-target <schema>
```

- **Backup**: conecta via `SUPABASE_DATABASE_URL`, lê todas as tabelas do
  schema informado (ordenadas por dependência de FK), grava um único
  arquivo JSON em `<diretorio>` (git-ignorado via `backups/` no
  `.gitignore` — nunca commitar um arquivo de backup). Recusa
  sobrescrever um arquivo já existente. Nunca imprime a credencial da
  connection string (`redactDatabaseUrl`).
- **Restore**: exige `--file`, `--target-schema` **e** `--confirm-target`
  (deve ser digitado igual a `--target-schema` — protege contra copiar/
  colar o schema errado). Recusa nomes bloqueados (`public`). Recusa
  restaurar se **qualquer** tabela do dump já tiver linhas no destino
  (`assertTargetIsEmpty` — falha fechado antes de inserir qualquer
  coisa). O schema de destino precisa **já existir e estar migrado**
  antes do restore (ver seção 6).

**FK auto-referenciada (ex.: `organizational_units.parent_id` apontando
para a mesma tabela) é resolvida automaticamente.** O dump ordena as
linhas de qualquer tabela com FK auto-referenciada (simples ou composta)
de forma que uma linha "pai" sempre apareça antes de quem a referencia —
detectado genericamente via `pg_constraint` (`conkey`/`confkey`), não
hardcoded para `organizational_units` especificamente
(`src/server/backup-restore/row-ordering.ts`). O restore reaplica a
mesma ordenação como defesa em profundidade, mesmo que o arquivo de dump
tenha sido editado à mão ou venha de outra fonte. Se os dados formarem
um ciclo auto-referenciado (só alcançável via `UPDATE` após o `INSERT`
original, nunca via `INSERT` direto — a FK não é `DEFERRABLE`), o
dump/restore falha fechado com `RowCycleError` em vez de tentar uma
ordem parcial ou ignorar a FK. Testado de ponta a ponta com uma
hierarquia real de 3 níveis (seção 8).

## 4. RPO / RTO (objetivo interno do time, não garantia do provedor)

|                                     | Objetivo v1 (interno)                            | Gap conhecido                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **RPO** (perda máxima aceitável)    | 24h                                              | Depende de rodar `db:backup` manualmente com essa cadência — **não há agendamento automático implementado** neste bloco.                        |
| **RTO** (tempo alvo de recuperação) | 2h para um operador humano seguindo este runbook | Não cronometrado em um incidente real; tempo de fato depende do tamanho real do banco de produção (o teste da seção 8 usa uma fixture pequena). |

Estes são valores propostos para v1, não SLA. Se o plano Supabase real
tiver PITR habilitado (verificação pendente, seção 2-A), o RPO efetivo
pode ser muito menor — mas isso não é testado nem controlado por este
repositório.

## 5. Migrations vs. restore

- **(A) Restore integral de um backup**: schema de destino já existe e
  já está migrado (mesma versão de `schema_migrations` do momento do
  backup, ou mais recente); `db:restore` popula os dados.
- **(B) Banco vazio reconstruído pelas migrations**: `npm run
db:migrate:supabase` sozinho, sem nenhum restore — é o que já
  acontece hoje em qualquer ambiente novo (dev, CI).
- **(C) Restore de backup antigo + migrations posteriores**: aplicar
  migrations no destino **antes** do restore (elas só criam
  tabelas/colunas nunca populadas pelo dump antigo); o restore então
  preenche apenas as tabelas que existiam no momento do backup. Migrations
  aplicadas **depois** do restore continuam seguras (são aditivas, nunca
  editam dado existente) — esta é a ordem recomendada quando o backup é
  mais antigo que a versão atual do schema.

Nunca editar uma migration já aplicada para "consertar" um restore.

## 6. Runbook — passo a passo de um incidente real

1. **Declarar o incidente**: quem detectar corrupção/perda de dados real
   (não um erro transitório) declara formalmente — abrir o caminho de
   comunicação já usado pelo time (ex.: canal de incidente), sem
   depender deste documento para isso.
2. **Papel responsável**: owner/admin técnico com acesso à
   `SUPABASE_DATABASE_URL` real do ambiente afetado e ao painel Supabase.
3. **Interromper writes quando necessário**: colocar a aplicação em modo
   read-only ou parar o processo Node (`src/server/index.ts`) — não há
   um "modo manutenção" automático implementado; parar o processo é o
   mecanismo disponível hoje.
4. **Escolher o ponto de recuperação**: o backup lógico mais recente
   válido (`backups/backup_<schema>_<timestamp>.json`) ou, se disponível
   e verificado (seção 2-A), um ponto de PITR do Supabase.
5. **Criar o ambiente de restore**: um schema novo e vazio no Postgres de
   destino (`CREATE SCHEMA <nome>`), com as migrations aplicadas (`npm
run db:migrate:supabase` apontando para esse schema via
   `search_path`, ou o padrão já usado por
   `tests/helpers/postgres-test-db.ts`).
6. **Restaurar**: `npm run db:restore -- --file <backup> --target-schema
<nome> --confirm-target <nome>`.
7. **Validar** (seção 7 abaixo) antes de prosseguir.
8. **Aplicar migrations posteriores**, se o backup for mais antigo que o
   schema atual (seção 5-C).
9. **Trocar a aplicação para o banco recuperado**: apontar
   `SUPABASE_DATABASE_URL`/`search_path` para o schema restaurado.
10. **Verificar `GET /api/ready`**: deve responder OK antes de reabrir
    tráfego (já existente, Fase de observabilidade — não modificado por
    este bloco).
11. **Smoke checks**: login, leitura de uma Organization real, criação de
    um registro trivial — confirma que o caminho completo (não só o
    banco) funciona.
12. **Reabrir writes/tráfego.**
13. **Registrar o incidente**: o que falhou, ponto de recuperação usado,
    RPO/RTO reais observados versus os objetivos da seção 4, e qualquer
    gap descoberto durante a recuperação.

Nenhuma credencial real deve aparecer no registro do incidente — usar
`redactDatabaseUrl` (já usado nos logs desta ferramenta) como referência
de formato seguro.

## 7. Verificação pós-restore (mínimo obrigatório)

Não considerar um restore bem-sucedido só porque o comando retornou 0.
Confirmar, no schema restaurado:

- conexão ao banco funciona;
- `schema_migrations` no destino reflete a versão esperada (aplicada
  separadamente do restore, ver seção 5);
- tabelas de domínio críticas existem e têm contagem de linhas condizente
  com o backup (`tableOrder`/contagem gravados no próprio arquivo JSON);
- Organizations distintas continuam distintas (nenhum dado de um tenant
  migrou para outro);
- Memberships continuam ligados ao `organization_id`/`user_id` corretos
  (join real, não só o valor da coluna isolado);
- nenhuma linha de fixture/teste sintética aparece misturada a dados
  reais (aplica-se ao ambiente real; a suíte de teste desta seção usa
  apenas dados sintéticos, nunca reais).

A suíte automatizada (`tests/dr/backup-restore.test.ts`) executa
exatamente esse tipo de verificação contra dados sintéticos — serve como
prova de que o mecanismo funciona, não como substituto da verificação
manual em um incidente real com o schema de produção.

## 8. Teste real executado (não apenas documentado)

Executado nesta implementação, contra dois schemas descartáveis
(`tests/helpers/postgres-test-db.ts` — o mesmo mecanismo de isolamento
já usado por toda a suíte `tests/phase1..31` deste projeto):

1. Schema de origem descartável, migrado, com fixture sintética
   multi-tenant (2 Organizations, 2 Users, 2 Memberships, 2 audit_events
   com metadata JSONB, e uma hierarquia real de 3 níveis de
   `organizational_units` — raiz → filha → neta — sob uma das
   Organizations).
2. `dumpSchema` sobre a origem.
3. Schema de destino descartável, migrado e vazio.
4. `assertTargetIsEmpty` + `restoreSchema` sobre o destino.
5. Verificações objetivas: contagem de linhas, Organizations distintas,
   Membership ligado à Organization correta via join real, JSONB
   preservado como objeto (não string escapada), hierarquia de
   `organizational_units` restaurada com `parent_id`/`organization_id`
   exatos e nenhuma unidade cruzando tenant, constraint de FK ainda
   ativa no schema restaurado (uma unidade órfã continua sendo
   recusada).
6. Um segundo teste prova o fail-closed: restaurar sobre um schema que já
   tem uma linha é recusado antes de qualquer insert
   (`RestoreTargetNotEmptyError`).
7. Um terceiro teste embaralha deliberadamente as linhas de
   `organizational_units` no objeto de dump (ordem neta→filha→raiz) e
   confirma que `restoreSchema` ainda restaura corretamente — prova a
   defesa em profundidade do restore, não só do dump.
8. Um quarto teste prova o risco de verdade que motivou esta correção:
   inserir diretamente uma unidade filha antes de sua unidade pai existir
   é recusado pelo próprio Postgres (violação de FK) — é exatamente essa
   situação que dump/restore agora evitam por construção.
9. Testes unitários puros (`tests/dr/row-ordering.test.ts`,
   `tests/dr/topological-sort.test.ts`) cobrem ordenação com FK composta,
   FK apontando para linha ausente do dump, e ciclo auto-referenciado
   (`RowCycleError`), sem precisar de Postgres.
10. Todos os schemas descartáveis usados nos testes acima são destruídos
    ao final (`DROP SCHEMA ... CASCADE`), nunca reaproveitados.

Adicionalmente, os dois scripts de CLI (`db:backup`/`db:restore`, não só
as funções internas) foram executados manualmente de ponta a ponta
contra um par de schemas descartáveis criados só para essa verificação,
confirmando: escrita do arquivo JSON, leitura e restore, bloqueio de
`--target-schema public`, bloqueio de `--confirm-target` divergente, e
bloqueio de restore duplicado sobre schema já populado. Nenhum destes
schemas de verificação foi mantido — todos derrubados ao final.

Um bug real foi encontrado e corrigido durante essa execução: o dump/
restore tratava `schema_migrations` (bookkeeping do próprio runner de
migrations) como tabela de domínio, o que fazia qualquer schema
recém-migrado (inclusive um alvo de restore corretamente vazio) falhar
o check de "destino vazio". Corrigido excluindo essa tabela da
introspecção (`schema-introspection.ts`).

## 9. Gaps conhecidos (não bloqueiam este bloco, registrados para o futuro)

- Nenhum agendamento automático de backup (RPO depende de execução
  manual periódica).
- `pg_dump`/`pg_restore` não testados neste ambiente (ausentes) — o
  caminho nativo em Node é o único validado aqui.
- Cobertura real de PITR/backup gerenciado do Supabase não verificada
  fisicamente contra a conta do projeto.
- Sem cobertura de Storage (não usado hoje) nem de segredos/config.
