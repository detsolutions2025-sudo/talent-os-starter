import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";
import {
  addMembership,
  createActiveEmploymentFixture,
  grantAccess,
  platformHeaders,
  revokeAccess,
  userHeaders
} from "./helpers";

// Fase 28 (SPEC-027 v1.0 s26). Gate final de concorrencia: os pares desta secao usam DUAS
// requisicoes HTTP disparadas com `Promise.all` (nunca `await` sequencial) contra o MESMO
// `pg.Pool` -- cada `supertest` request abre sua PROPRIA conexao/transacao fisica via
// `runTransaction`/`CoreService.updateMembership`. A "barreira deterministica" exigida pelo
// enunciado, quando o par contesta a MESMA linha (`Membership` ou `AccessGrant`), e o proprio
// lock `FOR UPDATE`/`lockMembershipsByOrganization` do PostgreSQL: a segunda transacao BLOQUEIA
// fisicamente ate a primeira commitar/reverter, garantindo sobreposicao real (nao sorte de
// timing) -- exatamente o mesmo padrao ja usado e comprovado em
// `tests/phase24/employment-destructive-postgres.test.ts` ("create x create", "activate x
// activate"). Nenhum `pg_sleep`/advisory lock foi necessario porque a contencao physical do
// lock ja e a barreira.
//
// Para os pares SEM linha fisica compartilhada (H/I: `Organization.archive` x `grant`/`revoke`),
// nao existe lock de `organizations` em NENHUM dominio deste projeto (Employment/Offboarding
// tem a mesma caracteristica) -- a janela residual de corrida e documentada explicitamente no
// teste, nao escondida.
describe("Fase 28 - AccessGrant (concorrencia real PostgreSQL)", () => {
  let database: PostgresTestDatabase;

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
  }, 60000);

  afterAll(async () => {
    await database.cleanup();
  });

  function isDeadlockOrSerializationCode(body: unknown) {
    const code = (body as { error?: { code?: string } } | undefined)?.error?.code ?? "";
    return code === "access_grant_concurrent_change";
  }

  it("A. grant x grant na mesma Membership: exatamente um active, nunca 500", async () => {
    const fixture = await createActiveEmploymentFixture(database, "conc-a");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "conc-a"
    );

    const [first, second] = await Promise.all([
      grantAccess(fixture, {
        organizationPersonId: fixture.organizationPersonId,
        membershipId,
        provenanceType: "employment",
        employmentId: fixture.employmentId
      }),
      grantAccess(fixture, {
        organizationPersonId: fixture.organizationPersonId,
        membershipId,
        provenanceType: "administrative",
        grantReason: "Segunda tentativa concorrente para a mesma Membership."
      })
    ]);

    for (const response of [first, second]) {
      expect(response.status).not.toBe(500);
      expect(isDeadlockOrSerializationCode(response.body)).toBe(false);
    }
    // Conjunto valido enumerado: exatamente uma das duas vence (201) e a outra recebe conflito
    // seguro (409, indice parcial unico). Nunca as duas com 201, nunca as duas com 409.
    expect([first.status, second.status].sort()).toEqual([201, 409]);

    const count = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM access_grants WHERE organization_id = $1 AND membership_id = $2 AND status = 'active'",
      [fixture.organizationId, membershipId]
    );
    expect(count.rows[0].count).toBe(1);
  });

  it("B. revoke x revoke no mesmo AccessGrant: revoked final, Membership inactive, uma unica desativacao efetiva", async () => {
    const fixture = await createActiveEmploymentFixture(database, "conc-b");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "conc-b"
    );
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);

    const [first, second] = await Promise.all([
      revokeAccess(fixture, grant.body.id, "role_change", crypto.randomUUID()),
      revokeAccess(fixture, grant.body.id, "security_concern", crypto.randomUUID())
    ]);

    for (const response of [first, second]) {
      expect(response.status).not.toBe(500);
    }
    // Uma das duas revoga de fato (200); a outra, ao acquirir o lock depois, encontra o
    // AccessGrant ja `revoked` (nao mais `active`) e recebe conflito seguro.
    expect([first.status, second.status].sort()).toEqual([200, 409]);

    const grantAfter = await database.pool.query("SELECT status FROM access_grants WHERE id = $1", [
      grant.body.id
    ]);
    expect(grantAfter.rows[0].status).toBe("revoked");

    const membershipAfter = await database.pool.query(
      "SELECT status FROM memberships WHERE id = $1",
      [membershipId]
    );
    expect(membershipAfter.rows[0].status).toBe("inactive");

    // Exatamente UMA revogacao de AccessGrant e efetiva -- nunca duplicada.
    const revokedAudit = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM audit_events WHERE organization_id = $1 AND action = 'access_grant.revoked' AND metadata->>'accessGrantId' = $2",
      [fixture.organizationId, grant.body.id]
    );
    expect(revokedAudit.rows[0].count).toBe(1);

    // A segunda tentativa nunca chega a chamar CoreService.updateMembership (o guard de status
    // `!== 'active'` do revoke barra antes) -- exatamente um `membership.deactivated`.
    const deactivatedAudit = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM audit_events WHERE organization_id = $1 AND action = 'membership.deactivated' AND metadata->>'membershipId' = $2",
      [fixture.organizationId, membershipId]
    );
    expect(deactivatedAudit.rows[0].count).toBe(1);
  });

  it("C. grant x Membership deactivate direta: serializado pelo lock; Membership decide sozinha se concede acesso", async () => {
    const fixture = await createActiveEmploymentFixture(database, "conc-c");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "conc-c"
    );

    const [grantResponse, deactivateResponse] = await Promise.all([
      grantAccess(fixture, {
        organizationPersonId: fixture.organizationPersonId,
        membershipId,
        provenanceType: "employment",
        employmentId: fixture.employmentId
      }),
      request(fixture.app)
        .patch(`/api/memberships/${membershipId}`)
        .set(userHeaders(fixture.ownerId))
        .send({ status: "inactive" })
    ]);

    expect(grantResponse.status).not.toBe(500);
    // A desativacao direta via Core nunca depende de AccessGrant -- deve sempre suceder,
    // independente da ordem.
    expect(deactivateResponse.status).toBe(200);
    // grant so pode vencer (201, se seu lock em Membership veio primeiro e a linha ainda estava
    // active) ou perder por elegibilidade (409, se a desativacao venceu primeiro) -- nunca outro
    // codigo.
    expect([201, 409]).toContain(grantResponse.status);

    const membershipAfter = await database.pool.query(
      "SELECT status FROM memberships WHERE id = $1",
      [membershipId]
    );
    // Membership e a UNICA fonte de verdade: ela termina `inactive` independentemente de quem
    // venceu a corrida (a desativacao direta sempre e aplicada).
    expect(membershipAfter.rows[0].status).toBe("inactive");

    const activeGrants = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM access_grants WHERE organization_id = $1 AND membership_id = $2 AND status = 'active'",
      [fixture.organizationId, membershipId]
    );
    // Se o grant venceu (201), o AccessGrant permanece `active` mesmo com a Membership agora
    // `inactive` -- proveniencia desatualizada, nao estado invalido (SPEC-027 s21). Se o grant
    // perdeu (409), nao existe nenhuma linha active.
    expect(activeGrants.rows[0].count).toBe(grantResponse.status === 201 ? 1 : 0);
  });

  it("D. revoke x Membership deactivate direta: nunca deadlock/500; AccessGrant sempre revoked; Membership sempre inactive", async () => {
    const fixture = await createActiveEmploymentFixture(database, "conc-d");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "conc-d"
    );
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);

    const [revokeResponse, deactivateResponse] = await Promise.all([
      revokeAccess(fixture, grant.body.id, "security_concern"),
      request(fixture.app)
        .patch(`/api/memberships/${membershipId}`)
        .set(userHeaders(fixture.ownerId))
        .send({ status: "inactive" })
    ]);

    expect(revokeResponse.status).not.toBe(500);
    expect(revokeResponse.status).toBe(200);
    expect(deactivateResponse.status).toBe(200);

    const grantAfter = await database.pool.query("SELECT status FROM access_grants WHERE id = $1", [
      grant.body.id
    ]);
    expect(grantAfter.rows[0].status).toBe("revoked");
    const membershipAfter = await database.pool.query(
      "SELECT status FROM memberships WHERE id = $1",
      [membershipId]
    );
    expect(membershipAfter.rows[0].status).toBe("inactive");

    // access_grant.revoked e inteiramente controlado por este dominio -- sempre exatamente um.
    const revokedAudit = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM audit_events WHERE organization_id = $1 AND action = 'access_grant.revoked' AND metadata->>'accessGrantId' = $2",
      [fixture.organizationId, grant.body.id]
    );
    expect(revokedAudit.rows[0].count).toBe(1);

    // membership.deactivated: o PATCH direto e uma chamada INDEPENDENTE a
    // CoreService.updateMembership, que sempre audita quando `input.status === 'inactive'`
    // (comportamento do proprio CoreService, Fase 1, fora do escopo desta Fase) --
    // independentemente de a linha ja estar inactive. O guard de "Membership ja inactive" do
    // `revoke` (SPEC-027 s13 passo 4) so evita a chamada REDUNDANTE feita PELO PROPRIO revoke;
    // ele nunca pode (nem deve) suprimir a auditoria de uma chamada direta e independente feita
    // por outro ator. Por isso o conjunto valido e {1, 2}, nunca 0 e nunca >2:
    // - 1, se o PATCH direto venceu o lock e completou antes da leitura do revoke (o revoke ve
    //   `inactive` e pula sua propria chamada ao Core);
    // - 2, se o revoke venceu o lock e chamou o Core primeiro (1 audit), e o PATCH, ao ser
    //   liberado depois, ainda assim executa sua propria chamada incondicional ao Core (2o audit).
    const deactivatedAudit = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM audit_events WHERE organization_id = $1 AND action = 'membership.deactivated' AND metadata->>'membershipId' = $2",
      [fixture.organizationId, membershipId]
    );
    expect([1, 2]).toContain(deactivatedAudit.rows[0].count);
  });

  it("E. revoke x role change (member/admin): serializado; RBAC do Core preservado; sem escalonamento de privilegio", async () => {
    const fixture = await createActiveEmploymentFixture(database, "conc-e");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "conc-e"
    );
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);

    const [revokeResponse, roleChangeResponse] = await Promise.all([
      revokeAccess(fixture, grant.body.id, "role_change"),
      request(fixture.app)
        .patch(`/api/memberships/${membershipId}`)
        .set(userHeaders(fixture.ownerId))
        .send({ role: "admin" })
    ]);

    expect(revokeResponse.status).not.toBe(500);
    expect(roleChangeResponse.status).not.toBe(500);
    expect(revokeResponse.status).toBe(200);
    expect(roleChangeResponse.status).toBe(200);

    const membershipAfter = await database.pool.query(
      "SELECT role, status FROM memberships WHERE id = $1",
      [membershipId]
    );
    // AccessGrant nunca toca `role` -- a mudanca de role e preservada integralmente,
    // independentemente da ordem de commit, e a desativacao tambem se aplica: nenhum
    // escalonamento, nenhum estado hibrido invalido.
    expect(membershipAfter.rows[0].role).toBe("admin");
    expect(membershipAfter.rows[0].status).toBe("inactive");
  });

  it("E2. revoke x role change para owner (cenario owner-relevante): RBAC do Core decide, AccessGrant nunca cria bypass", async () => {
    const fixture = await createActiveEmploymentFixture(database, "conc-e2");
    const { membershipId, userId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "conc-e2"
    );
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);

    const [revokeResponse, promoteResponse] = await Promise.all([
      revokeAccess(fixture, grant.body.id, "role_change"),
      request(fixture.app)
        .patch(`/api/memberships/${membershipId}`)
        .set(userHeaders(fixture.ownerId))
        .send({ role: "owner" })
    ]);

    expect(revokeResponse.status).not.toBe(500);
    expect(promoteResponse.status).not.toBe(500);
    // Promocao a owner e uma operacao legitima do owner atual sobre a matriz de SPEC-004 --
    // sempre sucede aqui (nenhuma protecao de ultimo owner se aplica a PROMOVER).
    expect(promoteResponse.status).toBe(200);
    expect(revokeResponse.status).toBe(200);

    const membershipAfter = await database.pool.query(
      "SELECT role, status FROM memberships WHERE id = $1",
      [membershipId]
    );
    expect(membershipAfter.rows[0].role).toBe("owner");
    // O novo owner foi desativado pela revogacao -- valido, pois no momento da revogacao ele
    // nao era o ultimo owner ativo da Organization (o owner original da fixture continua ativo).
    expect(membershipAfter.rows[0].status).toBe("inactive");
    const owners = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM memberships WHERE organization_id = $1 AND role = 'owner' AND status = 'active'",
      [fixture.organizationId]
    );
    expect(owners.rows[0].count).toBeGreaterThanOrEqual(1);
    void userId;
  });

  it("F. ultimo owner x mudanca de ownership: nunca zero owners ativos; conjunto de resultados enumerado", async () => {
    const fixture = await createActiveEmploymentFixture(database, "conc-f");
    const second = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "conc-f"
    );
    await request(fixture.app)
      .patch(`/api/memberships/${second.membershipId}`)
      .set(userHeaders(fixture.ownerId))
      .send({ role: "owner" })
      .expect(200);

    // Achado de teste (Fase 28, gate de concorrencia; bug de teste, nao de producao): as duas
    // operacoes concorrentes usam DOIS atores DISTINTOS, cada um agindo sobre a PROPRIA
    // Membership -- owner A (fixture.ownerId) revoga o proprio AccessGrant; owner B
    // (second.userId) se autodesativa. Uma primeira versao usava o MESMO ator
    // (fixture.ownerId) para as duas chamadas, uma delas visando a Membership DO PROPRIO ator --
    // quando essa chamada vencia a corrida primeiro, o ator perdia a propria Membership ativa a
    // meio da segunda requisicao (ja em voo), que entao falhava com 403 `membership_required`
    // em vez do 409 `last_owner_required` esperado. Nao e um defeito de RBAC: e um artefato de
    // desenho do teste (reusar o mesmo ator para as duas pontas de uma corrida que pode
    // desativar esse mesmo ator). Corrigido separando os atores.
    const ownerAId = String(
      (
        await database.pool.query(
          "SELECT id FROM memberships WHERE organization_id = $1 AND user_id = $2",
          [fixture.organizationId, fixture.ownerId]
        )
      ).rows[0].id
    );
    const ownerBId = second.membershipId;

    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId: ownerAId,
      provenanceType: "administrative",
      grantReason: "AccessGrant do owner A para teste de ultimo owner concorrente."
    }).expect(201);

    const [revokeResponse, deactivateBResponse] = await Promise.all([
      revokeAccess(
        fixture,
        grant.body.id,
        "administrative_correction",
        crypto.randomUUID(),
        fixture.ownerId
      ),
      request(fixture.app)
        .patch(`/api/memberships/${ownerBId}`)
        .set(userHeaders(second.userId))
        .send({ status: "inactive" })
    ]);

    expect(revokeResponse.status).not.toBe(500);
    expect(deactivateBResponse.status).not.toBe(500);
    // Conjunto valido enumerado: exatamente uma das duas desativacoes vence; a outra e negada
    // por RN-006 (ultimo owner), na ordem que for -- NUNCA as duas vencendo (o que zeraria
    // owners ativos).
    const outcome = [revokeResponse.status, deactivateBResponse.status].sort();
    expect(outcome).toEqual([200, 409]);

    const activeOwners = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM memberships WHERE organization_id = $1 AND role = 'owner' AND status = 'active'",
      [fixture.organizationId]
    );
    // Invariante mais forte de todas: a Organization NUNCA termina sem nenhum owner ativo.
    expect(activeOwners.rows[0].count).toBe(1);

    // Se a revogacao foi negada (409), o AccessGrant permanece active -- nunca revoked sem a
    // mutacao de Membership correspondente ter sido efetivada (SPEC-027 s28).
    const grantAfter = await database.pool.query("SELECT status FROM access_grants WHERE id = $1", [
      grant.body.id
    ]);
    if (revokeResponse.status === 409) {
      expect(grantAfter.rows[0].status).toBe("active");
    } else {
      expect(grantAfter.rows[0].status).toBe("revoked");
    }
  });

  it("G. grant x Employment.end: ortogonais, ambos sempre sucedem, proveniencia permanece valida", async () => {
    const fixture = await createActiveEmploymentFixture(database, "conc-g");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "conc-g"
    );

    const [grantResponse, endResponse] = await Promise.all([
      grantAccess(fixture, {
        organizationPersonId: fixture.organizationPersonId,
        membershipId,
        provenanceType: "employment",
        employmentId: fixture.employmentId
      }),
      request(fixture.app)
        .post(
          `/api/organizations/${fixture.organizationId}/employments/${fixture.employmentId}/end`
        )
        .set(userHeaders(fixture.ownerId))
        .set("Idempotency-Key", crypto.randomUUID())
        .send({ endDate: "2026-09-01", reason: "Encerramento concorrente com grant." })
    ]);

    expect(grantResponse.status).not.toBe(500);
    expect(endResponse.status).not.toBe(500);
    // `active` e `ended` sao igualmente elegiveis como proveniencia (SPEC-027 s8) -- a corrida
    // com Employment.end() nunca deve, por si so, impedir a concessao.
    expect(grantResponse.status).toBe(201);
    expect(endResponse.status).toBe(200);

    const grantRow = await database.pool.query(
      "SELECT employment_id, status FROM access_grants WHERE id = $1",
      [grantResponse.body.id]
    );
    expect(grantRow.rows[0].employment_id).toBe(fixture.employmentId);
    expect(grantRow.rows[0].status).toBe("active");
    const employmentAfter = await database.pool.query(
      "SELECT status FROM employments WHERE id = $1",
      [fixture.employmentId]
    );
    expect(employmentAfter.rows[0].status).toBe("ended");
  });

  it("H. Organization archive x grant: nunca 500; archive sempre sucede; grant reflete a ordem de commit sem estado corrompido", async () => {
    const fixture = await createActiveEmploymentFixture(database, "conc-h");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "conc-h"
    );

    // Achado documentado (nao um defeito exclusivo da Fase 28): nem `grant` nem
    // `archiveOrganization` tomam lock explicito na linha de `organizations` -- nenhum dominio
    // pos-contratacao deste projeto toma (Employment/Offboarding tem a mesma caracteristica).
    // A revalidacao de `Organization` ativa DENTRO da transacao de `grant` (adicionada nesta
    // tarefa, `requireActiveOrganization`) fecha a janela entre o `authorizeUser` inicial e a
    // abertura da transacao, mas nao elimina 100% a janela residual entre essa revalidacao e o
    // commit final -- por isso o resultado de `grant` e um conjunto enumerado, nao um unico
    // valor determinado pela ordem de disparo.
    const [archiveResponse, grantResponse] = await Promise.all([
      request(fixture.app)
        .post(`/api/organizations/${fixture.organizationId}/archive`)
        .set(platformHeaders),
      grantAccess(fixture, {
        organizationPersonId: fixture.organizationPersonId,
        membershipId,
        provenanceType: "employment",
        employmentId: fixture.employmentId
      })
    ]);

    expect(archiveResponse.status).not.toBe(500);
    expect(grantResponse.status).not.toBe(500);
    expect(archiveResponse.status).toBe(200);
    expect([201, 403]).toContain(grantResponse.status);

    const organizationAfter = await database.pool.query(
      "SELECT status FROM organizations WHERE id = $1",
      [fixture.organizationId]
    );
    expect(organizationAfter.rows[0].status).toBe("archived");

    const activeGrants = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM access_grants WHERE organization_id = $1 AND membership_id = $2 AND status = 'active'",
      [fixture.organizationId, membershipId]
    );
    expect(activeGrants.rows[0].count).toBe(grantResponse.status === 201 ? 1 : 0);
  });

  it("I. Organization archive x revoke: nunca 500; resultado deterministico pela ordem de commit; sem estado parcial", async () => {
    const fixture = await createActiveEmploymentFixture(database, "conc-i");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "conc-i"
    );
    const grant = await grantAccess(fixture, {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    }).expect(201);

    const [archiveResponse, revokeResponse] = await Promise.all([
      request(fixture.app)
        .post(`/api/organizations/${fixture.organizationId}/archive`)
        .set(platformHeaders),
      revokeAccess(fixture, grant.body.id, "administrative_correction")
    ]);

    expect(archiveResponse.status).not.toBe(500);
    expect(revokeResponse.status).not.toBe(500);
    expect(archiveResponse.status).toBe(200);
    expect([200, 403]).toContain(revokeResponse.status);

    const grantAfter = await database.pool.query("SELECT status FROM access_grants WHERE id = $1", [
      grant.body.id
    ]);
    const membershipAfter = await database.pool.query(
      "SELECT status FROM memberships WHERE id = $1",
      [membershipId]
    );
    // Sem estado parcial: revoke bem sucedido (200) implica AMBOS revoked+inactive; revoke
    // bloqueado (403) implica AMBOS active -- nunca uma combinacao cruzada.
    if (revokeResponse.status === 200) {
      expect(grantAfter.rows[0].status).toBe("revoked");
      expect(membershipAfter.rows[0].status).toBe("inactive");
    } else {
      expect(grantAfter.rows[0].status).toBe("active");
      expect(membershipAfter.rows[0].status).toBe("active");
    }
  });

  it("mesma Idempotency-Key simultanea: uma unica mutacao de negocio, uma unica linha", async () => {
    const fixture = await createActiveEmploymentFixture(database, "conc-idem");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "conc-idem"
    );
    const key = crypto.randomUUID();
    const payload = {
      organizationPersonId: fixture.organizationPersonId,
      membershipId,
      provenanceType: "employment",
      employmentId: fixture.employmentId
    };

    const [first, second] = await Promise.all([
      grantAccess(fixture, payload, key),
      grantAccess(fixture, payload, key)
    ]);

    for (const response of [first, second]) {
      expect(response.status).not.toBe(500);
    }
    // `Promise.all` preserva a ORDEM DE ENTRADA no array de resultado, nao a ordem de conclusao
    // -- ou seja, `first`/`second` aqui NAO indicam qual das duas chegou primeiro ao banco.
    // Conjunto valido enumerado, por CONTAGEM (nao por posicao): exatamente uma das duas e 201
    // (a vencedora); a outra e 201 (replay idempotente, se a vencedora ja tiver completado a
    // tempo) OU 409 `access_grant_idempotency_in_progress` (se a vencedora ainda estava
    // `pending` no momento em que a perdedora consultou a chave) -- nunca as duas com 409, nunca
    // as duas com um `id` diferente.
    const statuses = [first.status, second.status];
    expect(statuses.filter((status) => status === 201).length).toBeGreaterThanOrEqual(1);
    for (const status of statuses) {
      expect([201, 409]).toContain(status);
    }
    const successfulIds = new Set(
      [first, second]
        .filter((response) => response.status === 201)
        .map((response) => response.body.id)
    );
    // Toda resposta 201 -- seja a vencedora original, seja um replay idempotente -- aponta para
    // o MESMO AccessGrant. Nunca dois ids diferentes sob a mesma Idempotency-Key.
    expect(successfulIds.size).toBe(1);

    const count = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM access_grants WHERE organization_id = $1 AND membership_id = $2",
      [fixture.organizationId, membershipId]
    );
    expect(count.rows[0].count).toBe(1);

    const keyRows = await database.pool.query(
      "SELECT status FROM access_grant_idempotency_keys WHERE organization_id = $1 AND operation = 'grant' AND scope_id = $2",
      [fixture.organizationId, membershipId]
    );
    expect(keyRows.rowCount).toBe(1);
    expect(keyRows.rows[0].status).toBe("completed");
  });

  it("mesma Idempotency-Key + fingerprint divergente sob concorrencia: conflito seguro, uma unica linha", async () => {
    const fixture = await createActiveEmploymentFixture(database, "conc-idem2");
    const { membershipId } = await addMembership(
      fixture.app,
      fixture.organizationId,
      fixture.ownerId,
      "member",
      "conc-idem2"
    );
    const key = crypto.randomUUID();

    const [first, second] = await Promise.all([
      grantAccess(
        fixture,
        {
          organizationPersonId: fixture.organizationPersonId,
          membershipId,
          provenanceType: "employment",
          employmentId: fixture.employmentId
        },
        key
      ),
      grantAccess(
        fixture,
        {
          organizationPersonId: fixture.organizationPersonId,
          membershipId,
          provenanceType: "administrative",
          grantReason: "Payload divergente sob a mesma chave, em concorrencia real."
        },
        key
      )
    ]);

    for (const response of [first, second]) {
      expect(response.status).not.toBe(500);
    }
    // Conjunto valido enumerado: a vencedora sempre 201; a perdedora e 409, seja por conflito de
    // fingerprint (se a vencedora ja tiver completado) seja por "in progress" (se ainda pending)
    // -- nunca 201 para as duas (fingerprints diferentes nunca podem compartilhar resultado).
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const count = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM access_grants WHERE organization_id = $1 AND membership_id = $2",
      [fixture.organizationId, membershipId]
    );
    expect(count.rows[0].count).toBe(1);
  });
});
