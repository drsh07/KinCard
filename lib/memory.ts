import { CARD_FIELD_MAX, FIELD_LABELS, PROFILE_FIELDS } from "./domain.ts";
import type { CardUpdate, KinState, Profile, ProfileField } from "./domain.ts";
import { sanitizeProfile } from "./validation.ts";

// The care card is the AI's long-term memory of the person. New stories and
// visit observations ADD to it. Merging is done here in code, not by the model,
// so nothing the family already approved can be silently dropped.

const NAME_FIELDS: ProfileField[] = ["fullName", "preferredName"];
const CONTENT_FIELDS = PROFILE_FIELDS.filter((f) => !NAME_FIELDS.includes(f));
const HISTORY_LIMIT = 200;

const normalize = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const nameTokens = (...values: string[]) =>
  values
    .flatMap((value) => normalize(value).split(" "))
    .filter((token) => token.length > 1);

export function sentencesOf(value: string): string[] {
  return (value.match(/[^.!?\n]+(?:[.!?]+["'”’)]*|$)/g) || [])
    .map((part) => part.trim())
    .filter(Boolean);
}

/** True when a new profile is about the same person as the existing card.
 * A story that names nobody is treated as more about the same person. */
export function samePerson(existing: Profile | null, incoming: Profile) {
  if (!existing) return false;
  const known = new Set(
    nameTokens(existing.fullName, existing.preferredName),
  );
  const named = nameTokens(incoming.fullName, incoming.preferredName);
  if (!known.size || !named.length) return true;
  return named.some((token) => known.has(token));
}

export type MergeResult = {
  profile: Profile;
  added: ProfileField[];
  // The new text appended to each section (used to blend it in smoothly).
  additions: Partial<Record<ProfileField, string>>;
  addedDetails: number;
  startedNew: boolean;
};

/** Existing card + new information. Old text is never removed or reworded;
 * new sentences already on the card are skipped. */
export function mergeProfile(
  existing: Profile | null,
  incoming: Profile,
): MergeResult {
  const filled = (p: Profile) => CONTENT_FIELDS.filter((f) => p[f].trim());
  if (!existing || !samePerson(existing, incoming))
    return {
      profile: incoming,
      added: filled(incoming),
      additions: {},
      addedDetails: filled(incoming).reduce(
        (n, f) => n + sentencesOf(incoming[f]).length,
        0,
      ),
      startedNew: Boolean(existing),
    };

  const result: Profile = {
    ...existing,
    uncertainties: [...existing.uncertainties],
  };
  const added: ProfileField[] = [];
  const additions: Partial<Record<ProfileField, string>> = {};
  let addedDetails = 0;

  for (const field of NAME_FIELDS) {
    const next = incoming[field].trim();
    if (!next) continue;
    if (!result[field]) result[field] = next;
    else if (normalize(next) !== normalize(result[field]))
      result.uncertainties.push(
        `${FIELD_LABELS[field]}: the new story says "${next.slice(0, 80)}". The card keeps "${result[field]}" until the family changes it.`,
      );
  }
  for (const field of CONTENT_FIELDS) {
    const current = result[field];
    const seen = normalize(current);
    const fresh: string[] = [];
    for (const sentence of sentencesOf(incoming[field])) {
      const key = normalize(sentence);
      if (!key || seen.includes(key) || fresh.some((s) => normalize(s) === key))
        continue;
      fresh.push(sentence);
    }
    if (!fresh.length) continue;
    const next = [current, fresh.join(" ")].filter(Boolean).join("\n\n");
    if (next.length > CARD_FIELD_MAX) {
      result.uncertainties.push(
        `${FIELD_LABELS[field]}: this section is full, so the new detail was not added. Shorten older text in review to make room.`,
      );
      continue;
    }
    result[field] = next;
    added.push(field);
    if (current) additions[field] = fresh.join(" ");
    addedDetails += fresh.length;
  }
  // Keep new flags, but drop "no name found" flags the existing card answers.
  const nameKnown = Boolean(result.preferredName);
  result.uncertainties.push(
    ...incoming.uncertainties.filter(
      (flag) => !(nameKnown && /^(?:Preferred name|Full name|preferredName|fullName):/.test(flag)),
    ),
  );
  return {
    profile: sanitizeProfile(result),
    added,
    additions,
    addedDetails,
    startedNew: false,
  };
}

export function mergeNotice(merge: MergeResult, name: string): string {
  if (merge.startedNew)
    return "This story names a different person than the current card, so it starts a new card. Approving it replaces the current card.";
  if (!merge.addedDetails)
    return `Everything in this story is already on ${name === "the" ? "the" : `${name}'s`} card. Nothing new to add, and nothing was removed.`;
  const sections = merge.added.map((f) => FIELD_LABELS[f]).join(", ");
  return `Added ${merge.addedDetails} new detail${merge.addedDetails === 1 ? "" : "s"} to ${name === "the" ? "the" : `${name}'s`} card (${sections}). Everything already on the card was kept.`;
}

/** Which sections changed between two versions of the card. */
export function changedFields(before: Profile | null, after: Profile) {
  return PROFILE_FIELDS.filter((f) => (before?.[f] || "") !== after[f]);
}

export function withHistory(
  state: KinState,
  entry: Omit<CardUpdate, "id" | "at">,
): KinState {
  if (!entry.fields.length) return state;
  const update: CardUpdate = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...entry,
  };
  return {
    ...state,
    history: [update, ...(state.history || [])].slice(0, HISTORY_LIMIT),
  };
}

/** Compact view of the card for Gemini to use as memory. */
export function cardMemory(profile: Profile | null) {
  if (!profile) return null;
  return Object.fromEntries(
    PROFILE_FIELDS.filter((f) => profile[f]).map((f) => [f, profile[f]]),
  );
}
