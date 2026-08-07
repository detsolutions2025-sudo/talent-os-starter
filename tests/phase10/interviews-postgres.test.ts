import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/app";
import { createPostgresCandidateApplicationService } from "../../src/server/candidate-applications/service";
import { createPostgresCandidateService } from "../../src/server/candidates/service";
import { createPostgresCompetencyService } from "../../src/server/competencies/service";
import { createCoreService } from "../../src/server/core/service";
import { createPostgresDnaService } from "../../src/server/dna/service";
import {
  createPostgresInterviewService,
  InterviewService
} from "../../src/server/interviews/service";
import { createPostgresJobOpeningService } from "../../src/server/job-openings/service";
import { createPostgresJobProfileService } from "../../src/server/job-profiles/service";
import { createPostgresOrganizationalUnitService } from "../../src/server/organizational-units/service";
import { PostgresInterviewRepository } from "../../src/server/persistence/postgres-interview-repository";
import { PostgresCoreRepository } from "../../src/server/persistence/postgres-core-repository";
import { createPostgresQuestionService } from "../../src/server/questions/service";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../helpers/postgres-test-db";

const platformHeaders = { "x-dev-platform-admin": "true" };

function unique(value: string) {
  return `${value}-${crypto.randomUUID()}`;
}

function createApp(database: PostgresTestDatabase) {
  return createServer(
    createCoreService(new PostgresCoreRepository(database.pool)),
    createPostgresDnaService(database.pool),
    createPostgresOrganizationalUnitService(database.pool),
    createPostgresCompetencyService(database.pool),
    createPostgresJobProfileService(database.pool),
    createPostgresQuestionService(database.pool),
    createPostgresJobOpeningService(database.pool),
    createPostgresCandidateService(database.pool),
    createPostgresCandidateApplicationService(database.pool),
    createPostgresInterviewService(database.pool)
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
  const slug = unique("int-org");
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
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/memberships`)
    .set({ "x-dev-user-id": ownerId })
    .send({ userId, role })
    .expect(201);
  return response.body as { id: string };
}

async function createCandidate(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  overrides: Record<string, unknown> = {}
) {
  const response = await request(app)
    .post(`/api/organizations/${organizationId}/candidates`)
    .set({ "x-dev-user-id": ownerId })
    .send({
      fullName: "Ana Candidate",
      preferredName: "Ana",
      email: `${unique("candidate")}@example.com`,
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
        status: "granted",
        source: "manual",
        termsVersion: "v1",
        purpose: "Recruiting"
      },
      ...overrides
    })
    .expect(201);
  return response.body as { id: string };
}

async function createPublishedJobProfileVersion(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  await request(app)
    .post(`/api/organizations/${organizationId}/competencies`)
    .set({ "x-dev-user-id": ownerId })
    .send({
      code: `INT-CMP-${suffix}`,
      name: `Interview competency ${suffix}`,
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
  const item = catalog.body[0] as { competencyCatalogItemId: string };
  const profile = await request(app)
    .post(`/api/organizations/${organizationId}/job-profiles`)
    .set({ "x-dev-user-id": ownerId })
    .send({ code: `INT-JOB-${suffix}`, name: `Job ${suffix}` })
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
      code: `INT-${suffix}`,
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
  return response.body as { id: string };
}

async function createQuestionCatalogItem(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  ownerId: string,
  suffix: string
) {
  await request(app)
    .post(`/api/organizations/${organizationId}/questions`)
    .set({ "x-dev-user-id": ownerId })
    .send({
      code: `INT-Q-${suffix}`,
      title: `Question ${suffix}`,
      questionText: `Question text ${suffix}`,
      type: "open_text",
      category: "general",
      description: "",
      instructions: "",
      options: [],
      settings: {},
      status: "active"
    })
    .expect(201);
  const catalog = await request(app)
    .get(`/api/organizations/${organizationId}/questions/catalog`)
    .set({ "x-dev-user-id": ownerId })
    .expect(200);
  return catalog.body[0] as { questionCatalogItemId: string };
}

async function createInterviewFixture(app: ReturnType<typeof createServer>, suffix: string) {
  const owner = await createUser(app, `owner-int-${suffix}`);
  const lead = await createUser(app, `lead-int-${suffix}`);
  const interviewer = await createUser(app, `interviewer-int-${suffix}`);
  const observer = await createUser(app, `observer-int-${suffix}`);
  const { organization } = await createOrganization(app, owner.id);
  const leadMembership = await addMembership(app, organization.id, owner.id, lead.id, "member");
  await addMembership(app, organization.id, owner.id, interviewer.id, "member");
  await addMembership(app, organization.id, owner.id, observer.id, "member");
  const candidate = await createCandidate(app, organization.id, owner.id);
  const job = await createPublishedOpenJob(app, organization.id, owner.id, suffix);
  const application = await createApplication(
    app,
    organization.id,
    owner.id,
    candidate.id,
    job.id,
    job.versionId
  );
  const interview = await request(app)
    .post(`/api/organizations/${organization.id}/interviews`)
    .set({ "x-dev-user-id": owner.id })
    .send({
      candidateApplicationId: application.id,
      title: `Interview ${suffix}`,
      type: "technical",
      timezone: "America/Sao_Paulo",
      locationType: "onsite",
      locationDetails: "Sala 1",
      interviewerInstructions: "Ask structured questions",
      candidateInstructions: "Arrive early"
    })
    .expect(201);
  return {
    owner,
    lead,
    leadMembership,
    interviewer,
    observer,
    organization,
    candidate,
    job,
    application,
    interview: interview.body as { id: string }
  };
}

function addParticipantRole(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  interviewId: string,
  actingUserId: string,
  userId: string,
  role: "lead" | "interviewer" | "observer"
) {
  return request(app)
    .post(`/api/organizations/${organizationId}/interviews/${interviewId}/participants`)
    .set({ "x-dev-user-id": actingUserId })
    .send({ userId, role });
}

function scheduleFixtureInterview(
  app: ReturnType<typeof createServer>,
  organizationId: string,
  interviewId: string,
  actingUserId: string,
  overrides: Record<string, unknown> = {}
) {
  return request(app)
    .post(`/api/organizations/${organizationId}/interviews/${interviewId}/schedule`)
    .set({ "x-dev-user-id": actingUserId })
    .send({
      scheduledStartAt: "2026-09-01T10:00:00.000Z",
      scheduledEndAt: "2026-09-01T11:00:00.000Z",
      timezone: "America/Sao_Paulo",
      locationType: "onsite",
      locationDetails: "Sala 1",
      ...overrides
    });
}

/**
 * Builds an interview that is `in_progress`, has its single required question answered and
 * carries one evaluation, i.e. one that `complete` will always accept regardless of timing.
 */
async function prepareCompletableInterview(app: ReturnType<typeof createServer>, suffix: string) {
  const fixture = await createInterviewFixture(app, suffix);
  await addParticipantRole(
    app,
    fixture.organization.id,
    fixture.interview.id,
    fixture.owner.id,
    fixture.lead.id,
    "lead"
  ).expect(201);
  const questionCatalogItem = await createQuestionCatalogItem(
    app,
    fixture.organization.id,
    fixture.owner.id,
    suffix
  );
  const question = await request(app)
    .post(
      `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/questions`
    )
    .set({ "x-dev-user-id": fixture.owner.id })
    .send({
      questionCatalogItemId: questionCatalogItem.questionCatalogItemId,
      displayOrder: 0,
      required: true
    })
    .expect(201);
  await scheduleFixtureInterview(
    app,
    fixture.organization.id,
    fixture.interview.id,
    fixture.owner.id
  ).expect(200);
  await request(app)
    .post(`/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/start`)
    .set({ "x-dev-user-id": fixture.lead.id })
    .expect(200);
  await request(app)
    .post(
      `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/responses`
    )
    .set({ "x-dev-user-id": fixture.lead.id })
    .send({ interviewQuestionId: question.body.id, responseValue: "Initial answer" })
    .expect(201);
  await request(app)
    .post(
      `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/evaluations`
    )
    .set({ "x-dev-user-id": fixture.lead.id })
    .send({
      recommendation: "yes",
      summary: "Initial evaluation",
      overallRating: 4
    })
    .expect(201);
  return { fixture, question: question.body as { id: string } };
}

describe("phase 10 interviews API", () => {
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

  it("creates interviews in draft and records interview_created in the timeline", async () => {
    const fixture = await createInterviewFixture(app, "create");
    const timeline = await request(app)
      .get(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/timeline`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(200);

    expect(timeline.body[0].eventType).toBe("interview_created");
    expect(timeline.body.map((event: { eventType: string }) => event.eventType)).not.toContain(
      "created"
    );
    expect(fixture.interview).toMatchObject({ status: "draft" });
  });

  it("runs the structured interview flow with participants, questions, responses and events", async () => {
    const fixture = await createInterviewFixture(app, "flow");
    const questionCatalogItem = await createQuestionCatalogItem(
      app,
      fixture.organization.id,
      fixture.owner.id,
      "flow"
    );

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/participants`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ userId: fixture.lead.id, role: "lead" })
      .expect(201);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/participants`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ userId: fixture.interviewer.id, role: "interviewer" })
      .expect(201);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/participants`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ userId: fixture.observer.id, role: "observer" })
      .expect(201);

    const question = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/questions`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({
        questionCatalogItemId: questionCatalogItem.questionCatalogItemId,
        displayOrder: 0,
        required: true,
        contextualWeight: 10
      })
      .expect(201);

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/schedule`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({
        scheduledStartAt: "2026-09-01T10:00:00.000Z",
        scheduledEndAt: "2026-09-01T11:00:00.000Z",
        timezone: "America/Sao_Paulo",
        locationType: "onsite",
        locationDetails: "Sala 2"
      })
      .expect(200);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/start`
      )
      .set({ "x-dev-user-id": fixture.lead.id })
      .expect(200);

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/responses`
      )
      .set({ "x-dev-user-id": fixture.interviewer.id })
      .send({
        interviewQuestionId: question.body.id,
        responseValue: "Clear answer",
        interviewerObservation: "Objective evidence"
      })
      .expect(201);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/evaluations`
      )
      .set({ "x-dev-user-id": fixture.interviewer.id })
      .send({
        recommendation: "yes",
        summary: "Strong fit",
        strengths: "Communication",
        attentionPoints: "Ramp-up",
        overallRating: 4
      })
      .expect(201);

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/responses`
      )
      .set({ "x-dev-user-id": fixture.observer.id })
      .send({ interviewQuestionId: question.body.id, responseValue: "Nope" })
      .expect(403);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/complete`
      )
      .set({ "x-dev-user-id": fixture.lead.id })
      .expect(200);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/responses`
      )
      .set({ "x-dev-user-id": fixture.interviewer.id })
      .send({ interviewQuestionId: question.body.id, responseValue: "late" })
      .expect(409);

    const timeline = await request(app)
      .get(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/timeline`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(200);
    expect(timeline.body.map((event: { eventType: string }) => event.eventType)).toEqual(
      expect.arrayContaining([
        "interview_created",
        "participant_added",
        "question_added",
        "scheduled",
        "started",
        "response_created",
        "evaluation_created",
        "completed"
      ])
    );
  });

  it("limits member DTOs to active assigned interviews and blocks administrative history", async () => {
    const fixture = await createInterviewFixture(app, "member");
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/participants`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ userId: fixture.observer.id, role: "observer" })
      .expect(201);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/cancel`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ reason: "Administrative cancellation" })
      .expect(200);

    await request(app)
      .get(`/api/organizations/${fixture.organization.id}/interviews`)
      .set({ "x-dev-user-id": fixture.observer.id })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([]);
      });
    await request(app)
      .get(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/timeline`
      )
      .set({ "x-dev-user-id": fixture.observer.id })
      .expect(403);
  });

  it("blocks operational use when Candidate is inactive, consent is invalid, Job Opening is closed or Organizations differ", async () => {
    const fixture = await createInterviewFixture(app, "guards");
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidates/${fixture.candidate.id}/inactivate`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ reason: "Inactive" })
      .expect(200);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/schedule`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({
        scheduledStartAt: "2026-09-01T10:00:00.000Z",
        scheduledEndAt: "2026-09-01T11:00:00.000Z",
        timezone: "America/Sao_Paulo",
        locationType: "onsite",
        locationDetails: "Sala 2"
      })
      .expect(409);

    const ownerB = await createUser(app, "owner-int-b");
    const orgB = await createOrganization(app, ownerB.id);
    await request(app)
      .get(`/api/organizations/${orgB.organization.id}/interviews/${fixture.interview.id}`)
      .set({ "x-dev-user-id": ownerB.id })
      .expect(404);

    const candidatePending = await createCandidate(app, fixture.organization.id, fixture.owner.id);
    const job = await createPublishedOpenJob(
      app,
      fixture.organization.id,
      fixture.owner.id,
      "pending"
    );
    const pendingApplication = await createApplication(
      app,
      fixture.organization.id,
      fixture.owner.id,
      candidatePending.id,
      job.id,
      job.versionId
    );
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidates/${candidatePending.id}/consents/revoke`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ reason: "Revoked" })
      .expect(201);
    await request(app)
      .post(`/api/organizations/${fixture.organization.id}/interviews`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({
        candidateApplicationId: pendingApplication.id,
        title: "Pending consent interview",
        type: "technical",
        timezone: "America/Sao_Paulo",
        locationType: "onsite"
      })
      .expect(409);

    const candidate = await createCandidate(app, fixture.organization.id, fixture.owner.id);
    const closingJob = await createPublishedOpenJob(
      app,
      fixture.organization.id,
      fixture.owner.id,
      "closed"
    );
    await request(app)
      .post(`/api/organizations/${fixture.organization.id}/job-openings/${closingJob.id}/close`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ reason: "Closed" })
      .expect(200);
    await request(app)
      .post(`/api/organizations/${fixture.organization.id}/candidate-applications`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({
        candidateId: candidate.id,
        jobOpeningId: closingJob.id,
        jobOpeningVersionId: closingJob.versionId,
        source: "manual"
      })
      .expect(409);
  });

  it("keeps Platform Admin administrative reads separate and blocks functional operation", async () => {
    const fixture = await createInterviewFixture(app, "platform");
    await request(app)
      .get(`/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}`)
      .set(platformHeaders)
      .expect(403);
    const adminRead = await request(app)
      .post(`/api/platform/organizations/${fixture.organization.id}/interviews/admin-read`)
      .set(platformHeaders)
      .send({ reason: "Support ticket" })
      .expect(200);
    expect(adminRead.body[0]).toMatchObject({
      id: fixture.interview.id,
      organizationId: fixture.organization.id
    });
    expect(adminRead.body[0]).not.toHaveProperty("candidate");
    expect(adminRead.body[0]).not.toHaveProperty("responses");
  });

  it("lets only the first of two concurrent starts win", async () => {
    const fixture = await createInterviewFixture(app, "conc-start");
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.lead.id,
      "lead"
    ).expect(201);
    await scheduleFixtureInterview(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id
    ).expect(200);

    const [first, second] = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/start`
        )
        .set({ "x-dev-user-id": fixture.lead.id }),
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/start`
        )
        .set({ "x-dev-user-id": fixture.lead.id })
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const timeline = await request(app)
      .get(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/timeline`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(200);
    expect(
      timeline.body.filter((event: { eventType: string }) => event.eventType === "started")
    ).toHaveLength(1);
  });

  it("lets only one of a concurrent start and no-show win", async () => {
    const fixture = await createInterviewFixture(app, "conc-start-noshow");
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.lead.id,
      "lead"
    ).expect(201);
    await scheduleFixtureInterview(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id
    ).expect(200);

    const [startRes, noShowRes] = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/start`
        )
        .set({ "x-dev-user-id": fixture.lead.id }),
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/no-show`
        )
        .set({ "x-dev-user-id": fixture.owner.id })
        .send({ reason: "Candidate absent" })
    ]);

    expect([startRes.status, noShowRes.status].sort()).toEqual([200, 409]);
  });

  it("lets only the first of two concurrent completions win", async () => {
    const { fixture } = await prepareCompletableInterview(app, "conc-complete");

    const [first, second] = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/complete`
        )
        .set({ "x-dev-user-id": fixture.lead.id }),
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/complete`
        )
        .set({ "x-dev-user-id": fixture.lead.id })
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const timeline = await request(app)
      .get(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/timeline`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(200);
    expect(
      timeline.body.filter((event: { eventType: string }) => event.eventType === "completed")
    ).toHaveLength(1);
  });

  it("lets only one of a concurrent completion and cancellation win", async () => {
    const { fixture } = await prepareCompletableInterview(app, "conc-complete-cancel");

    const [completeRes, cancelRes] = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/complete`
        )
        .set({ "x-dev-user-id": fixture.lead.id }),
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/cancel`
        )
        .set({ "x-dev-user-id": fixture.owner.id })
        .send({ reason: "Administrative cancellation" })
    ]);

    expect([completeRes.status, cancelRes.status].sort()).toEqual([200, 409]);
  });

  it("preserves the last-committed answer without duplicating rows when two responses race for the same question", async () => {
    const { fixture, question } = await prepareCompletableInterview(app, "conc-response");
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.interviewer.id,
      "interviewer"
    ).expect(201);

    const [leadRes, interviewerRes] = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/responses`
        )
        .set({ "x-dev-user-id": fixture.lead.id })
        .send({ interviewQuestionId: question.id, responseValue: "Lead answer" }),
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/responses`
        )
        .set({ "x-dev-user-id": fixture.interviewer.id })
        .send({ interviewQuestionId: question.id, responseValue: "Interviewer answer" })
    ]);

    expect(leadRes.status).toBe(201);
    expect(interviewerRes.status).toBe(201);
    const stored = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM interview_responses WHERE interview_question_id = $1",
      [question.id]
    );
    expect(stored.rows[0].count).toBe(1);
  });

  it("preserves a single row without duplication when the same evaluator submits twice concurrently", async () => {
    const { fixture } = await prepareCompletableInterview(app, "conc-evaluation");

    const [first, second] = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/evaluations`
        )
        .set({ "x-dev-user-id": fixture.lead.id })
        .send({ recommendation: "yes", summary: "Race A", overallRating: 3 }),
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/evaluations`
        )
        .set({ "x-dev-user-id": fixture.lead.id })
        .send({ recommendation: "no", summary: "Race B", overallRating: 2 })
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const stored = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM interview_evaluations WHERE interview_id = $1 AND evaluator_user_id = $2",
      [fixture.interview.id, fixture.lead.id]
    );
    expect(stored.rows[0].count).toBe(1);
  });

  it("makes a response update racing with completion either apply before the lock or be rejected as final", async () => {
    const { fixture, question } = await prepareCompletableInterview(app, "conc-response-complete");

    const [completeRes, responseUpdateRes] = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/complete`
        )
        .set({ "x-dev-user-id": fixture.lead.id }),
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/responses`
        )
        .set({ "x-dev-user-id": fixture.lead.id })
        .send({ interviewQuestionId: question.id, responseValue: "Late correction" })
    ]);

    expect(completeRes.status).toBe(200);
    expect([200, 201, 409]).toContain(responseUpdateRes.status);
    if (responseUpdateRes.status === 409) {
      const stored = await database.pool.query(
        "SELECT response_value FROM interview_responses WHERE interview_question_id = $1",
        [question.id]
      );
      expect(stored.rows[0].response_value).toBe("Initial answer");
    }
    await expect(
      database.pool.query(
        "UPDATE interview_responses SET response_value = $1 WHERE interview_question_id = $2",
        ["Direct tampering", question.id]
      )
    ).rejects.toThrow();
  });

  it("makes an evaluation update racing with completion either apply before the lock or be rejected as final", async () => {
    const { fixture } = await prepareCompletableInterview(app, "conc-evaluation-complete");

    const [completeRes, evaluationUpdateRes] = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/complete`
        )
        .set({ "x-dev-user-id": fixture.lead.id }),
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/evaluations`
        )
        .set({ "x-dev-user-id": fixture.lead.id })
        .send({ recommendation: "strong_yes", summary: "Late correction", overallRating: 5 })
    ]);

    expect(completeRes.status).toBe(200);
    expect([200, 201, 409]).toContain(evaluationUpdateRes.status);
    await expect(
      database.pool.query(
        "UPDATE interview_evaluations SET overall_rating = 1 WHERE interview_id = $1 AND evaluator_user_id = $2",
        [fixture.interview.id, fixture.lead.id]
      )
    ).rejects.toThrow();
  });

  it("always lets start win a race against reschedule, keeping reschedule safe when it loses", async () => {
    const fixture = await createInterviewFixture(app, "conc-reschedule-start");
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.lead.id,
      "lead"
    ).expect(201);
    await scheduleFixtureInterview(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id
    ).expect(200);

    const [startRes, rescheduleRes] = await Promise.all([
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/start`
        )
        .set({ "x-dev-user-id": fixture.lead.id }),
      request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/reschedule`
        )
        .set({ "x-dev-user-id": fixture.owner.id })
        .send({
          scheduledStartAt: "2026-09-05T10:00:00.000Z",
          scheduledEndAt: "2026-09-05T11:00:00.000Z",
          timezone: "America/Sao_Paulo",
          locationType: "onsite",
          locationDetails: "Sala Nova"
        })
    ]);

    expect(startRes.status).toBe(200);
    expect([200, 409]).toContain(rescheduleRes.status);
  });

  it("refuses to remove or demote the last active lead while scheduled or in progress", async () => {
    const fixture = await createInterviewFixture(app, "last-lead");
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.lead.id,
      "lead"
    ).expect(201);
    await scheduleFixtureInterview(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id
    ).expect(200);

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/participants/${fixture.lead.id}/remove`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(409);
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.lead.id,
      "interviewer"
    ).expect(409);

    // A second active lead makes the original one removable again.
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.interviewer.id,
      "lead"
    ).expect(201);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/participants/${fixture.lead.id}/remove`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(200);
  });

  it("blocks a member with inactive Membership from becoming a participant", async () => {
    const fixture = await createInterviewFixture(app, "inactive-membership");
    await request(app)
      .patch(`/api/memberships/${fixture.leadMembership.id}`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ status: "inactive" })
      .expect(200);

    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.lead.id,
      "lead"
    ).expect(403);
  });

  it("blocks every route for a member who is not a participant", async () => {
    const fixture = await createInterviewFixture(app, "non-participant");
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.lead.id,
      "lead"
    ).expect(201);
    await scheduleFixtureInterview(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id
    ).expect(200);
    const outsider = fixture.observer.id;
    const base = `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}`;
    const outsiderHeader = { "x-dev-user-id": outsider };

    await request(app).get(base).set(outsiderHeader).expect(404);
    await request(app).get(`${base}/timeline`).set(outsiderHeader).expect(403);
    await request(app).post(`${base}/start`).set(outsiderHeader).expect(403);
    await request(app).post(`${base}/complete`).set(outsiderHeader).expect(403);
    await request(app)
      .post(`${base}/cancel`)
      .set(outsiderHeader)
      .send({ reason: "Not mine" })
      .expect(403);
    await request(app)
      .post(`${base}/no-show`)
      .set(outsiderHeader)
      .send({ reason: "Not mine" })
      .expect(403);
    await request(app)
      .post(`${base}/responses`)
      .set(outsiderHeader)
      .send({ interviewQuestionId: "int_missing", responseValue: "x" })
      .expect(403);
    await request(app)
      .post(`${base}/evaluations`)
      .set(outsiderHeader)
      .send({ recommendation: "yes", summary: "x", overallRating: 3 })
      .expect(403);
    await request(app)
      .get(`/api/organizations/${fixture.organization.id}/interviews`)
      .set(outsiderHeader)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([]);
      });
  });

  it("blocks observer from every write operation while allowing the positive DTO", async () => {
    const { fixture, question } = await prepareCompletableInterview(app, "observer-blocked");
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.observer.id,
      "observer"
    ).expect(201);
    const base = `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}`;
    const observerHeader = { "x-dev-user-id": fixture.observer.id };

    const dto = await request(app).get(base).set(observerHeader).expect(200);
    expect(dto.body).not.toHaveProperty("candidateApplication");
    expect(dto.body.candidate).toMatchObject({ id: fixture.candidate.id });
    expect(dto.body).not.toHaveProperty("questions");
    expect(dto.body).not.toHaveProperty("responses");
    expect(dto.body.evaluations).toEqual([]);

    await request(app)
      .post(`${base}/responses`)
      .set(observerHeader)
      .send({ interviewQuestionId: question.id, responseValue: "Not allowed" })
      .expect(403);
    await request(app)
      .post(`${base}/evaluations`)
      .set(observerHeader)
      .send({ recommendation: "yes", summary: "Not allowed", overallRating: 3 })
      .expect(403);
    await request(app).post(`${base}/start`).set(observerHeader).expect(403);
    await request(app).post(`${base}/complete`).set(observerHeader).expect(403);
    await request(app)
      .post(`${base}/cancel`)
      .set(observerHeader)
      .send({ reason: "Not allowed" })
      .expect(403);
    await request(app)
      .post(`${base}/no-show`)
      .set(observerHeader)
      .send({ reason: "Not allowed" })
      .expect(403);
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.observer.id,
      fixture.interviewer.id,
      "interviewer"
    ).expect(403);
  });

  it("blocks an interviewer from altering another evaluator's evaluation and from finishing the interview", async () => {
    const { fixture, question } = await prepareCompletableInterview(app, "interviewer-limits");
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.interviewer.id,
      "interviewer"
    ).expect(201);
    const base = `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}`;
    const interviewerHeader = { "x-dev-user-id": fixture.interviewer.id };

    await request(app)
      .post(`${base}/responses`)
      .set(interviewerHeader)
      .send({ interviewQuestionId: question.id, responseValue: "Interviewer answer" })
      .expect(201);
    await request(app)
      .post(`${base}/evaluations`)
      .set(interviewerHeader)
      .send({ recommendation: "no", summary: "Interviewer own evaluation", overallRating: 2 })
      .expect(201);

    const asInterviewer = await request(app).get(base).set(interviewerHeader).expect(200);
    expect(asInterviewer.body.evaluations).toHaveLength(1);
    expect(asInterviewer.body.evaluations[0]).toMatchObject({
      evaluatorUserId: fixture.interviewer.id
    });

    await request(app).post(`${base}/start`).set(interviewerHeader).expect(403);
    await request(app).post(`${base}/complete`).set(interviewerHeader).expect(403);
    await request(app)
      .post(`${base}/cancel`)
      .set(interviewerHeader)
      .send({ reason: "Not allowed" })
      .expect(403);
  });

  it("keeps other evaluators' evaluations hidden from owner/admin while in progress and reveals them once completed", async () => {
    const { fixture, question } = await prepareCompletableInterview(app, "eval-visibility");
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.interviewer.id,
      "interviewer"
    ).expect(201);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/responses`
      )
      .set({ "x-dev-user-id": fixture.interviewer.id })
      .send({ interviewQuestionId: question.id, responseValue: "Second responder" })
      .expect(201);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/evaluations`
      )
      .set({ "x-dev-user-id": fixture.interviewer.id })
      .send({ recommendation: "no", summary: "Second evaluator", overallRating: 2 })
      .expect(201);

    const whileRunning = await request(app)
      .get(`/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(200);
    expect(whileRunning.body.evaluations).toEqual([]);

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/complete`
      )
      .set({ "x-dev-user-id": fixture.lead.id })
      .expect(200);

    const afterCompletion = await request(app)
      .get(`/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(200);
    expect(afterCompletion.body.evaluations).toHaveLength(2);
  });

  it("blocks owner/admin from recording a response or evaluation without active participation", async () => {
    const fixture = await createInterviewFixture(app, "owner-non-participant");
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.lead.id,
      "lead"
    ).expect(201);
    const questionCatalogItem = await createQuestionCatalogItem(
      app,
      fixture.organization.id,
      fixture.owner.id,
      "owner-non-participant"
    );
    const question = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/questions`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ questionCatalogItemId: questionCatalogItem.questionCatalogItemId, displayOrder: 0 })
      .expect(201);
    await scheduleFixtureInterview(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id
    ).expect(200);
    // Owner administratively starts the interview without being a participant.
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/start`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(200);

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/responses`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ interviewQuestionId: question.body.id, responseValue: "Owner answer" })
      .expect(403);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/evaluations`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ recommendation: "yes", summary: "Owner evaluation", overallRating: 4 })
      .expect(403);
  });

  it("blocks question catalog items from another Organization or that are inactive, preserves the snapshot after later edits", async () => {
    const fixture = await createInterviewFixture(app, "question-guards");
    const otherOwner = await createUser(app, "owner-int-otherorg");
    const otherOrg = await createOrganization(app, otherOwner.id);
    const foreignQuestion = await createQuestionCatalogItem(
      app,
      otherOrg.organization.id,
      otherOwner.id,
      "foreign"
    );
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/questions`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ questionCatalogItemId: foreignQuestion.questionCatalogItemId, displayOrder: 0 })
      .expect(404);

    const ownQuestion = await request(app)
      .post(`/api/organizations/${fixture.organization.id}/questions`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({
        code: "INT-Q-SNAPSHOT",
        title: "Original title",
        questionText: "Original text",
        type: "open_text",
        category: "general",
        description: "",
        instructions: "",
        options: [],
        settings: {},
        status: "active"
      })
      .expect(201);
    const ownCatalog = await request(app)
      .get(`/api/organizations/${fixture.organization.id}/questions/catalog`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(200);
    const ownCatalogItem = (
      ownCatalog.body as Array<{ questionCatalogItemId: string; code: string }>
    ).find((item) => item.code === "INT-Q-SNAPSHOT");
    if (!ownCatalogItem) {
      throw new Error("Expected catalog item for INT-Q-SNAPSHOT was not found.");
    }
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/questions`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({
        questionCatalogItemId: ownCatalogItem.questionCatalogItemId,
        displayOrder: 1
      })
      .expect(201);

    await request(app)
      .patch(`/api/organizations/${fixture.organization.id}/questions/${ownQuestion.body.id}`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ title: "Changed after use" })
      .expect(200);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/questions/${ownQuestion.body.id}/inactivate`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(200);

    const detail = await request(app)
      .get(`/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(200);
    const snapshot = detail.body.questions.find(
      (candidate: { questionCatalogItemId: string }) =>
        candidate.questionCatalogItemId === ownCatalogItem.questionCatalogItemId
    );
    expect(snapshot.snapshotTitle).toBe("Original title");

    const inactiveOrgQuestion = await request(app)
      .post(`/api/organizations/${fixture.organization.id}/questions`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({
        code: "INT-Q-ALREADY-INACTIVE",
        title: "Already inactive",
        questionText: "Already inactive text",
        type: "open_text",
        category: "general",
        description: "",
        instructions: "",
        options: [],
        settings: {},
        status: "active"
      })
      .expect(201);
    const inactiveCatalog = await request(app)
      .get(`/api/organizations/${fixture.organization.id}/questions/catalog`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(200);
    const inactiveCatalogItem = (
      inactiveCatalog.body as Array<{ questionCatalogItemId: string; code: string }>
    ).find((item) => item.code === "INT-Q-ALREADY-INACTIVE");
    if (!inactiveCatalogItem) {
      throw new Error("Expected catalog item for INT-Q-ALREADY-INACTIVE was not found.");
    }
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/questions/${inactiveOrgQuestion.body.id}/inactivate`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(200);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/questions`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ questionCatalogItemId: inactiveCatalogItem.questionCatalogItemId, displayOrder: 2 })
      .expect(404);
  });

  it("validates response types, blocks completion with unanswered required questions and blocks invalid ratings", async () => {
    const fixture = await createInterviewFixture(app, "validation");
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.lead.id,
      "lead"
    ).expect(201);
    const questionCatalogItem = await createQuestionCatalogItem(
      app,
      fixture.organization.id,
      fixture.owner.id,
      "validation"
    );
    const question = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/questions`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({
        questionCatalogItemId: questionCatalogItem.questionCatalogItemId,
        displayOrder: 0,
        required: true
      })
      .expect(201);
    await scheduleFixtureInterview(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id
    ).expect(200);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/start`
      )
      .set({ "x-dev-user-id": fixture.lead.id })
      .expect(200);

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/complete`
      )
      .set({ "x-dev-user-id": fixture.lead.id })
      .expect(409);

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/evaluations`
      )
      .set({ "x-dev-user-id": fixture.lead.id })
      .send({ recommendation: "yes", summary: "Fit", overallRating: 6 })
      .expect(400);

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/responses`
      )
      .set({ "x-dev-user-id": fixture.lead.id })
      .send({ interviewQuestionId: question.body.id, responseValue: "" })
      .expect(400);
  });

  it("blocks Platform Admin from every functional interview operation", async () => {
    const fixture = await createInterviewFixture(app, "platform-blocked");
    const base = `/api/organizations/${fixture.organization.id}/interviews`;

    await request(app)
      .post(base)
      .set(platformHeaders)
      .send({
        candidateApplicationId: fixture.application.id,
        title: "Blocked",
        type: "technical",
        timezone: "UTC",
        locationType: "onsite"
      })
      .expect(403);
    await request(app)
      .post(`${base}/${fixture.interview.id}/participants`)
      .set(platformHeaders)
      .send({ userId: fixture.lead.id, role: "lead" })
      .expect(403);
    await request(app)
      .post(`${base}/${fixture.interview.id}/questions`)
      .set(platformHeaders)
      .send({ questionCatalogItemId: "qci_missing", displayOrder: 0 })
      .expect(403);
    await request(app)
      .post(`${base}/${fixture.interview.id}/schedule`)
      .set(platformHeaders)
      .send({
        scheduledStartAt: "2026-09-01T10:00:00.000Z",
        scheduledEndAt: "2026-09-01T11:00:00.000Z",
        timezone: "UTC",
        locationType: "onsite"
      })
      .expect(403);
    await request(app)
      .post(`${base}/${fixture.interview.id}/start`)
      .set(platformHeaders)
      .expect(403);
    await request(app)
      .post(`${base}/${fixture.interview.id}/responses`)
      .set(platformHeaders)
      .send({ interviewQuestionId: "intq_missing", responseValue: "x" })
      .expect(403);
    await request(app)
      .post(`${base}/${fixture.interview.id}/evaluations`)
      .set(platformHeaders)
      .send({ recommendation: "yes", summary: "x", overallRating: 3 })
      .expect(403);
    await request(app)
      .post(`${base}/${fixture.interview.id}/complete`)
      .set(platformHeaders)
      .expect(403);
    await request(app)
      .post(`${base}/${fixture.interview.id}/cancel`)
      .set(platformHeaders)
      .send({ reason: "x" })
      .expect(403);
    await request(app)
      .post(`${base}/${fixture.interview.id}/no-show`)
      .set(platformHeaders)
      .send({ reason: "x" })
      .expect(403);
  });

  it("rejects mass assignment of protected fields across interview write routes", async () => {
    const fixture = await createInterviewFixture(app, "mass-assignment");
    await request(app)
      .post(`/api/organizations/${fixture.organization.id}/interviews`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({
        candidateApplicationId: fixture.application.id,
        title: "Spoofed",
        type: "technical",
        timezone: "UTC",
        locationType: "onsite",
        organizationId: "org_other",
        status: "completed"
      })
      .expect(400);
    await request(app)
      .patch(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/draft`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ title: "Still draft", candidateApplicationId: "app_other" })
      .expect(400);
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.lead.id,
      "lead"
    ).expect(201);
    const questionCatalogItem = await createQuestionCatalogItem(
      app,
      fixture.organization.id,
      fixture.owner.id,
      "mass-assignment"
    );
    const question = await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/questions`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ questionCatalogItemId: questionCatalogItem.questionCatalogItemId, displayOrder: 0 })
      .expect(201);
    await scheduleFixtureInterview(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id
    ).expect(200);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/start`
      )
      .set({ "x-dev-user-id": fixture.lead.id })
      .expect(200);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/evaluations`
      )
      .set({ "x-dev-user-id": fixture.lead.id })
      .send({
        recommendation: "yes",
        summary: "Fit",
        overallRating: 4,
        evaluatorUserId: fixture.interviewer.id
      })
      .expect(400);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/responses`
      )
      .set({ "x-dev-user-id": fixture.lead.id })
      .send({
        interviewQuestionId: question.body.id,
        responseValue: "Answer",
        createdByUserId: fixture.interviewer.id
      })
      .expect(400);
  });

  it("blocks creating a new interview when consent already expired by date", async () => {
    const fixture = await createInterviewFixture(app, "consent-expired-date");
    const candidate = await createCandidate(app, fixture.organization.id, fixture.owner.id);
    const application = await createApplication(
      app,
      fixture.organization.id,
      fixture.owner.id,
      candidate.id,
      fixture.job.id,
      fixture.job.versionId
    );
    // Adds a newer consent record whose expiration date has already passed; it becomes the
    // latest consent for the Candidate even though its status is still "granted".
    await request(app)
      .post(`/api/organizations/${fixture.organization.id}/candidates/${candidate.id}/consents`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({
        status: "granted",
        source: "manual",
        termsVersion: "v1",
        purpose: "Recruiting",
        expiresAt: "2020-01-01T00:00:00.000Z"
      })
      .expect(201);

    await request(app)
      .post(`/api/organizations/${fixture.organization.id}/interviews`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({
        candidateApplicationId: application.id,
        title: "Blocked by expired consent",
        type: "technical",
        timezone: "UTC",
        locationType: "onsite"
      })
      .expect(409);
  });

  it("blocks starting an interview once the Candidate is inactivated after scheduling, but still allows administrative closure", async () => {
    const fixture = await createInterviewFixture(app, "candidate-inactive-after-schedule");
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.lead.id,
      "lead"
    ).expect(201);
    await scheduleFixtureInterview(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id
    ).expect(200);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidates/${fixture.candidate.id}/inactivate`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ reason: "Inactivated after scheduling" })
      .expect(200);

    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/start`
      )
      .set({ "x-dev-user-id": fixture.lead.id })
      .expect(409);
    // Administrative closure must still be possible while the Candidate is inactive.
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/cancel`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ reason: "Administrative closure while inactive" })
      .expect(200);
  });

  it("blocks reschedule when the Candidate is inactive, while reads and administrative cancellation stay available", async () => {
    const fixture = await createInterviewFixture(app, "reschedule-candidate-inactive");
    await addParticipantRole(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      fixture.lead.id,
      "lead"
    ).expect(201);
    await scheduleFixtureInterview(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id
    ).expect(200);
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/candidates/${fixture.candidate.id}/inactivate`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ reason: "Inactivated before reschedule" })
      .expect(200);

    // Reschedule is a functional operation, so it is blocked just like schedule/start.
    await scheduleFixtureInterview(
      app,
      fixture.organization.id,
      fixture.interview.id,
      fixture.owner.id,
      { locationDetails: "Sala Reagendada" }
    ).expect(409);
    // Authorized reads and preserved history are not blocked.
    await request(app)
      .get(`/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(200);
    await request(app)
      .get(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/timeline`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(200);
    // Administrative cancellation still closes the interview.
    await request(app)
      .post(
        `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/cancel`
      )
      .set({ "x-dev-user-id": fixture.owner.id })
      .send({ reason: "Administrative closure while Candidate inactive" })
      .expect(200);
  });

  it("blocks reschedule when consent is pending, revoked or expired, while administrative no-show stays available", async () => {
    for (const scenario of ["revoked", "pending", "expired"] as const) {
      const fixture = await createInterviewFixture(app, `reschedule-consent-${scenario}`);
      await addParticipantRole(
        app,
        fixture.organization.id,
        fixture.interview.id,
        fixture.owner.id,
        fixture.lead.id,
        "lead"
      ).expect(201);
      await scheduleFixtureInterview(
        app,
        fixture.organization.id,
        fixture.interview.id,
        fixture.owner.id
      ).expect(200);

      if (scenario === "revoked") {
        await request(app)
          .post(
            `/api/organizations/${fixture.organization.id}/candidates/${fixture.candidate.id}/consents/revoke`
          )
          .set({ "x-dev-user-id": fixture.owner.id })
          .send({ reason: "Revoked before reschedule" })
          .expect(201);
      } else {
        const expiresAt =
          scenario === "expired" ? "2020-01-01T00:00:00.000Z" : "2099-01-01T00:00:00.000Z";
        await request(app)
          .post(
            `/api/organizations/${fixture.organization.id}/candidates/${fixture.candidate.id}/consents`
          )
          .set({ "x-dev-user-id": fixture.owner.id })
          .send({
            status: scenario === "expired" ? "granted" : "pending",
            source: "manual",
            termsVersion: "v1",
            purpose: "Recruiting",
            expiresAt
          })
          .expect(201);
      }

      await scheduleFixtureInterview(
        app,
        fixture.organization.id,
        fixture.interview.id,
        fixture.owner.id,
        { locationDetails: "Sala Reagendada" }
      ).expect(409);
      await request(app)
        .post(
          `/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}/no-show`
        )
        .set({ "x-dev-user-id": fixture.owner.id })
        .send({ reason: `Administrative no-show with consent ${scenario}` })
        .expect(200);
    }
  });

  it("keeps interview data readable through a freshly constructed application instance", async () => {
    const fixture = await createInterviewFixture(app, "persistence");
    const rebuiltApp = createApp(database);
    const persisted = await request(rebuiltApp)
      .get(`/api/organizations/${fixture.organization.id}/interviews/${fixture.interview.id}`)
      .set({ "x-dev-user-id": fixture.owner.id })
      .expect(200);
    expect(persisted.body.id).toBe(fixture.interview.id);
    expect(persisted.body.status).toBe("draft");
  });

  it("rolls back interview creation when critical audit fails and never physically deletes records", async () => {
    const fixture = await createInterviewFixture(app, "delete");
    const service = new InterviewService(
      failingAuditCore(new PostgresCoreRepository(database.pool)),
      new PostgresInterviewRepository(database.pool),
      async (callback) => {
        const client = await database.pool.connect();
        try {
          await client.query("BEGIN");
          const result = await callback({
            core: failingAuditCore(new PostgresCoreRepository(client, true)),
            interviews: new PostgresInterviewRepository(client)
          });
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
    );

    await expect(
      service.createInterview({ kind: "user", userId: fixture.owner.id }, fixture.organization.id, {
        candidateApplicationId: fixture.application.id,
        title: "Rollback interview",
        type: "technical",
        timezone: "America/Sao_Paulo",
        locationType: "onsite"
      })
    ).rejects.toThrow("audit failed");
    const stored = await database.pool.query(
      "SELECT COUNT(*)::int AS count FROM interviews WHERE title = $1",
      ["Rollback interview"]
    );
    expect(stored.rows[0].count).toBe(0);

    await expect(
      database.pool.query("DELETE FROM interviews WHERE id = $1", [fixture.interview.id])
    ).rejects.toThrow();
    await expect(
      database.pool.query("UPDATE interview_events SET event_type = $1 WHERE interview_id = $2", [
        "draft_updated",
        fixture.interview.id
      ])
    ).rejects.toThrow();
  });
});

function failingAuditCore(repository: PostgresCoreRepository) {
  return new Proxy(repository, {
    get(target, property, receiver) {
      if (property === "addAuditEvent") {
        return async () => {
          throw new Error("audit failed");
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}
