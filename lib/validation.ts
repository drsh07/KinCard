import { PROFILE_FIELDS, emptyAnswers } from "./domain.ts";
import type { Answers, Profile, ProfileField } from "./domain.ts";

export class InputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InputError("Please send a JSON object.");
  return value as Record<string, unknown>;
}
export function text(
  value: unknown,
  name: string,
  max: number,
  required = false,
): string {
  if (typeof value !== "string") throw new InputError(`${name} must be text.`);
  const result = value.trim();
  if (result.length > max)
    throw new InputError(`${name} is too long (maximum ${max} characters).`);
  if (required && !result)
    throw new InputError(`Please enter ${name.toLowerCase()}.`);
  return result;
}
export function parseAnswers(value: unknown): Answers {
  const source = record(value);
  const result = emptyAnswers();
  for (const field of PROFILE_FIELDS)
    result[field] = text(
      source[field] ?? "",
      field,
      field === "fullName" || field === "preferredName" ? 160 : 4000,
    );
  if (
    Object.keys(source).some(
      (field) => !PROFILE_FIELDS.includes(field as ProfileField),
    )
  )
    throw new InputError("Unknown answer field.");
  return result;
}
export function parseProfile(value: unknown): Profile {
  const source = record(value);
  const { uncertainties, ...fields } = source;
  const answers = parseAnswers(fields);
  if (!answers.preferredName)
    throw new InputError("Please enter a preferred name before approving.");
  if (!Array.isArray(uncertainties) || uncertainties.length > 30)
    throw new InputError("Uncertainties must be a list of up to 30 items.");
  return {
    ...answers,
    uncertainties: uncertainties.map((value) =>
      text(value, "Uncertainty", 600),
    ),
  };
}
// A deliberately conservative demo filter: the care card is not a treatment plan.
// It runs on every field, AI output, visit suggestion, and family approval.
export function hasTreatmentDirection(value: string): boolean {
  const normalized = value.replace(/\s+/g, " ");
  const medical =
    "(?:medicin\\w*|medicat\\w*|tablet\\w*|pill\\w*|dose\\w*|dosage|insulin|antibiotic\\w*|aspirin|warfarin|metformin|paracetamol|acetaminophen|ibuprofen|morphine|donepezil|levodopa|memantine|rivastigmine|galantamine|sedative\\w*|oxygen|cream|ointment|mg|mcg|ml|units|\\w+(?:pril|olol|statin|zepam|oxetine))";
  return new RegExp(
    `\\b(?:give|administer|prescribe|increase|decrease|double|stop|start|take|apply|inject|titrate|withhold|skip|reduce|crush|mix|use|recommend|needs?|should|must)\\b.{0,90}\\b${medical}\\b|\\b\\d+(?:\\.\\d+)?\\s*(?:mg|mcg|milligrams?|milliliters?|units)\\b|\\b(?:treat|cure|diagnose)\\b.{0,45}\\b(?:with|using|by)\\b|\\b${medical}\\b.{0,45}\\b(?:daily|nightly|hourly|twice|every|before|after|at \\d)\\b|\\b(?:check|monitor|measure|test)\\b.{0,40}\\b(?:blood sugar|blood glucose|blood pressure|oxygen saturation|vitals)\\b`,
    "i",
  ).test(normalized);
}
export function safeSentences(value: string): {
  value: string;
  removed: boolean;
} {
  // Withhold the entire answer if it contains directions. Splitting first could
  // retain orphaned fragments (for example, "Give\\naspirin").
  return hasTreatmentDirection(value)
    ? { value: "", removed: true }
    : { value: value.trim(), removed: false };
}
export function uncertaintyFor(
  field: ProfileField,
  value: string,
): string | null {
  return /\b(?:maybe|might|possibly|perhaps|not sure|unsure|sometimes|I think|seems|appears|probably|uncertain)\b/i.test(
    value,
  )
    ? `${field}: family or visitor wording is uncertain; confirm before relying on this detail.`
    : null;
}
export function sanitizeProfile(profile: Profile): Profile {
  const result = { ...profile, uncertainties: [...profile.uncertainties] };
  for (const field of PROFILE_FIELDS) {
    const safe = safeSentences(result[field]);
    result[field] = safe.value;
    if (safe.removed)
      result.uncertainties.push(
        `${field}: treatment or medication directions were withheld. Confirm care instructions with the clinical care team outside this demo.`,
      );
    const uncertain = uncertaintyFor(field, result[field]);
    if (uncertain) result.uncertainties.push(uncertain);
  }
  result.uncertainties = [...new Set(result.uncertainties)].slice(0, 30);
  return result;
}
export function requireRevision(
  body: Record<string, unknown>,
  current: number,
) {
  if (!Number.isInteger(body.revision))
    throw new InputError(
      "Please refresh before saving (a revision is required).",
      409,
    );
  if (body.revision !== current)
    throw new InputError(
      "This demo was updated in another tab. Refresh and review the latest version before saving.",
      409,
    );
}
