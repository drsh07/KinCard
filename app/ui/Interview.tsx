"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Heart,
  Mic,
  MicOff,
  Save,
  Sparkles,
  Sprout,
  Users,
  ShieldCheck,
} from "lucide-react";
import type { KinState, Profile } from "../../lib/domain";
import { storyFromAnswers } from "../../lib/domain";
import { api } from "./shared";
import { GeminiStatus } from "./GeminiStatus";
import { screenText } from "../../lib/privacy";
import { createLocalSpeech } from "../../lib/local-speech";
import { useGeminiRecorder } from "./voice";
import type { SpeechEngine } from "../../lib/local-speech";

const questions = [
  "What should we call them?",
  "Tell us a little about their story.",
  "What do they love talking about?",
  "What helps them feel comfortable?",
  "What can feel upsetting?",
  "What does an ordinary day look like?",
  "How do they like to connect?",
  "Any other care needs to understand?",
  "Anything else that makes a difference?",
];
const MAX_STORY = 12000;
const SAMPLE_STORY =
  "My mum is Margaret Morgan, but everyone calls her Maggie. She was a primary school teacher for 30 years. She loves talking about her garden, her old students, and her dog Biscuit. When she feels overwhelmed, a quiet room and familiar folk songs often help, although not every time. Loud television can upset her, and she gets frustrated when people ask 'Do you remember?' She usually rests after lunch and has tea around three. Please introduce yourself, speak slowly, and give her time to answer. She has trouble hearing, so facing her while speaking helps. I'm her daughter Sarah, and I visit often.";

function savedStory(state: KinState) {
  return state.story ?? storyFromAnswers(state.answers);
}
function snapshot(story: string, relationship: string, terms: boolean) {
  return JSON.stringify({ story, relationship, terms });
}

