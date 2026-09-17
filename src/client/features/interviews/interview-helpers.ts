import type { Interview } from "../../App";

// Mesma logica de normalizacao camelCase/snake_case do modulo de selecao, aplicada aos campos
// de Interview -- apenas leitura para apresentacao, nenhuma regra de negocio.

export function interviewApplicationId(interview: Interview) {
  return interview.candidateApplicationId ?? interview.candidate_application_id ?? "";
}

export function interviewScheduledStart(interview: Interview) {
  return interview.scheduledStartAt ?? interview.scheduled_start_at ?? "";
}

export function interviewScheduledEnd(interview: Interview) {
  return interview.scheduledEndAt ?? interview.scheduled_end_at ?? "";
}
