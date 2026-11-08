import { CARD_FIELD_MAX } from "./domain.ts";
import type { KinState, Profile, Suggestion } from "./domain.ts";
import { InputError, sanitizeProfile } from "./validation.ts";

export function approveProfile(state: KinState, profile: Profile): KinState {
  const clean = sanitizeProfile(profile);
  if (!clean.preferredName)
    throw new InputError(
      "Please provide a preferred name without treatment directions.",
    );
  return {
    ...state,
    profile: clean,
    draft: null,
    profileUpdatedAt: new Date().toISOString(),
  };
}
export function decideSuggestion(
  state: KinState,
  suggestionId: string,
  decision: "approved" | "rejected",
): KinState {
  const suggestion = state.suggestions.find((item) => item.id === suggestionId);
  if (!suggestion)
    throw new InputError("This suggested update was not found.", 404);
  if (suggestion.status !== "pending")
    throw new InputError(
      "This suggested update has already been reviewed.",
      409,
    );
  let profile = state.profile;
  if (decision === "approved") {
    if (!profile)
      throw new InputError(
        "Approve a family profile before adding visit observations.",
        409,
      );
    // Additive: the observation is appended to the CURRENT section, so it is
    // safe even if the family edited the section after the note came in.
    const current = profile[suggestion.field];
    const observation = `Visitor observation: ${suggestion.value}`;
    const value = current.includes(suggestion.value)
      ? current
      : [current, observation].filter(Boolean).join("\n\n");
    if (value.length > CARD_FIELD_MAX)
      throw new InputError(
        "This section is full. Edit the profile to make space before approving.",
      );
    const updated = sanitizeProfile({ ...profile, [suggestion.field]: value });
    if (!updated[suggestion.field])
      throw new InputError(
        "This suggestion contains treatment directions and cannot be added to the care card.",
      );
    profile = updated;
  }
  return {
    ...state,
    profile,
    ...(decision === "approved"
      ? { profileUpdatedAt: new Date().toISOString() }
      : {}),
    suggestions: state.suggestions.map(
      (item): Suggestion =>
        item.id === suggestionId
          ? { ...item, status: decision, decidedAt: new Date().toISOString() }
          : item,
    ),
  };
}
