export type UserStatus = "active" | "inactive";
export type OrganizationStatus = "active" | "archived";
export type MembershipStatus = "active" | "inactive";
export type MembershipRole = "owner" | "admin" | "member";

export type User = {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  legalName: string | null;
  taxId: string | null;
  description: string | null;
  archivedAt: string | null;
  archivedByUserId: string | null;
  reactivatedAt: string | null;
  reactivatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Membership = {
  id: string;
  organizationId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AuditEvent = {
  id: string;
  organizationId: string | null;
  actorUserId: string | null;
  action: string;
  result: "allowed" | "denied";
  reason: string | null;
  metadata: Record<string, string | null>;
  createdAt: string;
};

export type Actor = { kind: "platform"; userId: string | null } | { kind: "user"; userId: string };

export type Permission =
  | "platform.organization.create"
  | "platform.organization.read"
  | "platform.organization.archive"
  | "platform.organization.reactivate"
  | "platform.user.create"
  | "platform.user.deactivate"
  | "organization.read"
  | "organization.update_operational_fields"
  | "membership.read"
  | "membership.create"
  | "membership.update"
  | "membership.manage_owner";

export type CoreState = {
  users: User[];
  organizations: Organization[];
  memberships: Membership[];
  auditEvents: AuditEvent[];
  nextId: number;
};
