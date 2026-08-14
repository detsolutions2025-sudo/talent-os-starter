import type {
  CandidateDossier,
  CandidateDossierApplicationContext,
  CandidateDossierConsentContext,
  CandidateDossierSource
} from "./types";

export interface CandidateDossierRepository {
  nextId(prefix: string): string;
  now(): string;
  addDossier(dossier: CandidateDossier): Promise<void>;
  addSources(sources: CandidateDossierSource[]): Promise<void>;
  findById(organizationId: string, id: string): Promise<CandidateDossier | null>;
  findByIdempotencyKeyHash(
    organizationId: string,
    candidateApplicationId: string,
    idempotencyKeyHash: string
  ): Promise<CandidateDossier | null>;
  latestByApplication(
    organizationId: string,
    candidateApplicationId: string
  ): Promise<CandidateDossier | null>;
  listByApplication(
    organizationId: string,
    candidateApplicationId: string
  ): Promise<CandidateDossier[]>;
  listSources(organizationId: string, dossierId: string): Promise<CandidateDossierSource[]>;
  countSources(organizationId: string, dossierId: string): Promise<number>;

  findApplicationForUpdate(
    applicationId: string
  ): Promise<CandidateDossierApplicationContext | null>;
  latestConsent(candidateId: string): Promise<CandidateDossierConsentContext | null>;
  collectSources(
    organizationId: string,
    candidateApplicationId: string,
    candidateId: string,
    jobOpeningId: string,
    jobOpeningVersionId: string,
    dossierId: string
  ): Promise<CandidateDossierSource[]>;
}
