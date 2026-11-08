"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Heart,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import type { KinState, Profile, Suggestion } from "../../lib/domain";
import { FIELD_LABELS, PROFILE_FIELDS } from "../../lib/domain";
import { api } from "./shared";
export { Interview } from "./Interview";
export function QRImage({
  value,
  onData,
}: {
  value: string;
  onData?: (data: string) => void;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    setSrc("");
    QRCode.toDataURL(value, {
      width: 640,
      margin: 3,
      errorCorrectionLevel: "M",
      color: { dark: "#342f2b", light: "#ffffff" },
    })
      .then((data) => {
        if (live) {
          setSrc(data);
          onData?.(data);
        }
      })
      .catch(() => setSrc(""));
    return () => {
      live = false;
    };
  }, [value]);
  return src ? (
    <img
      src={src}
      alt="QR code opening the caregiver care card"
      width={220}
      height={220}
    />
  ) : (
    <span className="spinner" />
  );
}
export function Sharing({
  state,
  busy,
  rotate,
  onToast,
}: {
  state: KinState;
  busy: boolean;
  rotate: () => void;
  onToast: (s: string) => void;
}) {
  const [origin, setOrigin] = useState(""),
    [qr, setQr] = useState(""),
    [confirm, setConfirm] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/care/${state.qrToken}`;
  useEffect(() => setQr(""), [link]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      onToast("Care-card link copied.");
    } catch {
      onToast("Select the link below and copy it to share.");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">READY FOR A WARMER HELLO</p>
          <h1>One card. A familiar connection.</h1>
          <p>Share the family-approved version with a caregiver.</p>
        </div>
      </div>
      <div className="sharing-grid">
        <section className="panel qr-panel">
          <span className="pill green">
            <Check size={13} /> Family-approved care card
          </span>
          <h2>{state.profile?.preferredName || "Your loved one"}’s KinCard</h2>
          <p>A little about the person you’re here to see.</p>
          <div className="large-qr">
            {origin && <QRImage value={link} onData={setQr} />}
          </div>
          <strong>Scan for a more familiar visit</strong>
          <p className="muted">Fictional demo · No caregiver sign-in</p>
          <button
            className="button full"
            onClick={() => window.open(link, "_blank", "noopener")}
          >
            <ExternalLink size={17} /> Open caregiver view
          </button>
          <a
            className="button secondary full"
            download="kincard-qr.png"
            href={qr || undefined}
            aria-disabled={!qr}
          >
            <Download size={17} /> Download QR code
          </a>
        </section>
        <div>
          <section className="panel sharing-details">
            <span className="section-icon">
              <QrCode size={24} />
            </span>
            <h2>A simple link to their story.</h2>
            <p>
              The QR opens the approved care card. Family drafts and pending
              suggestions stay in the family space.
            </p>
            <label htmlFor="care-link">Care-card link</label>
            <div className="copy-field">
              <input
                id="care-link"
                value={link}
                readOnly
                onFocus={(e) => e.target.select()}
              />
              <button
                className="icon-button"
                onClick={copy}
                aria-label="Copy care-card link"
              >
                <Copy size={18} />
              </button>
            </div>
            <p className="hint">
              On a phone, use the hosted demo link. A localhost QR only opens on
              the computer running the app. Hosted access may also require the
              site owner’s sign-in.
            </p>
            <div className="callout">
              <ShieldCheck size={20} />
              <p>
                <strong>Demo access, by design.</strong>
                <br />
                Anyone who can open this link can see the fictional card and
                leave a note. This is not health-data security.
              </p>
            </div>
            <hr />
            <h3>Replace this QR link</h3>
            <p>
              Create a new QR to retire the old link. Download and share the new
              code afterward.
            </p>
            {confirm ? (
              <div className="button-row">
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    rotate();
                    setConfirm(false);
                  }}
                >
                  Replace link
                </button>
                <button
                  className="button secondary"
                  onClick={() => setConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button className="text-button" onClick={() => setConfirm(true)}>
                <RefreshCw size={15} /> Generate a new link
              </button>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
export function Suggestions({
  suggestions,
  state,
  busy,
  onDecision,
}: {
  suggestions: Suggestion[];
  state: KinState;
  busy: boolean;
  onDecision: (s: Suggestion, d: "approved" | "rejected") => void;
}) {
  return (
    <div className="suggestions">
      {suggestions.length ? (
        suggestions.map((s) => (
          <article className="suggestion" key={s.id}>
            <div className="suggestion-title">
              <span className="pill peach">
                <Sparkles size={13} />
                {FIELD_LABELS[s.field]}
              </span>
              <span className={`status-${s.status}`}>
                {s.status === "pending"
                  ? "Needs your review"
                  : s.status === "approved"
                    ? "Approved"
                    : "Rejected"}
              </span>
            </div>
            <p className="suggestion-value">“{s.value}”</p>
            <p>{s.reason}</p>
            {s.uncertain && (
              <p className="uncertain">
                Uncertain observation · Please check before approving.
              </p>
            )}
            <details>
              <summary>View the original visit note</summary>
              <p>
                {state.notes.find((n) => n.id === s.noteId)?.text ||
                  "Original note unavailable."}
              </p>
            </details>
            {s.status === "pending" && (
              <div className="button-row">
                <button
                  className="button small-button"
                  disabled={busy}
                  onClick={() => onDecision(s, "approved")}
                >
                  <Check size={15} /> Approve update
                </button>
                <button
                  className="button secondary small-button"
                  disabled={busy}
                  onClick={() => onDecision(s, "rejected")}
                >
                  <X size={15} /> Reject
                </button>
              </div>
            )}
          </article>
        ))
      ) : (
        <div className="empty-state">
          <Sparkles size={30} />
          <h3>You’re all caught up.</h3>
          <p>
            Suggestions from visit notes will appear here. Nothing changes on
            the shared card until you approve it.
          </p>
        </div>
      )}
    </div>
  );
}
export function ProfileEditor({
  profile,
  state,
  busy,
  onChange,
  onStart,
  onApprove,
}: {
  profile: Profile | null;
  state: KinState;
  busy: boolean;
  onChange: (p: Profile) => void;
  onStart: () => void;
  onApprove: (p: Profile) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => setConfirmed(false), [profile]);
  if (!profile)
    return (
      <section className="panel empty-state">
        <Heart />
        <h1>Let’s create their care card.</h1>
        <p>Start with a few familiar details.</p>
        <button className="button" onClick={onStart}>
          Tell their story <ArrowRight size={16} />
        </button>
      </section>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE FAMILY HAS THE FINAL SAY</p>
          <h1>
            {state.draft
              ? "A story, ready for your review."
              : "Their story, in your words."}
          </h1>
          <p>Edit every detail before sharing it with caregivers.</p>
        </div>
        <span className="pill peach">
          <Sparkles size={13} />
          {state.aiMode === "gemini" ? "Gemini draft" : "Local demo mode"}
        </span>
      </div>
      <div className="callout ai-notice">
        <Sparkles size={20} />
        <p>{state.aiNotice}</p>
      </div>
      {state.story && (
        <details className="panel source-story">
          <summary>Compare with your original story</summary>
          <p>{state.story}</p>
        </details>
      )}
      {profile.uncertainties.length > 0 && (
        <section className="uncertainties panel">
          <h3>A few things to check</h3>
          <ul>
            {profile.uncertainties.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
          <label className="checkbox-label">
            <input
              type="checkbox"
              onChange={(e) => {
                if (e.target.checked)
                  onChange({ ...profile, uncertainties: [] });
              }}
            />{" "}
            I’ve reviewed these flags. Clear them from the draft.
          </label>
          <small>Unresolved flags remain visible on the shared card.</small>
        </section>
      )}
      <section className="panel editor-panel">
        <div className="editor-grid">
          {PROFILE_FIELDS.map((field) => (
            <div
              key={field}
              className={
                field === "fullName" || field === "preferredName" ? "" : "wide"
              }
            >
              <label htmlFor={`edit-${field}`}>{FIELD_LABELS[field]}</label>
              {field === "fullName" || field === "preferredName" ? (
                <input
                  id={`edit-${field}`}
                  value={profile[field]}
                  maxLength={160}
                  onChange={(e) =>
                    onChange({ ...profile, [field]: e.target.value })
                  }
                />
              ) : (
                <textarea
                  id={`edit-${field}`}
                  rows={3}
                  maxLength={4000}
                  value={profile[field]}
                  placeholder="Not shared yet"
                  onChange={(e) =>
                    onChange({ ...profile, [field]: e.target.value })
                  }
                />
              )}{" "}
              {field === "health" && (
                <small className="hint">
                  Family reports only. Medication doses and treatment directions
                  cannot be published through this demo.
                </small>
              )}
            </div>
          ))}
        </div>
        <div className="approval-box">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I have reviewed this fictional profile and approve sharing these
              details.
            </span>
          </label>
          <button
            className="button"
            disabled={busy || !confirmed || !profile.preferredName.trim()}
            onClick={() => onApprove(profile)}
          >
            {busy ? (
              <span className="spinner small" />
            ) : (
              <CheckCircle2 size={18} />
            )}{" "}
            Approve & publish care card
          </button>
          <small>Only your approved version appears at the QR link.</small>
        </div>
      </section>
    </>
  );
}
