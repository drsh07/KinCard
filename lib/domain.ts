export const PROFILE_FIELDS = [
  "fullName",
  "preferredName",
  "biography",
  "conversation",
  "comfort",
  "avoid",
  "routine",
  "communication",
  "health",
  "extra",
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type Answers = Record<ProfileField, string>;
export type Profile = Answers & { uncertainties: string[] };
export type AiMode = "mock" | "gemini";
// Card sections grow over time (family stories + approved visit observations).
export const CARD_FIELD_MAX = 10000;
export const NAME_FIELD_MAX = 160;
export const fieldMax = (field: ProfileField) =>
  field === "fullName" || field === "preferredName"
    ? NAME_FIELD_MAX
    : CARD_FIELD_MAX;
// The card's memory: every approved change, newest first.
export type CardUpdate = {
  id: string;
  at: string;
  source: "family story" | "family edit" | "visitor observation";
  summary: string;
  fields: ProfileField[];
};
export type VisitNote = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
};
export type Suggestion = {
  id: string;
  noteId: string;
  field: ProfileField;
  value: string;
  reason: string;
  uncertain: boolean;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt?: string;
  baseValue: string;
};
export type KinState = {
  profile: Profile | null;
  draft: Profile | null;
  answers: Answers;
  story?: string;
  relationship: string;
  terms: boolean;
  notes: VisitNote[];
  suggestions: Suggestion[];
  revision: number;
  qrToken: string;
  aiMode: AiMode;
  aiNotice: string;
  updatedAt: string;
  profileUpdatedAt: string;
  history?: CardUpdate[];
};
export const FIELD_LABELS: Record<ProfileField, string> = {
  fullName: "Full name",
  preferredName: "Preferred name",
  biography: "A little about me",
  conversation: "Let's talk about",
  comfort: "What brings me comfort",
  avoid: "Please keep in mind",
  routine: "My daily rhythm",
  communication: "Connecting with me",
  health: "Family-reported care needs",
  extra: "One more thing",
};
export function emptyAnswers(): Answers {
  return Object.fromEntries(
    PROFILE_FIELDS.map((field) => [field, ""]),
  ) as Answers;
}
export function storyFromAnswers(answers: Answers): string {
  const name = [
    answers.fullName && `Their full name is ${answers.fullName}.`,
    answers.preferredName && `Please call them ${answers.preferredName}.`,
  ]
    .filter(Boolean)
    .join(" ");
  return [
    name,
    ...PROFILE_FIELDS.filter(
      (field) => field !== "fullName" && field !== "preferredName",
    ).map((field) => answers[field]),
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function seedState(): KinState {
  const profile: Profile = {
    fullName: "Margaret Morgan",
    preferredName: "Maggie",
    biography:
      "I was a primary school teacher for 30 years. I love my garden, my family, and my dog, Biscuit.",
    conversation:
      "Ask me about my garden, the children I taught, or Biscuit. I love looking at old family photographs.",
    comfort:
      "A quiet room, familiar folk songs, and a warm cup of tea help me feel at home.",
    avoid:
      "Loud television and busy rooms can feel overwhelming. Questions like ‘Do you remember?’ can be frustrating.",
    routine:
      "I enjoy a slow morning in the garden, a rest after lunch, and tea around 3 pm.",
    communication:
      "Please introduce yourself, speak slowly, and give me time to answer. One question at a time works best for me.",
    health:
      "Family reports hearing difficulty. Maggie prefers people to face her when speaking. These details have not been clinically verified.",
    extra:
      "My daughter Sarah visits often. Small, familiar moments mean a lot to me.",
    uncertainties: [],
  };
  const { uncertainties: _uncertainties, ...answers } = profile;
  const now = new Date().toISOString();
  return {
    profile,
    draft: null,
    answers,
    relationship: "Daughter",
    terms: false,
    notes: [],
    suggestions: [],
    revision: 1,
    qrToken: crypto.randomUUID(),
    aiMode: "mock",
    aiNotice:
      "Preloaded fictional sample. Generate your own draft in Family speaks, where you can also check the current Gemini connection.",
    updatedAt: now,
    profileUpdatedAt: now,
  };
}
