import { errorCategoryToAppError } from "./error-categories";
import type { AIFeatureCatalogEntry, AIModelRegistryEntry, JsonObject } from "./types";

// Compares AI Feature Catalog.required_capabilities against AI Model Registry.capabilities
// (SPEC-014 "Compatibilidade Feature x Modelo"). Deliberately simple and deterministic:
// - `contextWindow` (or `context_window`) in required_capabilities is compared against the
//   model's own context_window column, not against a generic capabilities entry;
// - a boolean requirement of `true` requires a truthy value in the model's capabilities;
// - an array requirement (e.g. supported regions) requires the model's capability array to
//   contain every required item;
// - anything else requires an exact match.
// A model is never called to "see if it works" -- incompatibility is decided from data alone,
// before any external call (SPEC-014: "nunca se tenta 'ver se funciona'").
export function isCompatible(feature: AIFeatureCatalogEntry, model: AIModelRegistryEntry): boolean {
  const required = feature.requiredCapabilities ?? {};

  for (const [key, value] of Object.entries(required)) {
    if (key === "contextWindow" || key === "context_window") {
      const minimumWindow = Number(value);
      if (!model.contextWindow || model.contextWindow < minimumWindow) {
        return false;
      }
      continue;
    }

    const modelValue = (model.capabilities as JsonObject)[key];

    if (typeof value === "boolean") {
      if (value && !modelValue) {
        return false;
      }
      continue;
    }

    if (Array.isArray(value)) {
      const modelArray = Array.isArray(modelValue) ? modelValue : [];
      const missesSomething = value.some((item) => !modelArray.includes(item));
      if (missesSomething) {
        return false;
      }
      continue;
    }

    if (modelValue !== value) {
      return false;
    }
  }

  return true;
}

export function assertCompatible(feature: AIFeatureCatalogEntry, model: AIModelRegistryEntry) {
  if (!isCompatible(feature, model)) {
    throw errorCategoryToAppError(
      "configuration_error",
      `Model ${model.provider}/${model.modelKey} is not compatible with Feature ${feature.featureKey}.`
    );
  }
}
