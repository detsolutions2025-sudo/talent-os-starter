import type { AuditEvent, Membership, Organization, User } from "./types";

export type MembershipWithUser = Membership & {
  user: User | null;
};

export interface CoreRepository {
  transaction<T>(callback: (repository: CoreRepository) => Promise<T>): Promise<T>;
  nextId(prefix: string): string;
  now(): string;
  findUserById(userId: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  addUser(user: User): Promise<void>;
  findOrganizationById(organizationId: string): Promise<Organization | null>;
  findOrganizationBySlug(slug: string): Promise<Organization | null>;
  listOrganizations(): Promise<Organization[]>;
  listOrganizationsForUser(userId: string): Promise<Organization[]>;
  addOrganization(organization: Organization): Promise<void>;
  updateOrganization(organization: Organization): Promise<void>;
  findMembershipById(membershipId: string): Promise<Membership | null>;
  findMembershipByOrganizationAndUser(
    organizationId: string,
    userId: string
  ): Promise<Membership | null>;
  listMembershipsByOrganization(organizationId: string): Promise<Membership[]>;
  listMembershipsWithUsersByOrganization(organizationId: string): Promise<MembershipWithUser[]>;
  addMembership(membership: Membership): Promise<void>;
  updateMembership(membership: Membership): Promise<void>;
  countActiveOwners(organizationId: string): Promise<number>;
  lockMembershipsByOrganization(organizationId: string): Promise<void>;
  addAuditEvent(event: AuditEvent): Promise<void>;
  listAuditEvents(): Promise<AuditEvent[]>;
}
