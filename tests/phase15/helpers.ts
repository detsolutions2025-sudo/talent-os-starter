import request from "supertest";
import { createPostgresAIService } from "../../src/server/ai/service";
import { createServer } from "../../src/server/app";
import { createOrganizationBlueprintOnboardingHook } from "../../src/server/blueprints/organization-onboarding";
import { createPostgresBlueprintService } from "../../src/server/blueprints/service";
import { createPostgresCandidateApplicationService } from "../../src/server/candidate-applications/service";
import { createPostgresCandidateService } from "../../src/server/candidates/service";
import { createPostgresCompetencyService } from "../../src/server/competencies/service";
import { createCoreService, type OnOrganizationCreatedHook } from "../../src/server/core/service";
import { createPostgresDnaService } from "../../src/server/dna/service";
import { createPostgresInterviewService } from "../../src/server/interviews/service";
import { createPostgresJobOpeningService } from "../../src/server/job-openings/service";
import { createPostgresJobProfileService } from "../../src/server/job-profiles/service";
import { createPostgresOrganizationalUnitService } from "../../src/server/organizational-units/service";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { createPostgresQuestionService } from "../../src/server/questions/service";
import type { PostgresTestDatabase } from "../helpers/postgres-test-db";

export const platformHeaders = { "x-dev-platform-admin": "true" };

export function userHeaders(userId: string) {
  return { "x-dev-user-id": userId };
}

export function unique(value: string) {
  return `${value}-${crypto.randomUUID()}`;
}

// `onOrganizationCreated` e injetavel para permitir testes que provocam falha
// especificamente no hook de onboarding do Blueprint (revisao final da Fase 15, item 2) --
// por padrao usa o hook real de producao.
export function createApp(
  database: PostgresTestDatabase,
  onOrganizationCreated: OnOrganizationCreatedHook = createOrganizationBlueprintOnboardingHook()
) {
  const aiService = createPostgresAIService(database.pool, {});
  return createServer(
    createCoreService(new PostgresCoreRepository(database.pool), onOrganizationCreated),
    createPostgresDnaService(database.pool),
    createPostgresOrganizationalUnitService(database.pool),
    createPostgresCompetencyService(database.pool),
    createPostgresJobProfileService(database.pool),
    createPostgresQuestionService(database.pool),
    createPostgresJobOpeningService(database.pool),
    createPostgresCandidateService(database.pool),
    createPostgresCandidateApplicationService(database.pool),
    createPostgresInterviewService(database.pool),
    aiService,
    createPostgresBlueprintService(database.pool)
  );
}

export async function createUser(app: ReturnType<typeof createApp>, prefix: string) {
  const response = await request(app)
    .post("/api/dev/users")
    .set(platformHeaders)
    .send({ name: prefix, email: `${unique(prefix)}@example.com` })
    .expect(201);
  return response.body as { id: string };
}

export async function createOrganization(app: ReturnType<typeof createApp>, ownerId: string) {
  const slug = unique("bp-org");
  const response = await request(app)
    .post("/api/organizations")
    .set(platformHeaders)
    .send({ name: `Organization ${slug}`, slug, initialOwnerUserId: ownerId })
    .expect(201);
  return response.body as { organization: { id: string }; membership: { id: string } };
}

export async function addMembership(
  app: ReturnType<typeof createApp>,
  organizationId: string,
  ownerId: string,
  userId: string,
  role: "admin" | "member"
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/memberships`)
    .set(userHeaders(ownerId))
    .send({ userId, role })
    .expect(201);
  return response.body as { id: string };
}

export type OrgFixture = {
  organizationId: string;
  ownerId: string;
  adminId: string;
  memberId: string;
};

export async function createOrgWithMembers(app: ReturnType<typeof createApp>): Promise<OrgFixture> {
  const owner = await createUser(app, "owner");
  const admin = await createUser(app, "admin");
  const member = await createUser(app, "member");
  const org = await createOrganization(app, owner.id);
  await addMembership(app, org.organization.id, owner.id, admin.id, "admin");
  await addMembership(app, org.organization.id, owner.id, member.id, "member");
  return {
    organizationId: org.organization.id,
    ownerId: owner.id,
    adminId: admin.id,
    memberId: member.id
  };
}

// Configura o minimo necessario (DNA publicado) para que a readiness da Organization fique
// `ready` e a ativacao (Etapa 10) seja possivel -- Cargo publicado e Estrutura Organizacional
// permanecem opcionais/recomendacao (nunca bloqueiam, Plano Tecnico Revisado item 22).
export async function makeBlueprintReady(app: ReturnType<typeof createApp>, fixture: OrgFixture) {
  const draft = await request(app)
    .post(`/api/organizations/${fixture.organizationId}/dna/drafts`)
    .set(userHeaders(fixture.ownerId))
    .send({
      mission: "Missao de teste",
      vision: "Visao de teste",
      purpose: "Proposito de teste",
      values: [
        {
          name: "Colaboracao",
          description: "Trabalhar em equipe de forma transparente.",
          practicalMeaning: "Compartilhar contexto e ajudar colegas.",
          expectedBehaviors: [],
          incompatibleBehaviors: []
        }
      ],
      competencies: [
        {
          name: "Comunicacao",
          description: "Capacidade de se comunicar com clareza.",
          importance: "high",
          examples: []
        }
      ],
      culture: "Cultura de teste",
      leadershipStyle: "Colaborativo",
      workEnvironment: "Hibrido"
    })
    .expect(201);

  await request(app)
    .post(`/api/organizations/${fixture.organizationId}/dna/drafts/${draft.body.id}/publish`)
    .set(userHeaders(fixture.ownerId))
    .expect(200);
}
