import request from "supertest";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/app";
import {
  CandidateApplicationService,
  createPostgresCandidateApplicationService
} from "../../src/server/candidate-applications/service";
import type { CandidateApplicationRepository } from "../../src/server/candidate-applications/repository";
import { createPostgresCandidateService } from "../../src/server/candidates/service";
import { createPostgresCompetencyService } from "../../src/server/competencies/service";
import { createCoreService } from "../../src/server/core/service";
import type { AuditEvent } from "../../src/server/core/types";
import { createPostgresDnaService } from "../../src/server/dna/service";
import { createPostgresJobOpeningService } from "../../src/server/job-openings/service";
import { createPostgresJobProfileService } from "../../src/server/job-profiles/service";
import { createPostgresOrganizationalUnitService } from "../../src/server/organizational-units/service";
import { PostgresCandidateApplicationRepository } from "../../src/server/persistence/postgres-candidate-application-repository";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { createPostgresQuestionService } from "../../src/server/questions/service";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";

const platformHeaders = { "x-dev-platform-admin": "true" };

function unique(value: string) {
  return `${value}-${crypto.randomUUID()}`;
}

function createApp(
  database: PostgresTestDatabase,
  applicationService = createPostgresCandidateApplicationService
) {
  return createServer(
    createCoreService(new PostgresCoreRepository(database.pool)),
    createPostgresDnaService(database.pool),
    createPostgresOrganizationalUnitService(database.pool),
    createPostgresCompetencyService(database.pool),
    createPostgresJobProfileService(database.pool),
    createPostgresQuestionService(database.pool),
    createPostgresJobOpeningService(database.pool),
    createPostgresCandidateService(database.pool),
    applicationService(database.pool)
  );
}

async function createUser(app: ReturnType<typeof createServer>, prefix: string) {
  const response = await request(app)
    .post("/api/dev/users")
    .set(platformHeaders)
    .send({ name: prefix, email: `${unique(prefix)}@example.com` })
    .expect(201);
  return response.body as { id: string };
}

async function createOrganization(app: ReturnType<typeof createServer>, ownerId: string) {
  const slug = unique("app-org");
  const response = await request(app)
    .post("/api/organizations")
    .set(platformHeaders)
    .send({ name: `Organization ${slug}`, slug, initialOwnerUserId: ownerId })
    .expect(201);
  return response.body as { organization: { id: string } };
}

async function addMembership(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  userId: string,
  role: "admin" | "member"
) {
  await request(app)
    .post(`/api/organizations/${organizationId}/memberships`)
    .set({ "x-dev-user-id": ownerId })
    .send({ userId, role })
    .expect(201);
}

