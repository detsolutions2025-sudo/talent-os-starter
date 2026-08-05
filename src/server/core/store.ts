import type { AuditEvent, CoreState, Membership, Organization, User } from "./types";

export class CoreStore {
  constructor(private state: CoreState = createInitialState()) {}

  snapshot() {
    return this.state;
  }

  async transaction<T>(callback: (store: CoreStore) => Promise<T> | T) {
    const draft = new CoreStore(cloneState(this.state));
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

  users() {
    return this.state.users;
  }

  organizations() {
    return this.state.organizations;
  }

  memberships() {
    return this.state.memberships;
  }

  auditEvents() {
    return this.state.auditEvents;
  }

  addUser(user: User) {
    this.state.users.push(user);
  }

  addOrganization(organization: Organization) {
    this.state.organizations.push(organization);
  }

  addMembership(membership: Membership) {
    this.state.memberships.push(membership);
  }

  addAuditEvent(event: AuditEvent) {
    this.state.auditEvents.push(event);
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
