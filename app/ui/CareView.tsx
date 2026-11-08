"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Heart,
  Languages,
  NotebookPen,
  RefreshCw,
  Sparkles,
  Sprout,
} from "lucide-react";
import type { Profile } from "../../lib/domain";
import { FIELD_LABELS } from "../../lib/domain";
import { CARE_LANGUAGES, CARD_COPY } from "../../lib/care-language";
import type { CareLanguage, CareTranslation } from "../../lib/care-language";
import { api, Avatar, CareSections, formatDate, Logo } from "./shared";

type CardData = {
  profile: Profile | null;
  updatedAt: string;
  revision: number;
};
export default function CareView({ token }: { token: string }) {
  const [data, setData] = useState<CardData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [author, setAuthor] = useState("Alex · demo caregiver"),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [noteNotice, setNoteNotice] = useState(""),
    [noteError, setNoteError] = useState("");
  const [language, setLanguage] = useState<CareLanguage>("en"),
    [translation, setTranslation] = useState<CareTranslation | null>(null),
    [translating, setTranslating] = useState(false),
    [translationError, setTranslationError] = useState("");
  const translationRequest = useRef(0),
    controller = useRef<AbortController | null>(null),
    refreshRequest = useRef(0),
    noteRequest = useRef(0),
    noteController = useRef<AbortController | null>(null);
  const copy = translation?.copy || CARD_COPY;
  const profile = translation?.profile || data?.profile;
  const labels = translation?.labels || FIELD_LABELS;
  const displayLanguage = CARE_LANGUAGES.find(
    (item) => item.code === (translation?.language || "en"),
  )!;

  function clearTranslation() {
    translationRequest.current++;
    controller.current?.abort();
    controller.current = null;
    setTranslation(null);
    setTranslating(false);
    setTranslationError("");
  }
  async function refresh() {
    const request = ++refreshRequest.current;
    clearTranslation();
    setLanguage("en");
    setError("");
    try {
      const next = await api(`/api/care/${token}`);
      if (refreshRequest.current === request) setData(next);
    } catch (e) {
      if (refreshRequest.current === request) setError((e as Error).message);
    } finally {
      if (refreshRequest.current === request) setLoading(false);
    }
  }
  useEffect(() => {
    noteRequest.current++;
    noteController.current?.abort();
    setBusy(false);
    setSent(false);
    setText("");
    setNoteNotice("");
    setNoteError("");
    refresh();
    return () => {
      translationRequest.current++;
      refreshRequest.current++;
      controller.current?.abort();
      noteRequest.current++;
      noteController.current?.abort();
    };
  }, [token]);
  async function translate() {
    if (!data?.profile || language === "en") {
      clearTranslation();
      return;
    }
    const request = ++translationRequest.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const target = language;
    setTranslating(true);
    setTranslationError("");
    setTranslation(null);
    try {
      const result = await api(
        `/api/care/${token}/translate`,
        { language: target, revision: data.revision },
        abort.signal,
      );
      if (translationRequest.current === request && !abort.signal.aborted)
        setTranslation(result);
    } catch (e) {
      if (translationRequest.current === request && !abort.signal.aborted)
        setTranslationError((e as Error).message);
    } finally {
      if (translationRequest.current === request) {
        setTranslating(false);
        controller.current = null;
      }
    }
  }

  return (
    <main
      className="care-page"
      lang={displayLanguage.code}
      dir={displayLanguage.dir}
    >
      <header className="care-topbar">
        <a href="/" aria-label="KinCard family sign in">
          <Logo />
        </a>
        <span className="pill light">
          <Heart size={13} />
          {copy.caregiverView}
        </span>
      </header>
      <div className="care-container">
        <div className="demo-notice">
          <span className="demo-dot" />
          <span>{copy.demoNotice}</span>
        </div>
        {loading ? (
          <div className="empty-state">
            <span className="spinner" />
            <p>Opening a familiar story…</p>
          </div>
        ) : error ? (
          <section className="panel empty-state">
            <Sprout size={35} />
            <h1>This card isn’t available.</h1>
            <p role="alert">{error}</p>
            <p>
              The family may have replaced this QR link. Ask for their latest
              code.
            </p>
            <button className="button secondary" onClick={refresh}>
              <RefreshCw size={16} />
              Try again
            </button>
          </section>
        ) : data?.profile && profile ? (
          <>
            <section
              className="panel translation-panel"
              dir="ltr"
              lang="en"
              aria-labelledby="translation-title"
            >
              <h2 id="translation-title">
                <Languages size={21} /> Read this card in your language
              </h2>
              <p>
                The section headings, care details, questions, and buttons can
                be translated by Gemini.
              </p>
              <div className="translation-controls">
                <div>
                  <label htmlFor="care-language">Language</label>
                  <select
                    id="care-language"
                    value={language}
                    onChange={(e) => {
                      clearTranslation();
                      setLanguage(e.target.value as CareLanguage);
                    }}
                  >
                    {CARE_LANGUAGES.map((item) => (
                      <option value={item.code} key={item.code}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="button"
                  disabled={language === "en" || translating}
                  onClick={translate}
                >
                  {translating ? (
                    <span className="spinner small" />
                  ) : (
                    <Languages size={17} />
                  )}{" "}
                  {translating ? "Translating…" : "Translate card"}
                </button>
                {translation && (
                  <button
                    className="text-button"
                    onClick={() => {
                      clearTranslation();
                      setLanguage("en");
                    }}
                  >
                    Show original English
                  </button>
                )}
              </div>
              {translating && (
                <p className="translation-status" role="status">
                  The original English card remains below while Gemini
                  translates.
                </p>
              )}
              {translationError && (
                <p className="inline-error" role="alert">
                  {translationError}
                </p>
              )}
              {translation && (
                <p className="translation-status" role="status">
                  {translation.notice}
                </p>
              )}
            </section>
            {translation && (
              <div className="translation-warning">
                <Languages size={17} />
                <p>{copy.translationWarning}</p>
              </div>
            )}
            <section className="care-hero">
              <span className="pill green">
                <Check size={13} />
                {copy.approvedProfile}
              </span>
              <Avatar name={profile.preferredName} large />
              <p className="eyebrow">{copy.hello}</p>
              <h1>
                {profile.preferredName}
                <span className="terracotta">.</span>
              </h1>
              <p className="care-full-name">{profile.fullName}</p>
              <p className="care-hero-caption">{copy.caption}</p>
              <span className="fictional-tag">{copy.fictionalPerson}</span>
              <span className="care-flower" aria-hidden="true">
                ✳
              </span>
            </section>
            <section className="panel caregiver-sections">
              <CareSections
                profile={profile}
                labels={labels}
                emptyText={copy.emptySection}
                healthNotice={copy.healthNotice}
              />
            </section>
            {profile.uncertainties.length > 0 && (
              <section className="panel uncertainties">
                <h3>{copy.uncertaintyTitle}</h3>
                <ul>
                  {profile.uncertainties.map((value, index) => (
                    <li key={index}>{value}</li>
                  ))}
                </ul>
              </section>
            )}
            <div className="care-approved">
              <CheckCircle2 size={16} />
              <span>
                {copy.reviewedUpdated} {formatDate(data.updatedAt)}
                <br />
                <small>{copy.preferencesNotice}</small>
              </span>
              <button
                className="icon-button"
                onClick={refresh}
                aria-label={copy.refreshCard}
              >
                <RefreshCw size={16} />
              </button>
            </div>
            <section className="panel note-panel" id="visit-note">
              <span className="section-icon">
                <NotebookPen size={23} />
              </span>
              <h2>{copy.noteTitle}</h2>
              <p>{copy.noteIntro}</p>
              {sent ? (
                <div className="note-success" role="status">
                  <CheckCircle2 size={28} />
                  <h3>{copy.thanks}</h3>
                  <p>{copy.savedNote}</p>
                  {noteNotice && (
                    <p lang="en" dir="ltr" className="note-result-notice">
                      {noteNotice}
                    </p>
                  )}
                  <small>{copy.unchangedNote}</small>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setSent(false);
                      setText("");
                      setNoteNotice("");
                    }}
                  >
                    {copy.anotherNote}
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (busy) return;
                    const request = ++noteRequest.current;
                    noteController.current?.abort();
                    const abort = new AbortController();
                    noteController.current = abort;
                    setBusy(true);
                    setNoteError("");
                    setNoteNotice("");
                    try {
                      const result = await api(
                        `/api/care/${token}/notes`,
                        { author, text },
                        abort.signal,
                      );
                      if (
                        noteRequest.current === request &&
                        !abort.signal.aborted
                      ) {
                        setSent(true);
                        setText("");
                        setNoteNotice(result.notice);
                      }
                    } catch (e) {
                      if (
                        noteRequest.current === request &&
                        !abort.signal.aborted
                      )
                        setNoteError((e as Error).message);
                    } finally {
                      if (noteRequest.current === request) {
                        setBusy(false);
                        noteController.current = null;
                      }
                    }
                  }}
                >
                  <label htmlFor="note-author">{copy.yourName}</label>
                  <input
                    id="note-author"
                    value={author}
                    required
                    maxLength={80}
                    disabled={busy}
                    onChange={(e) => setAuthor(e.target.value)}
                  />
                  <label htmlFor="visit-text">{copy.observationQuestion}</label>
                  <textarea
                    id="visit-text"
                    rows={5}
                    value={text}
                    maxLength={4000}
                    required
                    minLength={5}
                    disabled={busy}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={copy.notePlaceholder}
                  />
                  <button
                    type="button"
                    className="text-button sample-note"
                    disabled={busy}
                    onClick={() =>
                      setText(
                        "Maggie smiled while looking at garden photos today. She asked to see them again.",
                      )
                    }
                  >
                    <Sparkles size={14} />
                    {copy.sampleNote}
                  </button>
                  {noteError && (
                    <p role="alert" className="inline-error">
                      {noteError}
                    </p>
                  )}
                  <button
                    className="button full"
                    disabled={busy || text.trim().length < 5}
                  >
                    {busy ? (
                      <span className="spinner small" />
                    ) : (
                      <NotebookPen size={17} />
                    )}{" "}
                    {busy ? copy.savingNote : copy.shareNote}
                    <ArrowRight size={17} />
                  </button>
                  <p className="hint">{copy.notePrivacy}</p>
                </form>
              )}
            </section>
            <div className="care-kindness">
              <Heart size={21} />
              <p>{copy.kindness}</p>
            </div>
          </>
        ) : (
          <section className="panel empty-state">
            <Heart />
            <h1>A story is on its way.</h1>
            <p>
              The family hasn’t approved a care card yet. Please check back
              later.
            </p>
          </section>
        )}
        <footer className="care-footer">
          <Logo />
          <p>{copy.footerNotice}</p>
          <a href="/">
            {copy.familySpace}
            <ArrowRight size={12} />
          </a>
        </footer>
      </div>
    </main>
  );
}
