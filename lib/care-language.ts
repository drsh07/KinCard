import type { Profile, ProfileField } from "./domain.ts";

export const CARE_LANGUAGES = [
  { code: "en", name: "English · Original", target: "English", dir: "ltr" },
  {
    code: "pa",
    name: "ਪੰਜਾਬੀ · Punjabi",
    target: "Punjabi in Gurmukhi script",
    dir: "ltr",
  },
  {
    code: "zh-Hans",
    name: "简体中文 · Simplified Chinese",
    target: "Simplified Chinese",
    dir: "ltr",
  },
  {
    code: "zh-Hant",
    name: "繁體中文 · Traditional Chinese",
    target: "Traditional Chinese",
    dir: "ltr",
  },
  { code: "hi", name: "हिन्दी · Hindi", target: "Hindi", dir: "ltr" },
  {
    code: "tl",
    name: "Filipino · Tagalog",
    target: "Tagalog / Filipino",
    dir: "ltr",
  },
  { code: "fr", name: "Français · French", target: "French", dir: "ltr" },
  { code: "es", name: "Español · Spanish", target: "Spanish", dir: "ltr" },
  { code: "ko", name: "한국어 · Korean", target: "Korean", dir: "ltr" },
  {
    code: "vi",
    name: "Tiếng Việt · Vietnamese",
    target: "Vietnamese",
    dir: "ltr",
  },
  { code: "ar", name: "العربية · Arabic", target: "Arabic", dir: "rtl" },
  {
    code: "pt",
    name: "Português · Portuguese",
    target: "Portuguese",
    dir: "ltr",
  },
] as const;
export type CareLanguage = (typeof CARE_LANGUAGES)[number]["code"];
export const CARD_COPY = {
  caregiverView: "Caregiver view",
  approvedProfile: "Family-approved profile",
  hello: "HELLO, I’M",
  caption: "A little about me, for a more familiar visit.",
  fictionalPerson: "Fictional person · Sample care card",
  emptySection: "Not shared yet.",
  healthNotice:
    "Family-reported · Not clinically verified. This is not a treatment plan.",
  uncertaintyTitle: "Please keep these uncertainties in mind",
  reviewedUpdated: "Reviewed by family · Updated",
  preferencesNotice:
    "Preferences and family reports, not clinical instructions.",
  refreshCard: "Refresh care card",
  noteTitle: "A little moment worth sharing?",
  noteIntro:
    "Your observations help the family understand what makes a good visit.",
  yourName: "Your name",
  observationQuestion: "What did you notice?",
  notePlaceholder:
    "For example: They smiled while looking at garden photos today and asked to see them again.",
  sampleNote: "Try a fictional sample note",
  shareNote: "Share with the family",
  savingNote: "Saving your observation…",
  notePrivacy:
    "Fictional observations only. Identifiers may be removed before sharing. Gemini, when configured, suggests an update for family review; no automatic changes or treatment advice.",
  thanks: "Thank you for sharing.",
  savedNote: "Your screened note was saved for family review.",
  unchangedNote:
    "The care card stays unchanged until the family approves an update.",
  anotherNote: "Write another note",
  kindness: "Thank you for seeing the person behind the care.",
  demoNotice:
    "Fictional demo · Simplified login and QR access. Not suitable for real patient data.",
  footerNotice:
    "Fictional hackathon demo · Demo access only. Not suitable for real patient information.",
  familySpace: "Open family space",
  translationWarning:
    "AI translation may contain errors. Compare with the original; ask the family if anything is unclear.",
};
export type CareCopy = Record<keyof typeof CARD_COPY, string>;
export type CareTranslation = {
  language: CareLanguage;
  profile: Profile;
  labels: Record<ProfileField, string>;
  copy: CareCopy;
  privacyFiltered: boolean;
  notice: string;
};