async function createCandidate(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  email = `${unique("candidate")}@example.com`,
  consentStatus = "granted"
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/candidates`)
    .set({ "x-dev-user-id": ownerId })
    .send({
      fullName: "Ana Candidate",
      preferredName: "Ana",
      email,
      phone: "+55 11 99999-0000",
      secondaryPhone: "+55 11 98888-0000",
      source: "manual",
      professionalSummary: "Senior operator",
      location: {
        country: "BR",
        state: "SP",
        city: "Sao Paulo",
        neighborhood: "Centro",
        postalCode: "01000-000",
        address: "Rua Segura 123"
      },
      experiences: [{ company: "Example", title: "Analyst", startDate: "2021-01-01" }],
      education: [{ institution: "Uni", course: "CS", level: "undergraduate" }],
      certifications: [{ name: "Cert", issuer: "Issuer" }],
      languages: [{ language: "English", level: "advanced" }],
      professionalLinks: [{ type: "linkedin", url: "https://example.com/in/ana" }],
      declaredCompetencies: ["TypeScript"],
      workAuthorization: { country: "BR", authorized: true, sponsorshipRequired: false },
      salaryExpectation: { min: 1000, max: 2000, currency: "USD", periodicity: "monthly" },
      consent: {
        status: consentStatus,
        source: "manual",
        termsVersion: "v1",
        purpose: "Recruiting"
      }
    })
    .expect(201);
  return response.body as { id: string };
}

async function createPublishedOpenJob(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  const profileVersion = await createPublishedJobProfileVersion(
    app,
    organizationId,
    ownerId,
    suffix
  );
  const opening = await request(app)
    .post(`/api/organizations/${organizationId}/job-openings`)
    .set({ "x-dev-user-id": ownerId })
    .send({
      code: `APP-${suffix}`,
      title: `Internal ${suffix}`,
      publicTitle: `Public ${suffix}`,
      positionsCount: 1,
      jobProfileVersionId: profileVersion.id
    })
    .expect(201);
  const draft = await request(app)
    .get(`/api/organizations/${organizationId}/job-openings/${opening.body.id}/draft`)
    .set({ "x-dev-user-id": ownerId })
    .expect(200);
  const published = await request(app)
    .post(
      `/api/organizations/${organizationId}/job-openings/${opening.body.id}/drafts/${draft.body.id}/publish`
    )
    .set({ "x-dev-user-id": ownerId })
    .expect(200);
  await request(app)
    .post(`/api/organizations/${organizationId}/job-openings/${opening.body.id}/open`)
    .set({ "x-dev-user-id": ownerId })
    .expect(200);
  return { id: opening.body.id as string, versionId: published.body.id as string };
}

async function createDraftForJob(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  jobOpeningId: string
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/job-openings/${jobOpeningId}/drafts`)
    .set({ "x-dev-user-id": ownerId })
    .expect(201);
  return response.body as { id: string };
}

async function createPublishedJobProfileVersion(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  const competency = await request(app)
    .post(`/api/organizations/${organizationId}/competencies`)
    .set({ "x-dev-user-id": ownerId })
    .send({
      code: `APP-CMP-${suffix}`,
      name: `Application competency ${suffix}`,
      category: "technical",
      definition: "Definition",
      positiveEvidences: [],
      negativeEvidences: [],
      practicalExamples: [],
      proficiencyLevels: ["basic", "intermediate", "proficient", "advanced", "reference"].map(
        (code, index) => ({
          number: index + 1,
          code,
          displayName: code,
          description: `${code} description`,
          observableEvidences: []
        })
      ),
      status: "active"
    })
    .expect(201);
  const catalog = await request(app)
    .get(`/api/organizations/${organizationId}/competencies/catalog`)
    .set({ "x-dev-user-id": ownerId })
    .expect(200);
  void competency;
  const item = catalog.body[0] as { competencyCatalogItemId: string };
  const profile = await request(app)
    .post(`/api/organizations/${organizationId}/job-profiles`)
    .set({ "x-dev-user-id": ownerId })
    .send({ code: `APP-JOB-${suffix}`, name: `Job ${suffix}` })
    .expect(201);
  const draft = await request(app)
    .post(`/api/organizations/${organizationId}/job-profiles/${profile.body.id}/drafts`)
    .set({ "x-dev-user-id": ownerId })
    .send({
      title: `Job ${suffix}`,
      mission: "Mission",
      summary: "Summary",
      responsibilities: [{ text: "Do work", displayOrder: 0 }],
      requirements: [],
      education: { level: "not_required", area: "", required: false, note: "" },
      certifications: [],
      languages: [],
      tools: [],
      workModel: "remote",
      workSchedule: { weeklyHours: 40, description: "Full", shift: "day" },
      travelRequirement: "none",
      salaryRange: { min: 1000, max: 2000, currency: "USD", periodicity: "monthly" },
      notes: "",
      competencies: [
        {
          competencyCatalogItemId: item.competencyCatalogItemId,
          expectedLevel: 3,
          required: true,
          displayOrder: 0
        }
      ]
    })
    .expect(201);
  const published = await request(app)
    .post(
      `/api/organizations/${organizationId}/job-profiles/${profile.body.id}/drafts/${draft.body.id}/publish`
    )
    .set({ "x-dev-user-id": ownerId })
    .expect(200);
  return published.body as { id: string };
}

