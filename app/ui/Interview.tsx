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
} from "lucide-react";
import type { KinState, Profile } from "../../lib/domain";
import { storyFromAnswers } from "../../lib/domain";
import { api } from "./shared";

type SpeechEngine = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

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
  onGenerated: (profile: Profile) => void;
}) {
  const [story, setStory] = useState(() => savedStory(state));
  const [relationship, setRelationship] = useState(state.relationship);
  const [terms, setTerms] = useState(state.terms);
  const [recording, setRecording] = useState(false);
  const [generating, setGenerating] = useState(false);
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
  const locked = busy || recording;

  useEffect(
    () => () => {
      const engine = speech.current;
      speech.current = null;
      if (engine) {
        engine.onresult = engine.onerror = engine.onend = null;
        engine.abort();
      }
    },
    [],
  );

  function updateStory(value: string) {
    storyRef.current = value;
    setStory(value);
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
  async function save() {
    const data = await api("/api/interview", {
      story: storyRef.current,
      relationship,
      terms,
      revision: revision.current,
    });
    revision.current = data.state.revision;
    const nextStory = savedStory(data.state);
    updateStory(nextStory);
    setSavedSnapshot(
      snapshot(nextStory, data.state.relationship, data.state.terms),
    );
    onState(data.state);
    return data.state;
  }
  function dictate() {
    if (speech.current) {
      speech.current.stop();
      return;
    }
    const browser = window as unknown as {
      SpeechRecognition?: new () => SpeechEngine;
      webkitSpeechRecognition?: new () => SpeechEngine;
    };
    const Speech = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Speech) {
      setSpeechStatus(
        "Voice-to-text is unavailable in this browser. Type your story below, or use a supported browser such as Chrome.",
      );
      document.getElementById("family-story")?.focus();
      return;
    }
    const engine = new Speech();
    speech.current = engine;
    engine.continuous = true;
    engine.interimResults = true;
    engine.lang = "en-US";
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
          : "Voice-to-text stopped. Your transcript is still here; edit it or try again.",
      );
      engine.onresult = engine.onerror = engine.onend = null;
      engine.abort();
    };
    engine.onend = () => {
      if (speech.current !== engine) return;
      speech.current = null;
      setRecording(false);
      setSpeechStatus(
        "Recording finished. Check and edit your transcript below before creating the card.",
      );
    };
    try {
      setRecording(true);
      setSpeechStatus(
        "Listening… Tell their story naturally, in any order. Select Stop when you’re done.",
      );
      engine.start();
    } catch {
      speech.current = null;
      setRecording(false);
      setSpeechStatus(
        "Microphone could not start. You can type your story below.",
      );
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
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (locked || stale || !relationship || !story.trim()) return;
          act(async () => {
            setGenerating(true);
            try {
              const saved = await save();
              const data = await api("/api/generate", {
                story: saved.story,
                relationship: saved.relationship,
                terms: saved.terms,
                revision: saved.revision,
              });
              onState(data.state);
              onGenerated(data.profile);
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
                  recording
                    ? "button voice-button recording"
                    : "button voice-button secondary"
                }
                type="button"
                disabled={busy}
                aria-pressed={recording}
                onClick={dictate}
              >
                {recording ? <MicOff size={19} /> : <Mic size={19} />}
                {recording ? "Stop recording" : "Tell their story aloud"}
              </button>
              <p role="status">{speechStatus}</p>
            </div>
            <label htmlFor="family-story">Your story or voice transcript</label>
            <textarea
              id="family-story"
              value={story}
              required
              readOnly={recording}
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
              This is the only answer box. You can mix typing and speech, then
              edit the whole transcript here. Use fictional details only; do not
              enter medication doses or treatment directions.
            </p>
          </div>
        </section>
        <section
          className="panel questionnaire-submit"
          aria-labelledby="ready-for-card"
        >
          <span className="section-icon">
            <Sparkles size={22} />
          </span>
          <h2 id="ready-for-card">One story. A more familiar care card.</h2>
          <p>
            Gemini will turn what you’ve shared into a structured draft. It can
            summarize and interpret the meaning, while keeping uncertainty
            visible. You’ll check and approve the card before it is shared.
          </p>
          <div className="questionnaire-save-status" role="status">
            {stale ? (
              "Load the latest saved story before saving."
            ) : busy ? (
              generating ? (
                "Reading your story and creating the card…"
              ) : (
                "Saving your story…"
              )
            ) : recording ? (
              "Stop recording before saving or generating."
            ) : dirty ? (
              "Unsaved changes · Save your story before leaving this page."
            ) : (
              <>
                <Check size={14} /> All changes saved
              </>
            )}
          </div>
          <div className="button-row">
            <button
              className="button secondary"
              type="button"
              disabled={locked || stale || !relationship}
              onClick={() =>
                act(async () => {
                  await save();
                })
              }
            >
              <Save size={16} /> Save story
            </button>
            <button
              className="button"
              type="submit"
              disabled={locked || stale || !relationship || !story.trim()}
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
            Nothing changes on the shared card until the family approves the
            generated profile.
          </small>
          <p className="hint">
            With a Gemini key configured, your fictional story is sent to Google
            for interpretation. Without a working key, a labelled local fallback
            uses simple rules instead. Your browser handles speech-to-text;
            KinCard stores only the text.
          </p>
        </section>
      </form>
      <p className="wizard-footnote">
        <Heart size={14} /> There’s no perfect wording. Just tell us about them.
      </p>
    </div>
  );
}
