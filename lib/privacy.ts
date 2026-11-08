import { PROFILE_FIELDS } from "./domain.ts";
import type { Answers, Profile } from "./domain.ts";
import { InputError, text } from "./validation.ts";

/** A deterministic data-minimization screen, NOT a legal-compliance decision. */
export type PrivacyFinding = {
  category: string;
  label: string;
  count: number;
  action: "removed" | "review";
};
export type PrivacyScreen = {
  text: string;
  findings: PrivacyFinding[];
  changed: boolean;
};
const REMOVED = "[removed]";
const labels: Record<string, string> = {
  healthId: "Health-card or patient identifier removed",
  governmentId: "Government identifier removed",
  phone: "Telephone or contact number removed",
  email: "Email address removed",
  address: "Precise street address removed",
  postal: "Postal code removed",
  birthDate: "Full birth date removed",
  financial: "Financial account or payment detail removed",
  credential: "Password, access code, or API credential removed",
  thirdParty: "Sensitive detail about another person removed",
  thirdPartyName: "Unnecessary third-party name removed",
  healthContext:
    "Health or care information: check that sharing is necessary and authorized",
  thirdPartyContext:
    "Another person is mentioned: review whether their details are needed",
};
const digitWords: Record<string, string> = {
  zero: "0",
  oh: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};
const digitToken =
  "(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|[0-9])";