async function createApplication(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  candidateId: string,
  jobOpeningId: string,
  jobOpeningVersionId: string
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/candidate-applications`)
    .set({ "x-dev-user-id": ownerId })
    .send({ candidateId, jobOpeningId, jobOpeningVersionId, source: "manual" })
    .expect(201);
  return response.body as { id: string; currentStage: string; applicationStatus: string };
}

describe("phase 9 candidate applications API", () => {
  let database: PostgresTestDatabase;
  let app: ReturnType<typeof createServer>;

  beforeAll(async () => {
    process.env.APP_ENV = "test";
    database = await createPostgresTestDatabase();
  });

  beforeEach(() => {
    process.env.APP_ENV = "test";
    app = createApp(database);
  });

  afterAll(async () => {
    await database.cleanup();
  });

  it("creates applications only for same Organization, active Candidate and published open Job Opening", async () => {
    const ownerA = await createUser(app, "owner-app-a");
    const ownerB = await createUser(app, "owner-app-b");
    const orgA = await createOrganization(app, ownerA.id);
    const orgB = await createOrganization(app, ownerB.id);
    const candidateA = await createCandidate(app, orgA.organization.id, ownerA.id);
    const candidateB = await createCandidate(app, orgB.organization.id, ownerB.id);
    const jobA = await createPublishedOpenJob(app, orgA.organization.id, ownerA.id, "A");
    const jobB = await createPublishedOpenJob(app, orgB.organization.id, ownerB.id, "B");

    const application = await createApplication(
      app,
      orgA.organization.id,
      ownerA.id,
      candidateA.id,
      jobA.id,
      jobA.versionId
    );
    expect(application.applicationStatus).toBe("active");
    expect(application.currentStage).toBe("applied");

    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/candidate-applications`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({
        candidateId: candidateB.id,
        jobOpeningId: jobA.id,
        jobOpeningVersionId: jobA.versionId,
        source: "manual"
      })
      .expect(404);

    await request(app)
      .post(`/api/organizations/${orgA.organization.id}/candidate-applications`)
      .set({ "x-dev-user-id": ownerA.id })
      .send({
        candidateId: candidateA.id,
        jobOpeningId: jobB.id,
        jobOpeningVersionId: jobB.versionId,
        source: "manual"
      })
      .expect(404);
  });

  it("rejects duplicate active applications and concurrent creation", async () => {
    const owner = await createUser(app, "owner-app-dup");
    const { organization } = await createOrganization(app, owner.id);
    const candidate = await createCandidate(app, organization.id, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "DUP");

    await createApplication(app, organization.id, owner.id, candidate.id, job.id, job.versionId);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        candidateId: candidate.id,
        jobOpeningId: job.id,
        jobOpeningVersionId: job.versionId,
        source: "manual"
      })
      .expect(409);

    const secondCandidate = await createCandidate(app, organization.id, owner.id);
    const results = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/candidate-applications`)
        .set({ "x-dev-user-id": owner.id })
        .send({
          candidateId: secondCandidate.id,
          jobOpeningId: job.id,
          jobOpeningVersionId: job.versionId,
          source: "manual"
        }),
      request(app)
        .post(`/api/organizations/${organization.id}/candidate-applications`)
        .set({ "x-dev-user-id": owner.id })
        .send({
          candidateId: secondCandidate.id,
          jobOpeningId: job.id,
          jobOpeningVersionId: job.versionId,
          source: "manual"
        })
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  });

  it("moves pipeline with immutable events, notes and final statuses", async () => {
    const owner = await createUser(app, "owner-app-pipe");
    const admin = await createUser(app, "admin-app-pipe");
    const { organization } = await createOrganization(app, owner.id);
    await addMembership(app, organization.id, owner.id, admin.id, "admin");
    const candidate = await createCandidate(app, organization.id, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "PIPE");
    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );

    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications/${application.id}/stage`)
      .set({ "x-dev-user-id": admin.id })
      .send({ currentStage: "screening" })
      .expect(200);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications/${application.id}/stage`)
      .set({ "x-dev-user-id": admin.id })
      .send({ currentStage: "offer" })
      .expect(400);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications/${application.id}/stage`)
      .set({ "x-dev-user-id": admin.id })
      .send({ currentStage: "offer", reason: "Calibrated by owner/admin." })
      .expect(200);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications/${application.id}/notes`)
      .set({ "x-dev-user-id": admin.id })
      .send({ content: "Internal application note" })
      .expect(201);

    const events = await request(app)
      .get(`/api/organizations/${organization.id}/candidate-applications/${application.id}/events`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    expect(events.body.map((event: { eventType: string }) => event.eventType)).toEqual([
      "application_created",
      "stage_changed",
      "stage_changed",
      "note_added"
    ]);

    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications/${application.id}/reject`)
      .set({ "x-dev-user-id": admin.id })
      .send({ reason: "Perfil encerrado administrativamente." })
      .expect(200);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications/${application.id}/stage`)
      .set({ "x-dev-user-id": admin.id })
      .send({ currentStage: "completed" })
      .expect(409);
  });

  it("blocks member operational access and returns only a reduced member DTO", async () => {
    const owner = await createUser(app, "owner-app-member");
    const member = await createUser(app, "member-app");
    const { organization } = await createOrganization(app, owner.id);
    await addMembership(app, organization.id, owner.id, member.id, "member");
    const candidate = await createCandidate(
      app,
      organization.id,
      owner.id,
      "member-app@example.com"
    );
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "MEM");
    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );
    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications/${application.id}/notes`)
      .set({ "x-dev-user-id": owner.id })
      .send({ content: "Sensitive note" })
      .expect(201);

    await request(app)
      .get(`/api/organizations/${organization.id}/candidate-applications`)
      .set({ "x-dev-user-id": member.id })
      .expect(200)
      .expect((response) => {
        expect(response.body).toHaveLength(1);
        expect(Object.keys(response.body[0]).sort()).toEqual(
          [
            "applied_at",
            "application_status",
            "candidate",
            "current_stage",
            "id",
            "job_opening",
            "job_opening_version"
          ].sort()
        );
        expect(Object.keys(response.body[0].candidate).sort()).toEqual(
          ["full_name", "id", "preferred_name"].sort()
        );
        expect(Object.keys(response.body[0].job_opening).sort()).toEqual(["id", "title"].sort());
        expect(Object.keys(response.body[0].job_opening_version).sort()).toEqual(
          ["id", "public_title", "version_number"].sort()
        );
        const json = JSON.stringify(response.body);
        expect(json).toContain("Ana Candidate");
        expect(json).not.toContain("member-app@example.com");
        expect(json).not.toContain("salaryExpectation");
        expect(json).not.toContain("secondaryPhone");
        expect(json).not.toContain("workAuthorization");
        expect(json).not.toContain("Rua Segura");
        expect(json).not.toContain("Sensitive note");
        expect(json).not.toContain("Sao Paulo");
        expect(json).not.toContain("Senior operator");
        expect(json).not.toContain("finalizationReason");
        expect(json).not.toContain("createdByUserId");
      });
    await request(app)
      .get(`/api/organizations/${organization.id}/candidate-applications/${application.id}/history`)
      .set({ "x-dev-user-id": member.id })
      .expect(403);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications/${application.id}/stage`)
      .set({ "x-dev-user-id": member.id })
      .send({ currentStage: "screening" })
      .expect(403);

    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications/${application.id}/reject`)
      .set({ "x-dev-user-id": owner.id })
      .send({ reason: "Finalizado para validar DTO member." })
      .expect(200);
    await request(app)
      .get(`/api/organizations/${organization.id}/candidate-applications/${application.id}`)
      .set({ "x-dev-user-id": member.id })
      .expect(404);
  });

  it("blocks invalid consent, inactive Candidate, expired consent and invalid Job Opening versions", async () => {
    const owner = await createUser(app, "owner-app-block");
    const { organization } = await createOrganization(app, owner.id);
    const candidate = await createCandidate(app, organization.id, owner.id);
    const pendingCandidate = await createCandidate(
      app,
      organization.id,
      owner.id,
      "pending@example.com",
      "pending"
    );
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "BLOCK");
    const otherJob = await createPublishedOpenJob(app, organization.id, owner.id, "BLOCK-OTHER");
    const draftVersion = await createDraftForJob(app, organization.id, owner.id, job.id);

    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        candidateId: pendingCandidate.id,
        jobOpeningId: job.id,
        jobOpeningVersionId: job.versionId,
        source: "manual"
      })
      .expect(409);

    const expiredCandidate = await createCandidate(
      app,
      organization.id,
      owner.id,
      "expired@example.com"
    );
    await request(app)
      .post(`/api/organizations/${organization.id}/candidates/${expiredCandidate.id}/consents`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        status: "granted",
        source: "manual",
        termsVersion: "v1",
        purpose: "Recruiting",
        expiresAt: "2020-01-01T00:00:00.000Z"
      })
      .expect(201);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        candidateId: expiredCandidate.id,
        jobOpeningId: job.id,
        jobOpeningVersionId: job.versionId,
        source: "manual"
      })
      .expect(409);

    const wrongVersionCandidate = await createCandidate(app, organization.id, owner.id);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        candidateId: wrongVersionCandidate.id,
        jobOpeningId: job.id,
        jobOpeningVersionId: otherJob.versionId,
        source: "manual"
      })
      .expect(404);

    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        candidateId: wrongVersionCandidate.id,
        jobOpeningId: job.id,
        jobOpeningVersionId: draftVersion.id,
        source: "manual"
      })
      .expect(409);

    await request(app)
      .post(`/api/organizations/${organization.id}/candidates/${candidate.id}/inactivate`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        candidateId: candidate.id,
        jobOpeningId: job.id,
        jobOpeningVersionId: job.versionId,
        source: "manual"
      })
      .expect(409);

    const activeCandidate = await createCandidate(app, organization.id, owner.id);
    await request(app)
      .post(`/api/organizations/${organization.id}/job-openings/${job.id}/close`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        candidateId: activeCandidate.id,
        jobOpeningId: job.id,
        jobOpeningVersionId: job.versionId,
        source: "manual"
      })
      .expect(409);

    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        candidateId: activeCandidate.id,
        jobOpeningId: job.id,
        jobOpeningVersionId: job.versionId,
        source: "manual",
        applicationStatus: "hired"
      })
      .expect(400);
  });

  it("preserves applications after Candidate inactivation and consent revocation but blocks operations", async () => {
    const owner = await createUser(app, "owner-app-preserve");
    const { organization } = await createOrganization(app, owner.id);
    const candidate = await createCandidate(app, organization.id, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "KEEP");
    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );

    await request(app)
      .post(`/api/organizations/${organization.id}/candidates/${candidate.id}/consents/revoke`)
      .set({ "x-dev-user-id": owner.id })
      .expect(201);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications/${application.id}/stage`)
      .set({ "x-dev-user-id": owner.id })
      .send({ currentStage: "screening" })
      .expect(409);
    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications/${application.id}/cancel`)
      .set({ "x-dev-user-id": owner.id })
      .send({ reason: "Encerramento administrativo apos revogacao." })
      .expect(200);
    await request(app)
      .get(`/api/organizations/${organization.id}/candidate-applications/${application.id}`)
      .set({ "x-dev-user-id": owner.id })
      .expect(200)
      .expect((response) => {
        expect(response.body.applicationStatus).toBe("cancelled");
      });

    const audit = await request(app).get("/api/audit-events").set(platformHeaders).expect(200);
    const denied = audit.body.filter(
      (event: { action: string; reason: string }) =>
        event.action === "candidate_application.operational_use_denied" &&
        event.reason === "candidate_consent_invalid"
    );
    expect(denied.length).toBeGreaterThan(0);
  });

  it("prevents Platform Admin functional operation and allows audited administrative read", async () => {
    const owner = await createUser(app, "owner-app-platform");
    const { organization } = await createOrganization(app, owner.id);
    const candidate = await createCandidate(app, organization.id, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "PLAT");
    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );

    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications/${application.id}/stage`)
      .set(platformHeaders)
      .send({ currentStage: "screening" })
      .expect(403);
    await request(app)
      .post(`/api/platform/organizations/${organization.id}/candidate-applications/admin-read`)
      .set(platformHeaders)
      .send({ reason: "Administrative support." })
      .expect(200)
      .expect((response) => {
        const json = JSON.stringify(response.body);
        expect(json).toContain(application.id);
        expect(json).not.toContain("Rua Segura");
        expect(json).not.toContain("salaryExpectation");
      });
  });

  it("handles concurrent stage and finalization operations with safe conflicts", async () => {
    const owner = await createUser(app, "owner-app-race");
    const { organization } = await createOrganization(app, owner.id);
    const candidateA = await createCandidate(app, organization.id, owner.id);
    const candidateB = await createCandidate(app, organization.id, owner.id);
    const candidateC = await createCandidate(app, organization.id, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "RACE");
    const stageApp = await createApplication(
      app,
      organization.id,
      owner.id,
      candidateA.id,
      job.id,
      job.versionId
    );
    const rejectApp = await createApplication(
      app,
      organization.id,
      owner.id,
      candidateB.id,
      job.id,
      job.versionId
    );
    const hireApp = await createApplication(
      app,
      organization.id,
      owner.id,
      candidateC.id,
      job.id,
      job.versionId
    );

    const stageResults = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/candidate-applications/${stageApp.id}/stage`)
        .set({ "x-dev-user-id": owner.id })
        .send({ currentStage: "screening" }),
      request(app)
        .post(`/api/organizations/${organization.id}/candidate-applications/${stageApp.id}/stage`)
        .set({ "x-dev-user-id": owner.id })
        .send({ currentStage: "screening" })
    ]);
    expect(stageResults.map((result) => result.status).sort()).toEqual([200, 409]);

    const stageRejectResults = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/candidate-applications/${rejectApp.id}/stage`)
        .set({ "x-dev-user-id": owner.id })
        .send({ currentStage: "screening" }),
      request(app)
        .post(`/api/organizations/${organization.id}/candidate-applications/${rejectApp.id}/reject`)
        .set({ "x-dev-user-id": owner.id })
        .send({ reason: "Concorrencia com etapa." })
    ]);
    expect(stageRejectResults.map((result) => result.status).sort()).toEqual([200, 409]);

    const hireCancelResults = await Promise.all([
      request(app)
        .post(`/api/organizations/${organization.id}/candidate-applications/${hireApp.id}/hire`)
        .set({ "x-dev-user-id": owner.id })
        .send({ reason: "Referencia administrativa." }),
      request(app)
        .post(`/api/organizations/${organization.id}/candidate-applications/${hireApp.id}/cancel`)
        .set({ "x-dev-user-id": owner.id })
        .send({ reason: "Cancelamento concorrente." })
    ]);
    expect(hireCancelResults.map((result) => result.status).sort()).toEqual([200, 409]);
  });

  it("enforces finalization rules and keeps completed as an active stage", async () => {
    const owner = await createUser(app, "owner-app-final");
    const admin = await createUser(app, "admin-app-final");
    const { organization } = await createOrganization(app, owner.id);
    await addMembership(app, organization.id, owner.id, admin.id, "admin");
    const candidate = await createCandidate(app, organization.id, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "FINAL");
    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );

    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications/${application.id}/hire`)
      .set({ "x-dev-user-id": admin.id })
      .send({ reason: "Admin nao pode contratar." })
      .expect(403);

    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications/${application.id}/stage`)
      .set({ "x-dev-user-id": owner.id })
      .send({ currentStage: "completed", reason: "Salto ate completed." })
      .expect(200)
      .expect((response) => {
        expect(response.body.currentStage).toBe("completed");
        expect(response.body.applicationStatus).toBe("active");
        expect(response.body.finalizedAt).toBeNull();
      });

    await request(app)
      .post(
        `/api/organizations/${organization.id}/candidate-applications/${application.id}/withdraw`
      )
      .set({ "x-dev-user-id": owner.id })
      .send({})
      .expect(400);
    await request(app)
      .post(
        `/api/organizations/${organization.id}/candidate-applications/${application.id}/withdraw`
      )
      .set({ "x-dev-user-id": owner.id })
      .send({ reason: "Retirada solicitada." })
      .expect(200)
      .expect((response) => {
        expect(response.body.applicationStatus).toBe("withdrawn");
        expect(response.body.finalizedAt).toBeTruthy();
        expect(response.body.finalizedByUserId).toBe(owner.id);
        expect(response.body.finalizationReason).toBe("Retirada solicitada.");
      });

    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications/${application.id}/cancel`)
      .set({ "x-dev-user-id": owner.id })
      .send({ reason: "Nao reabre finalizada." })
      .expect(409);
  });

  it("blocks Platform Admin in all functional operations", async () => {
    const owner = await createUser(app, "owner-app-platform-all");
    const { organization } = await createOrganization(app, owner.id);
    const candidate = await createCandidate(app, organization.id, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "PLAT-ALL");
    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );

    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications`)
      .set(platformHeaders)
      .send({ candidateId: candidate.id, jobOpeningId: job.id, jobOpeningVersionId: job.versionId })
      .expect(403);
    for (const action of ["stage", "withdraw", "reject", "hire", "cancel"] as const) {
      await request(app)
        .post(
          `/api/organizations/${organization.id}/candidate-applications/${application.id}/${action}`
        )
        .set(platformHeaders)
        .send(action === "stage" ? { currentStage: "screening" } : { reason: "No functional op." })
        .expect(403);
    }
    await request(app)
      .post(`/api/organizations/${organization.id}/candidate-applications/${application.id}/notes`)
      .set(platformHeaders)
      .send({ content: "No note" })
      .expect(403);
  });

  it("protects direct database invariants for events, notes and persisted applications", async () => {
    const ownerA = await createUser(app, "owner-app-db-a");
    const ownerB = await createUser(app, "owner-app-db-b");
    const orgA = await createOrganization(app, ownerA.id);
    const orgB = await createOrganization(app, ownerB.id);
    const candidateA = await createCandidate(app, orgA.organization.id, ownerA.id);
    const candidateB = await createCandidate(app, orgB.organization.id, ownerB.id);
    const jobA = await createPublishedOpenJob(app, orgA.organization.id, ownerA.id, "DB-A");
    const jobB = await createPublishedOpenJob(app, orgB.organization.id, ownerB.id, "DB-B");
    const applicationA = await createApplication(
      app,
      orgA.organization.id,
      ownerA.id,
      candidateA.id,
      jobA.id,
      jobA.versionId
    );
    const applicationB = await createApplication(
      app,
      orgB.organization.id,
      ownerB.id,
      candidateB.id,
      jobB.id,
      jobB.versionId
    );
    const note = await request(app)
      .post(
        `/api/organizations/${orgA.organization.id}/candidate-applications/${applicationA.id}/notes`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .send({ content: "Persisted note" })
      .expect(201);

    await request(app)
      .post(
        `/api/organizations/${orgA.organization.id}/candidate-applications/${applicationB.id}/notes`
      )
      .set({ "x-dev-user-id": ownerA.id })
      .send({ content: "Cross note" })
      .expect(404);

    const event = await database.pool.query(
      "SELECT id FROM candidate_application_events WHERE candidate_application_id = $1 LIMIT 1",
      [applicationA.id]
    );
    await expect(
      database.pool.query(
        "UPDATE candidate_application_events SET event_type = 'cancelled' WHERE id = $1",
        [event.rows[0].id]
      )
    ).rejects.toThrow();
    await expect(
      database.pool.query("DELETE FROM candidate_application_events WHERE id = $1", [
        event.rows[0].id
      ])
    ).rejects.toThrow();
    await expect(
      database.pool.query(
        "UPDATE candidate_application_notes SET content = 'Changed' WHERE id = $1",
        [note.body.id]
      )
    ).rejects.toThrow();
    await expect(
      database.pool.query("DELETE FROM candidate_application_notes WHERE id = $1", [note.body.id])
    ).rejects.toThrow();

    const recreatedApp = createApp(database);
    await request(recreatedApp)
      .get(`/api/organizations/${orgA.organization.id}/candidate-applications/${applicationA.id}`)
      .set({ "x-dev-user-id": ownerA.id })
      .expect(200);
  });

  it("rolls back when critical audit fails and prevents physical deletion", async () => {
    const owner = await createUser(app, "owner-app-rollback");
    const { organization } = await createOrganization(app, owner.id);
    const candidate = await createCandidate(app, organization.id, owner.id);
    const job = await createPublishedOpenJob(app, organization.id, owner.id, "RB");
    const failingApp = createApp(database, createFailingAuditCandidateApplicationService);

    await request(failingApp)
      .post(`/api/organizations/${organization.id}/candidate-applications`)
      .set({ "x-dev-user-id": owner.id })
      .send({
        candidateId: candidate.id,
        jobOpeningId: job.id,
        jobOpeningVersionId: job.versionId,
        source: "manual"
      })
      .expect(500);
    await expect(
      countRows(database.pool, "candidate_applications", "candidate_id = $1", [candidate.id])
    ).resolves.toBe(0);

    const application = await createApplication(
      app,
      organization.id,
      owner.id,
      candidate.id,
      job.id,
      job.versionId
    );
    await expect(
      database.pool.query("DELETE FROM candidate_applications WHERE id = $1", [application.id])
    ).rejects.toThrow();
    await expect(
      database.pool.query(
        "UPDATE candidate_applications SET organization_id = 'other' WHERE id = $1",
        [application.id]
      )
    ).rejects.toThrow();
  });
});

async function countRows(pool: pg.Pool, table: string, where: string, values: unknown[]) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${where}`,
    values
  );
  return Number(result.rows[0]?.count ?? 0);
}

function createFailingAuditCandidateApplicationService(pool: pg.Pool) {
  const runTransaction = async <T>(
    callback: (transaction: {
      core: PostgresCoreRepository;
      applications: CandidateApplicationRepository;
    }) => Promise<T>
  ) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback({
        core: new FailingAuditCoreRepository(client, true),
        applications: new PostgresCandidateApplicationRepository(client)
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
  return new CandidateApplicationService(
    new PostgresCoreRepository(pool),
    new PostgresCandidateApplicationRepository(pool),
    runTransaction
  );
}

class FailingAuditCoreRepository extends PostgresCoreRepository {
  override async addAuditEvent(event: AuditEvent) {
    void event;
    throw new Error("Injected audit failure.");
  }
}
