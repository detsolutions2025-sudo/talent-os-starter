import type { AIRepository } from "../ai/repository";
import type { CompetencyRepository } from "../competencies/repository";
import type { CoreRepository } from "../core/repository";
import type { DnaRepository } from "../dna/repository";
import type { JobProfileRepository } from "../job-profiles/repository";
import type { OrganizationalUnitRepository } from "../organizational-units/repository";
import type { QuestionRepository } from "../questions/repository";
import type { BlueprintRepository } from "./repository";

// O Blueprint agrega 6+ modulos (ADR-0021, secao "Composicao"); esta e a composicao mais
// ampla de repositorios do projeto ate agora, mas segue exatamente o mesmo padrao ja usado
// por JobProfileTransaction/AITransaction: todos os repositorios compostos vem do mesmo
// client/transacao fisica.
export type BlueprintTransaction = {
  core: CoreRepository;
  blueprints: BlueprintRepository;
  dna: DnaRepository;
  organizationalUnits: OrganizationalUnitRepository;
  competencies: CompetencyRepository;
  jobProfiles: JobProfileRepository;
  questions: QuestionRepository;
  ai: AIRepository;
};

export type BlueprintTransactionRunner = <T>(
  callback: (transaction: BlueprintTransaction) => Promise<T>
) => Promise<T>;
