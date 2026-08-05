import type { Actor, MembershipRole, Organization } from "../core/types";

export type DnaVersionStatus = "draft" | "published" | "archived";
export type DnaCompetencyImportance = "low" | "medium" | "high" | "critical";

export type DnaValue = {
  name: string;
  description: string;
  practicalMeaning: string;
  expectedBehaviors: string[];
  incompatibleBehaviors: string[];
};

export type DnaCompetency = {
  name: string;
  description: string;
  importance: DnaCompetencyImportance;
  examples: string[];
};

export type DnaVersion = {
  id: string;
  organizationId: string;
  versionNumber: number | null;
  status: DnaVersionStatus;
  mission: string;
  vision: string;
  purpose: string;
  values: DnaValue[];
  competencies: DnaCompetency[];
  culture: string;
  leadershipStyle: string;
  workEnvironment: string;
  createdByUserId: string;
  updatedByUserId: string;
  publishedByUserId: string | null;
  discardedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  discardedAt: string | null;
};

export type DnaActorContext = {
  actor: Actor;
  organization: Organization;
  role: MembershipRole | "platform";
};

export type DnaDraftInput = {
  mission?: string;
  vision?: string;
  purpose?: string;
  values?: DnaValue[];
  competencies?: DnaCompetency[];
  culture?: string;
  leadershipStyle?: string;
  workEnvironment?: string;
};

export type DnaAdminReadInput = {
  reason?: string;
};
