"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Heart,
  NotebookPen,
  RefreshCw,
  Sparkles,
  Sprout,
} from "lucide-react";
import type { Profile } from "../../lib/domain";
import {
  api,
  Avatar,
  CareSections,
  DemoNotice,
  formatDate,
  Logo,
} from "./shared";
export default function CareView({ token }: { token: string }) {
  const [data, setData] = useState<{
      profile: Profile | null;
      updatedAt: string;
      revision: number;
    } | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [author, setAuthor] = useState("Alex · demo caregiver"),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(""),
    [noteError, setNoteError] = useState("");
  async function refresh() {
    setError("");
    try {
      setData(await api(`/api/care/${token}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [token]);
  return (
    <main className="care-page">
      <header className="care-topbar">
        <a href="/" aria-label="KinCard family sign in">
          <Logo />
        </a>
        <span className="pill light">
          <Heart size={13} /> Caregiver view
        </span>
      </header>
      <div className="care-container">
        <DemoNotice />
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
              <RefreshCw size={16} /> Try again
            </button>
          </section>
        ) : data?.profile ? (
          <>
            <section className="care-hero">
              <span className="pill green">
                <Check size={13} /> Family-approved profile
              </span>
              <Avatar name={data.profile.preferredName} large />
              <p className="eyebrow">HELLO, I’M</p>
              <h1>
                {data.profile.preferredName}
                <span className="terracotta">.</span>
              </h1>
              <p className="care-full-name">{data.profile.fullName}</p>
              <p className="care-hero-caption">
                A little about me, for a more familiar visit.
              </p>
              <span className="fictional-tag">
                Fictional person · Sample care card
              </span>
              <span className="care-flower" aria-hidden="true">
                ✳
              </span>
            </section>
            <section className="panel caregiver-sections">
              <CareSections profile={data.profile} />
            </section>
            {data.profile.uncertainties.length > 0 && (
              <section className="panel uncertainties">
                <h3>Please keep these uncertainties in mind</h3>
                <ul>
                  {data.profile.uncertainties.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </section>
            )}
            <div className="care-approved">
              <CheckCircle2 size={16} />
              <span>
                Reviewed by family · Updated {formatDate(data.updatedAt)}
                <br />
                <small>
                  Preferences and family reports, not clinical instructions.
                </small>
              </span>
              <button
                className="icon-button"
                onClick={refresh}
                aria-label="Refresh care card"
              >
                <RefreshCw size={16} />
              </button>
            </div>
            <section className="panel note-panel" id="visit-note">
              <span className="section-icon">
                <NotebookPen size={23} />
              </span>
              <h2>A little moment worth sharing?</h2>
              <p>
                Your observations help the family understand what makes a good
                visit.
              </p>
              {sent ? (
                <div className="note-success" role="status">
                  <CheckCircle2 size={28} />
                  <h3>Thank you for sharing.</h3>
                  <p>{sent}</p>
                  <small>
                    The care card stays unchanged until the family approves an
                    update.
                  </small>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setSent("");
                      setText("");
                    }}
                  >
                    Write another note
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setNoteError("");
                    try {
                      const result = await api(`/api/care/${token}/notes`, {
                        author,
                        text,
                      });
                      setSent(
                        result.notice ||
                          "Your note was saved for family review. Any suggested update will appear in the family’s visit journal.",
                      );
                      setText("");
                    } catch (err) {
                      setNoteError((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label htmlFor="note-author">Your name</label>
                  <input
                    id="note-author"
                    value={author}
                    required
                    maxLength={80}
                    onChange={(e) => setAuthor(e.target.value)}
                  />
                  <label htmlFor="visit-text">What did you notice?</label>
                  <textarea
                    id="visit-text"
                    rows={5}
                    value={text}
                    maxLength={4000}
                    required
                    minLength={5}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="For example: Maggie smiled while looking at garden photos today. She asked to see them again."
                  />
                  <button
                    type="button"
                    className="text-button sample-note"
                    onClick={() =>
                      setText(
                        "Maggie smiled while looking at garden photos today. She asked to see them again.",
                      )
                    }
                  >
                    <Sparkles size={14} /> Try a fictional sample note
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
                    {busy
                      ? "Saving your observation…"
                      : "Share with the family"}
                    <ArrowRight size={17} />
                  </button>
                  <p className="hint">
                    Fictional observations only. Gemini, when configured,
                    suggests a possible update for family review. No automatic
                    profile changes or treatment advice.
                  </p>
                </form>
              )}
            </section>
            <div className="care-kindness">
              <Heart size={21} />
              <p>
                Thank you for seeing the person
                <br />
                <em>behind the care.</em>
              </p>
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
          <p>
            Fictional hackathon demo · Demo access only
            <br />
            Not suitable for real patient information.
          </p>
          <a href="/">
            Open family space <ArrowRight size={12} />
          </a>
        </footer>
      </div>
    </main>
  );
}
