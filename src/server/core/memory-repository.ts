import type { AuditEvent, CoreState, Membership, Organization, User } from "./types";
import type { CoreRepository, MembershipWithUser } from "./repository";

export class MemoryCoreRepository implements CoreRepository {
  constructor(private state: CoreState = createInitialState()) {}

  snapshot() {
    return this.state;
  }

  async transaction<T>(callback: (repository: CoreRepository) => Promise<T>) {
    const draft = new MemoryCoreRepository(cloneState(this.state));
    const result = await callback(draft);
    this.state = draft.snapshot();
    return result;
  }

  nextId(prefix: string) {
    const id = `${prefix}_${this.state.nextId.toString().padStart(6, "0")}`;
    this.state.nextId += 1;
    return id;
  }

  now() {
    return new Date().toISOString();
  }

  async findUserById(userId: string) {
    return this.state.users.find((user) => user.id === userId) ?? null;
  }

  async findUserByEmail(email: string) {
    return this.state.users.find((user) => user.email === email) ?? null;
  }

  async listUsers() {
    return this.state.users;
  }

  async addUser(user: User) {
    this.state.users.push(user);
  }

  async findOrganizationById(organizationId: string) {
    return (
      this.state.organizations.find((organization) => organization.id === organizationId) ?? null
    );
  }

  async findOrganizationBySlug(slug: string) {
    return this.state.organizations.find((organization) => organization.slug === slug) ?? null;
  }

  async listOrganizations() {
    return this.state.organizations;
  }

  async listOrganizationsForUser(userId: string) {
    const organizationIds = this.state.memberships
      .filter((membership) => membership.userId === userId && membership.status === "active")
      .map((membership) => membership.organizationId);

    return this.state.organizations.filter(
      (organization) =>
        organizationIds.includes(organization.id) && organization.status === "active"
    );
  }

  async addOrganization(organization: Organization) {
    this.state.organizations.push(organization);
  }

  async updateOrganization(organization: Organization) {
    const index = this.state.organizations.findIndex(
      (candidate) => candidate.id === organization.id
    );
    if (index >= 0) {
      this.state.organizations[index] = organization;
    }
  }

  async findMembershipById(membershipId: string) {
    return this.state.memberships.find((membership) => membership.id === membershipId) ?? null;
  }

  async findMembershipByOrganizationAndUser(organizationId: string, userId: string) {
    return (
      this.state.memberships.find(
        (membership) => membership.organizationId === organizationId && membership.userId === userId
      ) ?? null
    );
  }

  async listMembershipsByOrganization(organizationId: string) {
    return this.state.memberships.filter(
      (membership) => membership.organizationId === organizationId
    );
  }

  async listMembershipsWithUsersByOrganization(organizationId: string) {
    return this.state.memberships
      .filter((membership) => membership.organizationId === organizationId)
      .map<MembershipWithUser>((membership) => ({
        ...membership,
        user: this.state.users.find((user) => user.id === membership.userId) ?? null
      }));
  }

  async addMembership(membership: Membership) {
    this.state.memberships.push(membership);
  }

  async updateMembership(membership: Membership) {
    const index = this.state.memberships.findIndex((candidate) => candidate.id === membership.id);
    if (index >= 0) {
      this.state.memberships[index] = membership;
    }
  }

  async countActiveOwners(organizationId: string) {
    return this.state.memberships.filter(
      (membership) =>
        membership.organizationId === organizationId &&
        membership.role === "owner" &&
        membership.status === "active"
    ).length;
  }

  async lockMembershipsByOrganization(organizationId: string) {
    void organizationId;
    return undefined;
  }

  async addAuditEvent(event: AuditEvent) {
    this.state.auditEvents.push(event);
  }

  async listAuditEvents() {
    return this.state.auditEvents;
  }
}

export function createInitialState(): CoreState {
  return {
    users: [],
    organizations: [],
    memberships: [],
    auditEvents: [],
    nextId: 1
  };
}

function cloneState(state: CoreState): CoreState {
  return {
    users: structuredClone(state.users),
    organizations: structuredClone(state.organizations),
    memberships: structuredClone(state.memberships),
    auditEvents: structuredClone(state.auditEvents),
    nextId: state.nextId
  };
}
