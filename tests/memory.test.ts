import test from "node:test";
import assert from "node:assert/strict";
import { emptyAnswers, seedState } from "../lib/domain.ts";
import type { Profile } from "../lib/domain.ts";
import { decideSuggestion } from "../lib/transitions.ts";
import { mergeProfile, samePerson, withHistory } from "../lib/memory.ts";

const card = (fields: Partial<Profile>): Profile => ({
  ...emptyAnswers(),
  uncertainties: [],
  ...fields,
});

test("garden then cars: the card keeps both", () => {
  const existing = card({
    preferredName: "Maggie",
    conversation: "She likes her garden.",
  });
  const merged = mergeProfile(existing, card({ conversation: "She likes cars." }));
  assert.equal(
    merged.profile.conversation,
    "She likes her garden.\n\nShe likes cars.",
  );
  assert.deepEqual(merged.added, ["conversation"]);
  assert.equal(merged.startedNew, false);
});

test("details already on the card are not repeated, and nothing is removed", () => {
  const existing = card({
    preferredName: "Maggie",
    comfort: "Folk songs help her settle. Tea helps too.",
    routine: "Rest after lunch.",
  });
  const merged = mergeProfile(
    existing,
    card({ comfort: "Folk songs help her settle. A warm blanket helps." }),
  );
  assert.equal(
    merged.profile.comfort,
    "Folk songs help her settle. Tea helps too.\n\nA warm blanket helps.",
  );
  assert.equal(merged.profile.routine, "Rest after lunch.");
  assert.equal(merged.addedDetails, 1);
});

test("an empty new value never clears an existing section", () => {
  const existing = seedState().profile!;
  const merged = mergeProfile(existing, card({}));
  assert.deepEqual(merged.profile.biography, existing.biography);
  assert.equal(merged.addedDetails, 0);
});

test("a story naming a different person starts a new card instead of mixing", () => {
  const existing = seedState().profile!;
  const other = card({ fullName: "Jordan Sample", preferredName: "Jo", biography: "Librarian." });
  assert.equal(samePerson(existing, other), false);
  const merged = mergeProfile(existing, other);
  assert.equal(merged.startedNew, true);
  assert.equal(merged.profile.biography, "Librarian.");
  assert.ok(!merged.profile.biography.includes("teacher"));
});

test("same person by name merges; a different spelling of the name is flagged, not swapped", () => {
  const existing = seedState().profile!;
  const merged = mergeProfile(
    existing,
    card({ preferredName: "Maggie", fullName: "Margaret Ann Morgan", extra: "She has a cat now." }),
  );
  assert.equal(merged.startedNew, false);
  assert.equal(merged.profile.fullName, "Margaret Morgan");
  assert.match(merged.profile.extra, /Sarah visits often[\s\S]*cat now/);
  assert.ok(merged.profile.uncertainties.some((u) => /Margaret Ann Morgan/.test(u)));
});

test("a full section keeps old text and flags the new detail", () => {
  const long = "Old detail. ".repeat(833).trim();
  const merged = mergeProfile(
    card({ preferredName: "Maggie", extra: long }),
    card({ extra: "Brand new detail." }),
  );
  assert.equal(merged.profile.extra, long);
  assert.ok(merged.profile.uncertainties.some((u) => /section is full/.test(u)));
});

test("approved visitor observations append and are logged in card history", () => {
  const state = seedState();
  state.suggestions = [
    {
      id: "s1",
      noteId: "n1",
      field: "conversation",
      value: "She lit up talking about classic cars.",
      reason: "Observation",
      uncertain: true,
      status: "pending",
      createdAt: "now",
      baseValue: state.profile!.conversation,
    },
  ];
  const next = decideSuggestion(state, "s1", "approved");
  assert.ok(next.profile!.conversation.startsWith(state.profile!.conversation));
  assert.match(next.profile!.conversation, /classic cars/);
  const logged = withHistory(next, {
    source: "visitor observation",
    summary: "Visitor observation added",
    fields: ["conversation"],
  });
  assert.equal(logged.history!.length, 1);
  assert.equal(withHistory(next, { source: "family edit", summary: "x", fields: [] }), next);
});
