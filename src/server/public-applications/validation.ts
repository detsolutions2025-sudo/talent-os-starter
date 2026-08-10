import { badRequest } from "../core/errors";
import { normalizeCandidateEmail } from "../candidates/validation";
import type { NormalizedPublicApplicationInput, PublicApplicationInput } from "./types";

const idempotencyKeyPattern = /^[a-zA-Z0-9_-]{8,200}$/;

// Allow-list estrita (SPEC-020, secao 25): apenas os campos abaixo sao lidos do corpo da
// requisicao. Qualquer outro campo enviado pelo cliente (id, organizationId, creationOrigin,
// createdByUserId, source, applicationStatus, currentStage, status de consentimento,
// timestamps, metadados de auditoria) e simplesmente nunca lido -- mass assignment desses
// campos e estruturalmente impossivel, nao apenas recusado.
export function validatePublicApplicationInput(input: unknown): NormalizedPublicApplicationInput {
  const entry = normalizeInputObject(input);
  const consent = normalizeConsentEntry(entry.consent);
  return {
    fullName: validateFullName(entry.fullName ?? entry.full_name),
    preferredName: validateOptionalText(entry.preferredName ?? entry.preferred_name, 100),
    email: validateEmail(entry.email),
    normalizedEmail: normalizeCandidateEmail(entry.email),
    phone: validateOptionalPhone(entry.phone),
    location: entry.location ?? null,
    consentGranted: Boolean(consent.granted),
    consentTermsVersion: validateOptionalText(consent.termsVersion ?? consent.terms_version, 100),
    honeypot: validateOptionalText(entry.website, 500),
    formRenderedAt: validateOptionalIsoDate(entry.formRenderedAt ?? entry.form_rendered_at)
  };
}

// Cabecalho HTTP `Idempotency-Key` (SPEC-020, secao 15) -- nunca um campo do corpo/DTO de
// dados pessoais (secao 25). Formato opaco, gerado/gerenciado pelo frontend.
export function validateIdempotencyKey(value: unknown) {
  const key = String(value ?? "").trim();
  if (!idempotencyKeyPattern.test(key)) {
    throw badRequest(
      "public_application_idempotency_key_invalid",
      "Idempotency-Key header is required and must be a valid opaque token."
    );
  }
  return key;
}

function validateFullName(value: unknown) {
  const text = String(value ?? "").trim();
  if (text.length < 2 || text.length > 200) {
    throw badRequest("public_application_full_name_invalid", "Full name is invalid.");
  }
  return text;
}

function validateEmail(value: unknown) {
  const email = String(value ?? "").trim();
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!pattern.test(email) || email.length > 320) {
    throw badRequest("public_application_email_invalid", "Email is invalid.");
  }
  return email;
}

function validateOptionalPhone(value: unknown) {
  const phone = normalizeText(value);
  const pattern = /^[+0-9()\-\s]{6,30}$/;
  if (phone && !pattern.test(phone)) {
    throw badRequest("public_application_phone_invalid", "Phone is invalid.");
  }
  return phone;
}

function validateOptionalText(value: unknown, maxLength: number) {
  const text = normalizeText(value);
  if (text && text.length > maxLength) {
    throw badRequest("public_application_text_too_long", "Field is too long.");
  }
  return text;
}

function validateOptionalIsoDate(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function normalizeConsentEntry(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeInputObject(value: unknown): PublicApplicationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("public_application_input_invalid", "Application input is invalid.");
  }
  return value as PublicApplicationInput;
}

function normalizeText(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return text ? text : null;
}