const spokenDigits = new RegExp(
  `\\b${digitToken}(?:[\\s,–—-]+${digitToken}){6,19}\\b`,
  "gi",
);
function normalizeDigits(value: string) {
  return value
    .toLowerCase()
    .replace(
      /\b(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g,
      (word) => digitWords[word],
    )
    .replace(/\D/g, "");
}

export function screenText(input: string): PrivacyScreen {
  let value = input;
  const findings = new Map<string, PrivacyFinding>();
  function add(category: string, action: "removed" | "review" = "removed") {
    const key = category + action;
    const previous = findings.get(key);
    findings.set(key, {
      category,
      label: labels[category],
      action,
      count: (previous?.count || 0) + 1,
    });
  }
  function redact(pattern: RegExp, category: string) {
    value = value.replace(pattern, () => {
      add(category);
      return REMOVED;
    });
  }

  // Remove entire contextual passages for explicit allegations/sensitive facts
  // about third parties. Family care preferences themselves are not prohibited.
  value = value.replace(/[^.!?\n]+(?:[.!?]+["'”’]?|$)/g, (passage) => {
    if (
      /\b(?:neighbou?r|co-?worker|colleague|caregiver|staff member|nurse|friend|daughter|son|sister|brother|aunt|uncle)\b/i.test(
        passage,
      ) &&
      /\b(?:HIV|AIDS|cancer|diabet\w*|depress\w*|mental illness|addict\w*|sexual|abuse[sd]?|stole|steal\w*|fraud|criminal|convict\w*|bankrupt\w*|salary|income|debt)\b/i.test(
        passage,
      )
    ) {
      add("thirdParty");
      return ` ${REMOVED} `;
    }
    return passage;
  });
  // Labels make number-word transcripts interpretable without changing routine
  // words such as "tea at three" or "one question at a time".
  const labelledDigits = new RegExp(
    `\\b(?:personal health number|PHN|health[- ]?card(?: number)?|patient (?:ID|number)|medical record(?: number)?|MRN|social insurance(?: number)?|SIN|phone(?: number)?|telephone(?: number)?|mobile(?: number)?|cell(?: number)?|fax(?: number)?|account(?: number)?)\\s*(?:(?:is|was|equals|number)\\s*)?[:#=]?\\s*((?:${digitToken}[\\s,–—-]*){7,20})\\b`,
    "gi",
  );
  value = value.replace(labelledDigits, (whole: string) => {
    const category = /\b(?:PHN|health|patient|medical|MRN)\b/i.test(whole)
      ? "healthId"
      : /\b(?:SIN|social insurance)\b/i.test(whole)
        ? "governmentId"
        : /\baccount\b/i.test(whole)
          ? "financial"
          : "phone";
    add(category);
    return REMOVED;
  });
  redact(
    /\b(?:personal health number|PHN|health[- ]?card(?: number)?|patient (?:ID|number)|medical record(?: number)?|MRN)\s*(?:(?:is|was|number)\s*)?[:#=]?\s*[A-Z0-9][A-Z0-9 -]{5,25}\b/gi,
    "healthId",
  );
  redact(
    /\b(?:social insurance(?: number)?|SIN)\s*(?:is\s*)?[:#=]?\s*\d{3}[ -]?\d{3}[ -]?\d{3}\b/gi,
    "governmentId",
  );
  redact(/\b\d{3}[ -]\d{3}[ -]\d{3}\b/g, "governmentId");
  redact(/\b\d{9}\b/g, "governmentId");
  redact(
    /\b(?:passport(?: number)?|driver[’']?s? licen[cs]e(?: number)?)\s*(?:is\s*)?[:#=]?\s*[A-Z0-9][A-Z0-9-]{5,20}\b/gi,
    "governmentId",
  );
  const spokenPin = new RegExp(
    `\\b(?:PIN|passcode)\\s*(?:is\\s*)?[:=]?\\s*(?:${digitToken}[\\s,–—-]*){4,8}\\b`,
    "gi",
  );
  redact(spokenPin, "credential");
  redact(
    /\b(?:password|passcode|PIN|API[- ]?key|access token|secret key)\s*(?:is\s*)?[:=]?\s*["']?[A-Za-z0-9_./+!@$%#=-]{4,200}["']?/gi,
    "credential",
  );
  redact(
    /\b(?:bank account|account number|credit card|debit card|card number|routing number|IBAN)\s*(?:is\s*)?[:#=]?\s*[A-Z0-9][A-Z0-9 -]{5,40}\b/gi,
    "financial",
  );
  redact(/\b\d(?:[ -]?\d){12,18}\b/g, "financial");
  redact(
    /(?:\+?1[ .-]?)?(?:\(\d{3}\)|\b\d{3})[ .-]?\d{3}[ .-]?\d{4}\b(?:\s*(?:ext\.?|extension|x)\s*\d{1,6})?/gi,
    "phone",
  );
  redact(/\b\d{3}[ .-]\d{4}\b/g, "phone");
  redact(/\+\d(?:[ .()-]?\d){7,14}\b/g, "phone");
  value = value.replace(spokenDigits, (whole: string) => {
    const digits = normalizeDigits(whole);
    if (digits.length < 7) return whole;
    add(
      digits.length === 9
        ? "governmentId"
        : digits.length > 12
          ? "financial"
          : "phone",
    );
    return REMOVED;
  });
  redact(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}\b/gi, "email");
  redact(
    /\b[A-Z0-9][A-Z0-9._+-]*(?:\s+dot\s+[A-Z0-9]+){0,4}\s+at\s+[A-Z0-9-]+(?:\s+dot\s+[A-Z0-9-]+){0,3}\s+dot\s+(?:com|ca|org|net|edu|gov|io)\b/gi,
    "email",
  );
  redact(/\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/gi, "postal");
  redact(
    /\b\d{1,6}\s+(?:[A-Z0-9'’.-]+\s+){1,5}(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Boulevard|Blvd\.?|Crescent|Cres\.?|Court|Ct\.?|Way|Place|Pl\.?)\b(?:\s*(?:unit|apt\.?|suite|#)\s*[A-Z0-9-]+)?/gi,
    "address",
  );
  redact(
    /\b(?:date of birth|birth date|DOB|born on|birthday is)\s*(?:is\s*)?[:=]?\s*(?:\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4})\b/gi,
    "birthDate",
  );
  redact(
    /\b(?:date of birth|birth date|DOB|born on|birthday is)\s*(?:is\s*)?[:=]?\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:[a-z]+[ -]+){1,5}(?:nineteen|twenty)\s+(?:[a-z]+[ -]*){1,3}\b/gi,
    "birthDate",
  );
  const spokenAddress = new RegExp(
    `\\b(?:${digitToken}[ -]+){1,6}(?:[A-Z'’.-]+\\s+){1,5}(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Crescent|Cres|Court|Ct|Way|Place)\\b`,
    "gi",
  );
  redact(spokenAddress, "address");
  redact(/\b\d{1,2}[-/]\d{1,2}[-/](?:19|20)\d{2}\b/g, "birthDate");
  // Full numeric dates without a birth label are uncertain date-like identifiers.
  redact(/\b(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/g, "birthDate");
  redact(
    /\b(?:neighbou?r|co-?worker|colleague|staff member|nurse)\s+(?:named\s+)?[A-Z][a-z'’-]+\s+[A-Z][a-z'’-]+\b/g,
    "thirdPartyName",
  );

  if (
    /\b(?:hearing|mobility|wheelchair|dementia|diabet\w*|arthritis|condition|diagnos\w*|care needs|health)\b/i.test(
      value,
    )
  )
    add("healthContext", "review");
  if (
    /\b(?:daughter|son|sister|brother|friend|neighbou?r|caregiver|nurse|staff)\b/i.test(
      value,
    )
  )
    add("thirdPartyContext", "review");
  const result = value
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    text: result,
    findings: [...findings.values()],
    changed: result !== input.trim(),
  };
}

/** Rejects unreviewed or newly reintroduced identifiers; messages never echo input. */
export function requirePrivacyReviewed(
  value: string,
  reviewed: unknown,
): string {
  if (!value.trim()) return "";
  if (reviewed !== true)
    throw new InputError(
      "Review the privacy-screened text before saving or sending it to Gemini.",
    );
  const screened = screenText(value);
  if (screened.changed)
    throw new InputError(
      "This text still contains details the privacy screen removes. Run the privacy review again before continuing.",
    );
  return screened.text;
}

export function screenAnswers(answers: Answers): Answers {
  return Object.fromEntries(
    PROFILE_FIELDS.map((field) => {
      const max =
        field === "fullName" || field === "preferredName" ? 160 : 4000;
      return [
        field,
        text(screenText(answers[field]).text, "Screened answer", max),
      ];
    }),
  ) as Answers;
}
export function screenProfile(profile: Profile): Profile {
  const answers = screenAnswers(profile);
  const changed = PROFILE_FIELDS.some(
    (field) => answers[field] !== profile[field],
  );
  const uncertainties = profile.uncertainties.map((value) =>
    text(screenText(value).text, "Screened uncertainty", 600),
  );
  if (changed)
    uncertainties.push(
      "Some identifying or third-party details were removed by the privacy screen. Review the remaining care information.",
    );
  return {
    ...answers,
    uncertainties: [...new Set(uncertainties)].slice(0, 30),
  };
}
