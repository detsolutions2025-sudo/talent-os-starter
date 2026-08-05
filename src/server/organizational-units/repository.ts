import type { OrganizationalUnit } from "./types";

export interface OrganizationalUnitRepository {
  nextId(prefix: string): string;
  now(): string;
  lockOrganizationUnits(organizationId: string): Promise<void>;
  createUnit(unit: OrganizationalUnit): Promise<void>;
  updateUnit(unit: OrganizationalUnit): Promise<void>;
  findUnitById(unitId: string): Promise<OrganizationalUnit | null>;
  findUnitByCode(organizationId: string, code: string): Promise<OrganizationalUnit | null>;
  listUnits(organizationId: string): Promise<OrganizationalUnit[]>;
  listActiveUnits(organizationId: string): Promise<OrganizationalUnit[]>;
  countActiveChildren(unitId: string): Promise<number>;
}