export function Interview({
  state,
  busy,
  act,
  onState,
  onGenerated,
}: {
  state: KinState;
  busy: boolean;
  act: (task: () => Promise<void>) => Promise<void>;
  onState: (state: KinState) => void;
  onGenerated: (profile: Profile, revision: number) => void;
}) {
  const [story, setStory] = useState(() => savedStory(state));
  const [relationship, setRelationship] = useState(state.relationship);
  const [terms, setTerms] = useState(state.terms);
  const [recording, setRecording] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [preparingSpeech, setPreparingSpeech] = useState(false);
  const [privacyDraft, setPrivacyDraft] = useState<string | null>(null);
  const [privacySource, setPrivacySource] = useState<string | null>(null);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [privacyFindings, setPrivacyFindings] = useState<
    ReturnType<typeof screenText>["findings"]
  >([]);
  const [privacyError, setPrivacyError] = useState("");
  const mounted = useRef(true);
  const [speechStatus, setSpeechStatus] = useState(
    "Speak freely or type below. Your whole story stays editable.",
  );
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    snapshot(savedStory(state), state.relationship, state.terms),
  );
  const speech = useRef<SpeechEngine | null>(null);
  const revision = useRef(state.revision);
  const storyRef = useRef(story);
  const dirty = snapshot(story, relationship, terms) !== savedSnapshot;
  const stale = revision.current !== state.revision;
  const [reviewing, setReviewing] = useState(false);
  const [privacyNotice, setPrivacyNotice] = useState("");
  // Gemini voice: used when on-device speech isn't available (e.g. iPhone).
  const gemini = useGeminiRecorder("/api/transcribe", (spoken) => {
    const base = storyRef.current;
    updateStory(`${base}${base ? "\n\n" : ""}${spoken}`.slice(0, MAX_STORY));
  });
  const geminiBusy = gemini.state !== "idle";
  const locked = busy || recording || preparingSpeech || geminiBusy || reviewing;
  const privacyReady =
    privacyDraft !== null && privacyConfirmed && privacySource === story;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const engine = speech.current;
      speech.current = null;
      if (engine) {
        engine.onresult = engine.onerror = engine.onend = null;
        engine.abort();
      }
    };
  }, []);

  function updateStory(value: string) {
    storyRef.current = value;
    setStory(value);
    setPrivacyDraft(null);
    setPrivacySource(null);
    setPrivacyConfirmed(false);
    setPrivacyError("");
  }
  function loadSavedStory() {
    updateStory(savedStory(state));
    setRelationship(state.relationship);
    setTerms(state.terms);
    revision.current = state.revision;
    setSavedSnapshot(
      snapshot(savedStory(state), state.relationship, state.terms),
    );
    setSpeechStatus("Saved story loaded. You can type or speak to add to it.");
  }
  async function reviewPrivacy() {
    const source = storyRef.current;
    setReviewing(true);
    let reviewed: {
      text: string;
      findings: ReturnType<typeof screenText>["findings"];
      notice?: string;
    };
    try {
      const response = await fetch("/api/privacy-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: source }),
      });
      if (!response.ok) throw new Error("review failed");
      reviewed = await response.json();
    } catch {
      reviewed = {
        ...screenText(source),
        notice:
          "Gemini's privacy check couldn't be reached, so only the basic filter ran. Please check names yourself.",
      };
    } finally {
      if (mounted.current) setReviewing(false);
    }
    if (!mounted.current || storyRef.current !== source) return;
    setPrivacyDraft(reviewed.text);
    setPrivacyFindings(reviewed.findings);
    setPrivacyNotice(reviewed.notice || "");
    setPrivacySource(source);
    setPrivacyConfirmed(false);
    setPrivacyError("");
    requestAnimationFrame(() =>
      document
        .getElementById("privacy-review")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }
  function confirmPrivacy(checked: boolean) {
    if (!checked || privacyDraft === null) {
      setPrivacyConfirmed(false);
      return;
    }
    const reviewed = screenText(privacyDraft);
    if (reviewed.changed) {
      setPrivacyDraft(reviewed.text);
      setPrivacyFindings(reviewed.findings);
      setPrivacyError(
        "Additional identifiers were removed from your edits. Review the revised text and confirm again.",
      );
      setPrivacyConfirmed(false);
      return;
    }
    setPrivacyError("");
    setPrivacyConfirmed(true);
  }
  async function save() {
    if (!privacyReady || privacyDraft === null)
      throw new Error(
        "Review the screened text before saving or sending it to Gemini.",
      );
    const finalCheck = screenText(privacyDraft);
    if (finalCheck.changed)
      throw new Error("Please check the privacy review again before sharing.");
    const data = await api("/api/interview", {
      story: finalCheck.text,
      relationship,
      terms,
      revision: revision.current,
      privacyReviewed: true,
    });
    revision.current = data.state.revision;
    const nextStory = savedStory(data.state);
    updateStory(nextStory);
    setPrivacyDraft(nextStory);
    setPrivacySource(nextStory);
    setPrivacyConfirmed(true);
    setSavedSnapshot(
      snapshot(nextStory, data.state.relationship, data.state.terms),
    );
    onState(data.state);
    return data.state;
  }
  async function dictate() {
    if (gemini.state === "recording") {
      gemini.stop();
      return;
    }
    if (speech.current) {
      speech.current.stop();
      return;
    }
    if (preparingSpeech) return;
    setPreparingSpeech(true);
    try {
      const engine = await createLocalSpeech();
      if (!mounted.current) {
        engine.abort();
        return;
      }
      speech.current = engine;
      const base = storyRef.current;
      engine.onresult = (event) => {
        if (speech.current !== engine) return;
        const spoken = Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(" ");
        const combined = `${base}${base ? "\n\n" : ""}${spoken}`;
        updateStory(combined.slice(0, MAX_STORY));
        if (combined.length >= MAX_STORY) engine.stop();
      };
      engine.onerror = (event) => {
        if (speech.current !== engine) return;
        speech.current = null;
        setRecording(false);
        setSpeechStatus(
          event.error === "not-allowed"
            ? "Microphone access was not granted. You can type your story below."
            : "On-device speech stopped. No cloud fallback was used. Edit the text or type your story.",
        );
        engine.onresult = engine.onerror = engine.onend = null;
        engine.abort();
      };
      engine.onend = () => {
        if (speech.current !== engine) return;
        speech.current = null;
        setRecording(false);
        setSpeechStatus(
          "Recording finished. Edit the transcript, then select Review privacy before sharing.",
        );
      };
      setRecording(true);
      setSpeechStatus(
        "Listening on your device… Select Stop when you’re done, then review privacy.",
      );
      engine.start();
    } catch {
      const failedEngine = speech.current;
      speech.current = null;
      if (failedEngine) {
        failedEngine.onresult =
          failedEngine.onerror =
          failedEngine.onend =
            null;
        try {
          failedEngine.abort();
        } catch {
          /* A failed start may already be stopped. */
        }
      }
      if (mounted.current) {
        setRecording(false);
        // On-device speech isn't available here: use Gemini instead.
        setSpeechStatus("");
        void gemini.start();
      }
    } finally {
      if (mounted.current) setPreparingSpeech(false);
    }
  }

  return (
    <div className="interview-layout single-page-interview story-interview">
      <div className="page-heading">
        <div>
          <p className="eyebrow">FAMILY SPEAKS</p>
          <h1>Tell their story, your way.</h1>
          <p>
            One story, written or spoken. We’ll bring the details together into
            their care card.
          </p>
        </div>
        <span className="pill green">
          <Heart size={13} /> The person behind the care
        </span>
      </div>
      <GeminiStatus />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (
            locked ||
            stale ||
            !relationship ||
            !story.trim() ||
            !privacyReady
          )
            return;
          act(async () => {
            setGenerating(true);
            try {
              const saved = await save();
              const data = await api("/api/generate", {
                story: saved.story,
                privacyReviewed: true,
                relationship: saved.relationship,
                terms: saved.terms,
                revision: saved.revision,
              });
              onState(data.state);
              onGenerated(data.profile, data.state.revision);
              window.scrollTo({ top: 0, behavior: "smooth" });
            } finally {
              setGenerating(false);
            }
          });
        }}
      >
        <section
          className="panel questionnaire-intro"
          aria-labelledby="about-family"
        >
          <div className="questionnaire-intro-heading">
            <span className="question-symbol">
              <Users size={26} />
            </span>
            <div>
              <p className="eyebrow">BEFORE THEIR STORY</p>
              <h2 id="about-family">A little about you.</h2>
            </div>
          </div>
          <label htmlFor="relationship">
            What is your relationship to the person?
          </label>
          <select
            id="relationship"
            value={relationship}
            required
            disabled={busy}
            onChange={(event) => setRelationship(event.target.value)}
          >
            <option value="">Choose your relationship</option>
            {[
              "Daughter",
              "Son",
              "Partner",
              "Sibling",
              "Grandchild",
              "Friend",
              "Other family member",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <label className="checkbox-label terms-checkbox">
            <input
              type="checkbox"
              checked={terms}
              disabled={busy}
              onChange={(event) => setTerms(event.target.checked)}
            />
            <span>
              I acknowledge this is a fictional demo.
              <small>Optional demo terms checkbox · Not legal consent.</small>
            </span>
          </label>
        </section>
        {stale && (
          <div className="callout questionnaire-conflict" role="alert">
            <div>
              <strong>A newer version has been saved.</strong>
              <p>
                Copy any text you want to keep before loading the latest saved
                story. Loading it replaces the text on this page.
              </p>
              <button
                type="button"
                className="text-button"
                disabled={locked}
                onClick={loadSavedStory}
              >
                Load latest saved story
              </button>
            </div>
          </div>
        )}
        <section className="panel story-workspace">
          <aside className="story-guide" aria-labelledby="story-guide-title">
            <span className="section-icon">
              <Sprout size={22} />
            </span>
            <p className="eyebrow">A LITTLE HELP GETTING STARTED</p>
            <h2 id="story-guide-title">Things you could share.</h2>
            <p>
              Use these questions as a guide. Tell us everything in one story,
              in any order.
            </p>
            <ul>
              {questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
            <p className="hint">
              You don’t need to answer every question. If you’re unsure, say so.
            </p>
          </aside>
          <div className="story-composer">
            <h2>In your own words.</h2>
            <p>
              You don’t need to organize the details. Gemini will interpret your
              story, sort it into the card, and flag anything unclear for your
              review.
            </p>
            <div className="voice-control story-voice-control">
              <button
                className={
                  recording || gemini.state === "recording"
                    ? "button voice-button recording"
                    : "button voice-button secondary"
                }
                type="button"
                disabled={busy || preparingSpeech || gemini.state === "transcribing" || reviewing}
                aria-pressed={recording || gemini.state === "recording"}
                onClick={dictate}
              >
                {recording || gemini.state === "recording" ? (
                  <MicOff size={19} />
                ) : (
                  <Mic size={19} />
                )}
                {preparingSpeech
                  ? "Checking voice options…"
                  : gemini.state === "transcribing"
                    ? "Gemini is transcribing…"
                    : recording || gemini.state === "recording"
                      ? "Stop recording"
                      : "Tell their story aloud"}
              </button>
              <p role="status">{gemini.message || speechStatus}</p>
            </div>
            <label htmlFor="family-story">Your story or voice transcript</label>
            <textarea
              id="family-story"
              value={story}
              required
              readOnly={recording || preparingSpeech || geminiBusy}
              disabled={busy}
              rows={16}
              maxLength={MAX_STORY}
              aria-describedby="story-input-hint"
              placeholder="For example: My mum is Margaret, but everyone calls her Maggie. She used to teach and loves talking about her garden. When things get noisy, she can feel overwhelmed…"
              onChange={(event) => updateStory(event.target.value)}
            />
            <div className="story-composer-meta">
              <small>
                {story.length.toLocaleString()} / {MAX_STORY.toLocaleString()}{" "}
                characters
              </small>
              <div className="story-example-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={locked}
                  onClick={() => updateStory(SAMPLE_STORY)}
                >
                  Use fictional example
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={locked || !story}
                  onClick={() => updateStory("")}
                >
                  Clear story
                </button>
              </div>
            </div>
            <p className="hint" id="story-input-hint">
              Voice uses on-device speech when the browser supports it;
              otherwise Gemini transcribes the recording (not stored). You
              review the text before anything is shared. Use fictional details
              only.
            </p>
          </div>
        </section>
        <section
          className="panel questionnaire-submit"
          aria-labelledby="ready-for-card"
        >
          <span className="section-icon">
            <ShieldCheck size={22} />
          </span>
          <h2 id="ready-for-card">Check privacy before sharing.</h2>
          <p>
            A basic filter removes numbers, emails and addresses first, then
            Gemini removes other people’s names and details it can’t catch. You
            review the result and decide what is necessary for the care card.
          </p>
          <button
            className="button secondary privacy-review-button"
            type="button"
            disabled={locked || !story.trim()}
            onClick={reviewPrivacy}
          >
            <ShieldCheck size={17} />{" "}
            {reviewing ? "Checking privacy with Gemini…" : "Review privacy"}
          </button>
          {privacyDraft !== null && (
            <div className="privacy-review" id="privacy-review">
              <h3>Text you will share</h3>
              {privacyNotice && <p className="hint">{privacyNotice}</p>}
              <p className="hint">
                {privacyFindings.some((finding) => finding.action === "removed")
                  ? "Potential identifiers were removed. Categories marked for review remain in the text and need your judgment."
                  : "No automatic removals were found. Review any flagged details below; the story may still identify someone."}
              </p>
              {privacyFindings.length > 0 && (
                <ul className="privacy-findings">
                  {privacyFindings.map((finding, index) => (
                    <li key={index}>
                      {finding.action === "removed" ? "Removed" : "Review"}:{" "}
                      {finding.label} <span>{finding.count}</span>
                    </li>
                  ))}
                </ul>
              )}
              <label htmlFor="privacy-story">
                Review and edit the screened text
              </label>
              <textarea
                id="privacy-story"
                rows={8}
                value={privacyDraft}
                maxLength={MAX_STORY}
                disabled={locked}
                onChange={(event) => {
                  setPrivacyDraft(event.target.value);
                  setPrivacyConfirmed(false);
                  setPrivacyError("");
                }}
              />
              <p className="privacy-limits">
                This is a heuristic privacy aid, not a PIPA/FIPPA compliance
                decision. It can miss names, indirect identifiers, and sensitive
                context. Health information may remain identifiable. Remove
                unnecessary details about this person or anyone else, and
                confirm your authority and purpose for sharing.
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={privacyConfirmed}
                  disabled={locked}
                  onChange={(event) => confirmPrivacy(event.target.checked)}
                />
                <span>
                  I reviewed this text and want to use it for the demo care
                  card. This confirms my review; it is not legal consent or a
                  compliance certificate.
                </span>
              </label>
              {privacyError && (
                <p className="inline-error" role="alert">
                  {privacyError}
                </p>
              )}
            </div>
          )}
          <div className="questionnaire-save-status" role="status">
            {stale ? (
              "Load the latest saved story before saving."
            ) : busy ? (
              generating ? (
                "Reading the reviewed story and creating the card…"
              ) : (
                "Saving the reviewed story…"
              )
            ) : recording || preparingSpeech ? (
              "Stop recording before reviewing or sharing."
            ) : !privacyReady ? (
              "Review privacy and confirm the screened text before sharing."
            ) : dirty ? (
              "Reviewed text is ready. Saving replaces the raw story with the screened version."
            ) : (
              <>
                <Check size={14} /> Reviewed text ready
              </>
            )}
          </div>
          <div className="button-row">
            <button
              className="button secondary"
              type="button"
              disabled={locked || stale || !relationship || !privacyReady}
              onClick={() =>
                act(async () => {
                  await save();
                })
              }
            >
              <Save size={16} /> Save reviewed story
            </button>
            <button
              className="button"
              type="submit"
              disabled={
                locked ||
                stale ||
                !relationship ||
                !privacyReady ||
                !privacyDraft?.trim()
              }
            >
              {generating ? (
                <span className="spinner small" />
              ) : (
                <Sparkles size={17} />
              )}
              {generating
                ? "Creating draft care card…"
                : "Generate draft care card"}
            </button>
          </div>
          <small>
            Only reviewed text is sent. Nothing changes on the shared card until
            the family approves the generated profile.
          </small>
          <p className="hint">
            Gemini receives the screened text when a key is configured;
            otherwise a labelled local fallback is used. The server checks the
            reviewed text again. Existing saved demo records are not
            automatically erased by this feature. Real patient use still
            requires a complete privacy, consent, security and vendor review.
          </p>
        </section>
      </form>
      <p className="wizard-footnote">
        <Heart size={14} /> There’s no perfect wording. Just tell us about them.
      </p>
    </div>
  );
}
