import { badRequest } from "../core/errors";
import {
  organizationalUnitTypes,
  type OrganizationalUnitInput,
  type OrganizationalUnitMoveInput,
  type OrganizationalUnitType
} from "./types";

const codePattern = /^[A-Z0-9_-]+$/;

export function normalizeCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

export function normalizeText(value: unknown) {
  const text = value === null || value === undefined ? null : String(value).trim();
  return text ? text : null;
}

export function requireAdminReason(reason: unknown) {
  const normalized = normalizeText(reason);

  if (!normalized) {
    throw badRequest("admin_reason_required", "Administrative reason is required.");
  }

  return normalized;
}

export function validateCreateInput(input: OrganizationalUnitInput) {
  const code = validateCode(input.code);
  const name = validateName(input.name);
  const type = validateType(input.type);
  const displayOrder = validateDisplayOrder(input.displayOrder ?? 0);
  validateOptionalStatus(input.status);

  return {
    code,
    name,
    type,
    parentId: normalizeNullableId(input.parentId),
    managerName: normalizeText(input.managerName),
    managerEmail: validateEmail(input.managerEmail),
    description: normalizeText(input.description),
    displayOrder
  };
}

export function validateUpdateInput(input: OrganizationalUnitInput) {
  if (input.status !== undefined && !["active", "inactive"].includes(String(input.status))) {
    throw badRequest(
      "organizational_unit_status_invalid",
      "Organizational unit status is invalid."
    );
  }

  return {
    code: input.code === undefined ? undefined : validateCode(input.code),
    name: input.name === undefined ? undefined : validateName(input.name),
    type: input.type === undefined ? undefined : validateType(input.type),
    managerName: input.managerName === undefined ? undefined : normalizeText(input.managerName),
    managerEmail: input.managerEmail === undefined ? undefined : validateEmail(input.managerEmail),
    description: input.description === undefined ? undefined : normalizeText(input.description),
    displayOrder:
      input.displayOrder === undefined ? undefined : validateDisplayOrder(input.displayOrder)
  };
}

export function validateMoveInput(input: OrganizationalUnitMoveInput) {
  return {
    parentId: input.parentId === undefined ? null : normalizeNullableId(input.parentId),
    displayOrder:
      input.displayOrder === undefined ? undefined : validateDisplayOrder(input.displayOrder)
  };
}

function validateCode(value: unknown) {
  const code = normalizeCode(value);

  if (code.length < 2 || code.length > 50 || !codePattern.test(code)) {
    throw badRequest("organizational_unit_code_invalid", "Organizational unit code is invalid.");
  }

  return code;
}

function validateName(value: unknown) {
  const name = String(value ?? "").trim();

  if (name.length < 2 || name.length > 150) {
    throw badRequest("organizational_unit_name_invalid", "Organizational unit name is invalid.");
  }

  return name;
}

function validateType(value: unknown): OrganizationalUnitType {
  if (!organizationalUnitTypes.includes(value as OrganizationalUnitType)) {
    throw badRequest("organizational_unit_type_invalid", "Organizational unit type is invalid.");
  }

  return value as OrganizationalUnitType;
}

function validateDisplayOrder(value: unknown) {
  const order = Number(value);

  if (!Number.isInteger(order) || order < 0) {
    throw badRequest(
      "organizational_unit_display_order_invalid",
      "Display order must be an integer greater than or equal to zero."
    );
  }

  return order;
}

function validateEmail(value: unknown) {
  const email = normalizeText(value);

  if (!email) {
    return null;
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw badRequest("organizational_unit_manager_email_invalid", "Manager email is invalid.");
  }

  return email.toLowerCase();
}

function validateOptionalStatus(status: unknown) {
  if (status !== undefined && !["active", "inactive"].includes(String(status))) {
    throw badRequest(
      "organizational_unit_status_invalid",
      "Organizational unit status is invalid."
    );
  }
}

function normalizeNullableId(value: unknown) {
  const normalized = normalizeText(value);
  return normalized ? normalized : null;
}
