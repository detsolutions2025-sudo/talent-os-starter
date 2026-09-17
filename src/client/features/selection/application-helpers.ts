import type { CandidateApplication, CandidateApplicationStage } from "../../App";

// Helpers de apresentacao para CandidateApplication: a API pode responder em camelCase ou
// snake_case dependendo do endpoint/serializer -- estas funcoes normalizam apenas para leitura
// na UI, sem tocar em nenhuma regra de negocio (que permanece inteiramente no backend).

export const APPLICATION_STAGES: CandidateApplicationStage[] = [
  "applied",
  "screening",
  "interview",
  "assessment",
  "offer",
  "completed"
];

export const APPLICATION_STAGE_LABEL: Record<CandidateApplicationStage, string> = {
  applied: "Inscrito",
  screening: "Triagem",
  interview: "Entrevista",
  assessment: "Avaliação",
  offer: "Oferta",
  completed: "Concluído"
};

export function applicationStatusOf(application: CandidateApplication) {
  return application.applicationStatus ?? application.application_status ?? "active";
}

export function applicationStageOf(application: CandidateApplication) {
  return application.currentStage ?? application.current_stage ?? "applied";
}

export function applicationAppliedAtOf(application: CandidateApplication) {
  return application.appliedAt ?? application.applied_at ?? "";
}

export function applicationCandidateName(application: CandidateApplication) {
  return (
    application.candidate?.fullName ??
    application.candidate?.full_name ??
    application.candidateId ??
    application.id
  );
}
