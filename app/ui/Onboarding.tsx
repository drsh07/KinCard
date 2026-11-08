"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Heart, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import { FIELD_LABELS, PROFILE_FIELDS } from "../../lib/domain";
import type { KinState, Profile, ProfileField } from "../../lib/domain";
import { VoiceInput } from "./voice";

// New-account setup: who you care for -> their story -> review -> dashboard.
// The story is privacy-screened (pattern filter + Gemini), then Gemini builds
// the first care card, which the family reviews before it is published.

const RELATIONSHIPS = [
  "Daughter",
  "Son",
  "Spouse or partner",
  "Grandchild",
  "Sibling",
  "Niece or nephew",
  "Friend",
  "Other family",
];
const PROMPTS = [
  "Their life: work, family, where they grew up",
  "What they love to talk about",
  "What comforts them, and what upsets them",
  "Their daily routine",
  "How to connect: hearing, speaking slowly, introducing yourself",
];

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

export function Onboarding({
  state,
  userName,
  onDone,
}: {
  state: KinState;
  userName?: string | null;
  onDone: () => Promise<void> | void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(state.draft ? 3 : 1);
  const [fullName, setFullName] = useState(state.draft?.fullName || "");
  const [preferredName, setPreferredName] = useState(state.draft?.preferredName || "");
  const [relationship, setRelationship] = useState(state.relationship || "Daughter");
  const [story, setStory] = useState("");
  const [draft, setDraft] = useState<Profile | null>(state.draft);
  const [revision, setRevision] = useState(state.revision);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const first = (userName || "").split(/\s+/)[0];
  const called = preferredName.trim() || "them";

  async function createDraft() {
    setError("");
    try {
      setBusy("Checking privacy with Gemini…");
      const intro = `Their full name is ${fullName.trim()}. Please call them ${preferredName.trim()}.`;
      const reviewed = await post<{ text: string; notice?: string; findings?: unknown[] }>(
        "/api/privacy-review",
        { text: `${intro}\n\n${story.trim()}`, keepNames: [fullName, preferredName] },
      );
      setBusy("Gemini is building the care card…");
      const generated = await post<{
        profile: Profile;
        notice?: string;
        state: KinState;
      }>("/api/generate", {
        story: reviewed.text,
        privacyReviewed: true,
        relationship,
        terms: false,
        revision,
      });
      setDraft({
        ...generated.profile,
        fullName: generated.profile.fullName || fullName.trim(),
        preferredName: generated.profile.preferredName || preferredName.trim(),
      });
      setRevision(generated.state.revision);
      setNotice(
        [reviewed.findings?.length ? reviewed.notice : "", generated.notice]
          .filter(Boolean)
          .join(" "),
      );
      setStep(3);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function publish() {
    if (!draft) return;
    setError("");
    setBusy("Creating the care card…");
    try {
      await post("/api/approve-profile", { profile: draft, revision });
      await onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  }

  const edit = (field: ProfileField, value: string) =>
    setDraft((current) => (current ? { ...current, [field]: value } : current));

  return (
    <main className="onboarding">
      <header className="onboarding-top">
        <strong className="onboarding-logo">
          <Heart size={20} /> KinCard
        </strong>
        <a className="button secondary small" href="/auth/logout">
          <LogOut size={16} /> Sign out
        </a>
      </header>
      <p className="eyebrow">Step {step} of 3 · New care card</p>

      {step === 1 && (
        <section className="panel onboarding-panel">
          <h1>Welcome{first ? `, ${first}` : ""}. Who are you caring for?</h1>
          <p className="hint">
            KinCard gives caregivers and visitors a familiar picture of your loved
            one. Use fictional details for this demo.
          </p>
          <label htmlFor="ob-full">Their full name</label>
          <input
            id="ob-full"
            value={fullName}
            maxLength={120}
            autoComplete="off"
            placeholder="e.g. Raj Patel"
            onChange={(e) => setFullName(e.target.value)}
          />
          <label htmlFor="ob-pref">What they like to be called</label>
          <input
            id="ob-pref"
            value={preferredName}
            maxLength={60}
            autoComplete="off"
            placeholder="e.g. Papa"
            onChange={(e) => setPreferredName(e.target.value)}
          />
          <label htmlFor="ob-rel">You are their</label>
          <select id="ob-rel" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
            {RELATIONSHIPS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <div className="onboarding-actions">
            <button
              className="button"
              disabled={!fullName.trim() || !preferredName.trim()}
              onClick={() => setStep(2)}
            >
              Next <ArrowRight size={18} />
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="panel onboarding-panel">
          <h1>Tell us about {called}.</h1>
          <p className="hint">Write or speak in any language. A few sentences on each helps:</p>
          <ul className="onboarding-prompts">
            {PROMPTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <label htmlFor="ob-story">Their story</label>
          <textarea
            id="ob-story"
            rows={9}
            maxLength={8000}
            value={story}
            disabled={Boolean(busy)}
            placeholder={`${called} was a teacher for 30 years and loves gardening…`}
            onChange={(e) => setStory(e.target.value)}
          />
          <VoiceInput
            endpoint="/api/transcribe"
            disabled={Boolean(busy)}
            label="Speak instead"
            onText={(spoken) =>
              setStory((current) => `${current}${current ? "\n\n" : ""}${spoken}`.slice(0, 8000))
            }
          />
          <p className="hint">
            <ShieldCheck size={14} /> Before anything is saved, phone numbers and
            addresses are removed and Gemini removes other people&apos;s names.
          </p>
          <div className="onboarding-actions">
            <button className="button secondary" disabled={Boolean(busy)} onClick={() => setStep(1)}>
              <ArrowLeft size={18} /> Back
            </button>
            <button
              className="button"
              disabled={Boolean(busy) || story.trim().length < 20}
              onClick={createDraft}
            >
              {busy ? <LoaderCircle size={18} className="spin" /> : null}
              {busy || "Create care card with Gemini"}
            </button>
          </div>
        </section>
      )}

      {step === 3 && draft && (
        <section className="panel onboarding-panel">
          <h1>Check {draft.preferredName || called}&apos;s card.</h1>
          <p className="hint">
            Gemini organised your story. Edit anything that isn&apos;t right, then
            create the card. You can add more anytime.
          </p>
          {notice && <p className="hint onboarding-notice">{notice}</p>}
          {PROFILE_FIELDS.map((field) => (
            <div key={field} className="onboarding-field">
              <label htmlFor={`ob-${field}`}>{FIELD_LABELS[field]}</label>
              {field === "fullName" || field === "preferredName" ? (
                <input
                  id={`ob-${field}`}
                  value={draft[field]}
                  maxLength={160}
                  onChange={(e) => edit(field, e.target.value)}
                />
              ) : (
                <textarea
                  id={`ob-${field}`}
                  rows={Math.min(8, Math.max(2, Math.ceil((draft[field] || "").length / 60) + 1))}
                  maxLength={10000}
                  value={draft[field]}
                  placeholder="Not shared yet"
                  onChange={(e) => edit(field, e.target.value)}
                />
              )}
            </div>
          ))}
          <div className="onboarding-actions">
            <button
              className="button secondary"
              disabled={Boolean(busy)}
              onClick={() => {
                setStep(2);
                setDraft(null);
              }}
            >
              <ArrowLeft size={18} /> Start over
            </button>
            <button
              className="button"
              disabled={Boolean(busy) || !draft.preferredName.trim()}
              onClick={publish}
            >
              {busy ? <LoaderCircle size={18} className="spin" /> : null}
              {busy || "Create care card"}
            </button>
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="onboarding-error">
          {error}
        </p>
      )}
    </main>
  );
}
