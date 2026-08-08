import { badRequest } from "../core/errors";
import type { JsonObject } from "./types";

// A deliberately minimal, structural subset of JSON Schema -- {type, required, properties}
// with only primitive `type` checks per property. Adding a full JSON Schema validator is an
// external dependency this phase does not need (nothing here requires anything beyond
// presence + primitive-type checks + allow-listing); see the final report's "limitacoes".
export type MinimalJsonSchema = {
  type?: string;
  required?: string[];
  properties?: Record<string, { type?: string }>;
};

export function validateAgainstSchema(input: JsonObject, schema: MinimalJsonSchema, code: string) {
  for (const key of schema.required ?? []) {
    if (input[key] === undefined) {
      throw badRequest(`ai_${code}_missing_field`, `Missing required field: ${key}`);
    }
  }
  for (const [key, definition] of Object.entries(schema.properties ?? {})) {
    if (input[key] === undefined || !definition.type) {
      continue;
    }
    if (!matchesType(input[key], definition.type)) {
      throw badRequest(
        `ai_${code}_invalid_field`,
        `Field "${key}" does not match its declared type.`
      );
    }
  }
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    default:
      return true;
  }
}

// Reduces input to only the fields the prompt's input schema declares. A caller that passes a
// whole domain object (e.g. a full Candidate) has it silently reduced to the allow-listed
// fields -- this is the minimization mechanism itself, not just a check
// (SPEC-014 "Prompt e dados sensiveis").
export function minimizeInput(input: JsonObject, schema: MinimalJsonSchema): JsonObject {
  const allowedKeys = Object.keys(schema.properties ?? {});
  return Object.fromEntries(
    allowedKeys.filter((key) => input[key] !== undefined).map((key) => [key, input[key]])
  );
}

export type RenderedPrompt = {
  systemInstructions: string;
  data: JsonObject;
};

// System instructions (the published template) and user/domain data are always kept apart --
// never concatenated into a single string -- so nothing in `data` can be interpreted as an
// instruction by a provider (SPEC-014 "Prompt e dados sensiveis" / "Prompt Injection").
export function renderPrompt(
  template: string,
  input: JsonObject,
  inputSchema: MinimalJsonSchema
): RenderedPrompt {
  validateAgainstSchema(input, inputSchema, "prompt_input");
  return {
    systemInstructions: template,
    data: minimizeInput(input, inputSchema)
  };
}
