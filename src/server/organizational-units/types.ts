import type { Actor, MembershipRole, Organization } from "../core/types";

export const organizationalUnitTypes = [
  "board",
  "directorate",
  "department",
  "division",
  "branch",
  "office",
  "team",
  "squad",
  "unit",
  "other"
] as const;

export type OrganizationalUnitType = (typeof organizationalUnitTypes)[number];
export type OrganizationalUnitStatus = "active" | "inactive";

export type OrganizationalUnit = {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  type: OrganizationalUnitType;
  parentId: string | null;
  managerName: string | null;
  managerEmail: string | null;
  description: string | null;
  displayOrder: number;
  status: OrganizationalUnitStatus;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
  inactivatedAt: string | null;
};

export type OrganizationalUnitTreeNode = OrganizationalUnit & {
  children: OrganizationalUnitTreeNode[];
};

export type OrganizationalUnitInput = {
  organizationId?: string;
  code?: string;
  name?: string;
  type?: string;
  parentId?: string | null;
  managerName?: string | null;
  managerEmail?: string | null;
  description?: string | null;
  displayOrder?: number;
  status?: string;
};

export type OrganizationalUnitMoveInput = {
  parentId?: string | null;
  displayOrder?: number;
  organizationId?: string;
};

export type OrganizationalUnitAdminReadInput = {
  reason?: string;
};

export type OrganizationalUnitActorContext = {
  actor: Actor;
  organization: Organization;
  role: MembershipRole;
};
