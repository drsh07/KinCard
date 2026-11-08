"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Heart,
  Home,
  LogOut,
  Mic,
  NotebookPen,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sprout,
  Users,
  X,
  HelpCircle,
  CheckCircle2,
  MessageCircle,
} from "lucide-react";
import type { KinState, Profile, Suggestion } from "../../lib/domain";
import {
  api,
  ApiError,
  Avatar,
  CareSections,
  DemoNotice,
  formatDate,
  Logo,
} from "./shared";
import {
  Interview,
  ProfileEditor,
  Sharing,
  Suggestions,
  QRImage,
} from "./flows";
type View = "overview" | "profile" | "interview" | "journal" | "sharing";
export default function KinCardApp() {
  const [state, setState] = useState<KinState | null>(null),
    [loading, setLoading] = useState(true),
    [view, setView] = useState<View>("overview"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(""),
    [help, setHelp] = useState(false),
    [editProfile, setEditProfile] = useState<Profile | null>(null),
    [editRevision, setEditRevision] = useState<number | null>(null);
  const refreshRequest = useRef(0);
  const refreshController = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    const request = ++refreshRequest.current;
    refreshController.current?.abort();
    const abort = new AbortController();
    refreshController.current = abort;
    try {
      const data = await api("/api/state", undefined, abort.signal);
      if (refreshRequest.current === request && !abort.signal.aborted) {
        setState(data);
        setError("");
      }
    } catch (e) {
      if (refreshRequest.current === request && !abort.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) {
          setState(null);
          setError("");
          setEditProfile(null);
          setEditRevision(null);
        } else setError((e as Error).message);
      }
    } finally {
      if (refreshRequest.current === request) {
        setLoading(false);
        refreshController.current = null;
      }
    }
  }, []);
  useEffect(() => {
    refresh();
    return () => {
      refreshRequest.current++;
      refreshController.current?.abort();
    };
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!state) return;
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [!!state, refresh]);
  async function act(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: View) {
    setError("");
    setView(next);
    if (next === "profile") {
      setEditProfile(state?.draft || state?.profile || null);
      setEditRevision(state?.revision ?? null);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (loading)
    return (
      <main className="loading-screen">
        <Logo />
        <span className="spinner" />
        <p>Making room for familiar moments…</p>
      </main>
    );
  if (!state && error)
    return (
      <main className="loading-screen">
        <Logo />
        <p role="alert">{error}</p>
        <button className="button secondary" onClick={refresh}>
          <RefreshCw size={16} />
          Try again
        </button>
      </main>
    );
  if (!state) return <Login onLogin={refresh} />;
  const pending = state.suggestions.filter((x) => x.status === "pending"),
    profile = state.profile,
    name = profile?.preferredName || "your loved one";
  const nav = [
    { id: "overview", label: "Overview", Icon: Home },
    { id: "profile", label: "Care profile", Icon: Heart },
    { id: "interview", label: "Family speaks", Icon: Mic },
    { id: "journal", label: "Visit journal", Icon: NotebookPen },
    { id: "sharing", label: "QR sharing", Icon: QrCode },
  ] as const;
  async function decide(
    suggestion: Suggestion,
    decision: "approved" | "rejected",
  ) {
    await act(async () => {
      const data = await api(`/api/suggestions/${suggestion.id}`, {
        decision,
        revision: state!.revision,
      });
      setState(data.state);
      setToast(
        decision === "approved"
          ? "Update approved. The care card is up to date."
          : "Suggestion rejected. The care card is unchanged.",
      );
    });
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="/" aria-label="KinCard home">
          <Logo />
        </a>
        <div className="workspace-label">YOUR FAMILY SPACE</div>
        <nav>
          {nav.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={view === id ? "nav-item active" : "nav-item"}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "journal" && pending.length > 0 && (
                <b className="nav-count">{pending.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="gentle-note">
            <Sprout size={24} />
            <p>
              Little details.
              <br />
              <strong>More meaningful care.</strong>
            </p>
          </div>
          <button className="nav-item" onClick={() => setHelp(true)}>
            <HelpCircle size={19} /> Demo guide
          </button>
          <div className="family-user">
            <span className="user-avatar">S</span>
            <div>
              <strong>Sarah Morgan</strong>
              <small>Demo family member</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() =>
                act(async () => {
                  await api("/api/logout", {});
                  setState(null);
                  setView("overview");
                  setEditProfile(null);
                  setEditRevision(null);
                })
              }
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumbs">
            Family space <ChevronRight size={14} />
            <strong>{nav.find((x) => x.id === view)?.label}</strong>
          </span>
          <span className="workspace-badge">
            <span />
            Demo workspace
          </span>
          <button
            className="icon-button"
            aria-label="Refresh dashboard"
            onClick={() => act(refresh)}
          >
            <RefreshCw size={17} />
          </button>
          <button
            className="mobile-signout icon-button"
            aria-label="Sign out"
            onClick={() =>
              act(async () => {
                await api("/api/logout", {});
                setState(null);
                setView("overview");
                setEditProfile(null);
                setEditRevision(null);
              })
            }
          >
            <LogOut size={17} />
          </button>
        </header>
        <main className="main-content">
          <DemoNotice />
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={17} />
              </button>
            </div>
          )}
          {view === "overview" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    A LITTLE FAMILIARITY GOES A LONG WAY
                  </p>
                  <h1>
                    Welcome back, Sarah<span className="terracotta">.</span>
                  </h1>
                  <p>Keeping {name}’s story at the heart of every visit.</p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => navigate("interview")}
                >
                  <Mic size={17} /> Tell their story
                </button>
              </div>
              <section className="welcome-card">
                <div>
                  <span className="pill light">
                    <Heart size={13} /> Person first. Always.
                  </span>
                  <h2>
                    Good care starts with
                    <br />
                    knowing <em>the person.</em>
                  </h2>
                  <p>
                    The little things you share help every caregiver
                    <br className="desktop-break" /> make a more meaningful
                    connection.
                  </p>
                  <button
                    className="button"
                    onClick={() =>
                      window.open(
                        `/care/${state.qrToken}`,
                        "_blank",
                        "noopener",
                      )
                    }
                  >
                    View {name}’s care card
                    <ArrowRight size={17} />
                  </button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="art-orbit" />
                  <div className="art-card">
                    <Sprout size={25} />
                    <span className="art-heart">
                      <Heart size={37} />
                    </span>
                    <i />
                    <i />
                    <i />
                    <p>
                      a little more <em>familiar</em>
                    </p>
                  </div>
                  <span className="art-bloom bloom-one">✳</span>
                  <span className="art-bloom bloom-two">✳</span>
                </div>
              </section>
              <div className="stats-grid">
                <div className="stat">
                  <span className="stat-icon green">
                    <ShieldCheck size={21} />
                  </span>
                  <div>
                    <small>Care card</small>
                    <strong>
                      {profile ? "Family approved" : "Waiting for review"}
                    </strong>
                  </div>
                  <CheckCircle2 className="stat-check" size={17} />
                </div>
                <button className="stat" onClick={() => navigate("journal")}>
                  <span className="stat-icon peach">
                    <Sparkles size={21} />
                  </span>
                  <div>
                    <small>Suggested updates</small>
                    <strong>{pending.length} to review</strong>
                  </div>
                  <ChevronRight size={17} />
                </button>
                <button className="stat" onClick={() => navigate("journal")}>
                  <span className="stat-icon lavender">
                    <NotebookPen size={21} />
                  </span>
                  <div>
                    <small>Visit journal</small>
                    <strong>
                      {state.notes.length}{" "}
                      {state.notes.length === 1
                        ? "shared moment"
                        : "shared moments"}
                    </strong>
                  </div>
                  <ChevronRight size={17} />
                </button>
              </div>
              <div className="dashboard-grid">
                <section className="panel profile-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">THE PERSON BEHIND THE CARE</p>
                      <h2>{name}’s KinCard</h2>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("profile")}
                    >
                      <Pencil size={14} /> Edit profile
                    </button>
                  </div>
                  {profile ? (
                    <>
                      <div className="profile-intro">
                        <Avatar name={name} />
                        <div>
                          <h3>{name}</h3>
                          <p>{profile.fullName}</p>
                          <span className="approved-label">
                            <Check size={12} /> Shared by family
                          </span>
                        </div>
                        <span className="fictional-tag">Fictional person</span>
                      </div>
                      <p className="biography">
                        {profile.biography ||
                          "Their story is ready to be shared."}
                      </p>
                      <CareSections profile={profile} compact />
                      <button
                        className="panel-footer"
                        onClick={() =>
                          window.open(
                            `/care/${state.qrToken}`,
                            "_blank",
                            "noopener",
                          )
                        }
                      >
                        See the full care card <ArrowRight size={16} />
                      </button>
                    </>
                  ) : (
                    <div className="empty-state">
                      <Heart />
                      <h3>Every story starts somewhere.</h3>
                      <p>Tell us about your loved one to create a care card.</p>
                      <button
                        className="button"
                        onClick={() => navigate("interview")}
                      >
                        Start their story
                      </button>
                    </div>
                  )}
                </section>
                <div className="dashboard-right">
                  <section className="panel share-panel">
                    <span className="section-icon">
                      <QrCode size={22} />
                    </span>
                    <h3>
                      A warmer hello,
                      <br />
                      one scan away.
                    </h3>
                    <p>
                      A simple card for the people
                      <br />
                      who spend time with {name}.
                    </p>
                    <div className="mini-qr">
                      <QRImage
                        value={`${typeof window !== "undefined" ? window.location.origin : ""}/care/${state.qrToken}`}
                      />
                    </div>
                    <button
                      className="button secondary full"
                      onClick={() => navigate("sharing")}
                    >
                      Share their KinCard <ArrowRight size={16} />
                    </button>
                    <small>Demo access · Anyone with the link</small>
                  </section>
                  <section className="panel activity-panel">
                    <h3>
                      Latest moments <span className="small-dot" />
                    </h3>
                    {state.notes.length ? (
                      state.notes.slice(0, 2).map((note) => (
                        <div className="activity-item" key={note.id}>
                          <span className="activity-icon">
                            <MessageCircle size={15} />
                          </span>
                          <div>
                            <strong>{note.author} shared a visit</strong>
                            <p>
                              {note.text.slice(0, 95)}
                              {note.text.length > 95 ? "…" : ""}
                            </p>
                            <small>{formatDate(note.createdAt)}</small>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="activity-item">
                        <span className="activity-icon">
                          <Check size={15} />
                        </span>
                        <div>
                          <strong>A little story, ready to share</strong>
                          <p>
                            Your fictional sample card is ready. Try adding a
                            caregiver visit note.
                          </p>
                          <small>Ready for your demo</small>
                        </div>
                      </div>
                    )}
                    <button
                      className="text-button"
                      onClick={() => navigate("journal")}
                    >
                      Visit journal <ArrowRight size={14} />
                    </button>
                  </section>
                </div>
              </div>
              {pending.length > 0 && (
                <section className="panel updates-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">FAMILY HAS THE FINAL SAY</p>
                      <h2>A new detail to consider</h2>
                    </div>
                    <span className="pill peach">{pending.length} pending</span>
                  </div>
                  <Suggestions
                    suggestions={pending.slice(0, 2)}
                    state={state}
                    busy={busy}
                    onDecision={decide}
                  />
                </section>
              )}
            </>
          )}
          {view === "interview" && (
            <Interview
              state={state}
              busy={busy}
              act={act}
              onState={setState}
              onGenerated={(p, revision) => {
                setEditProfile(p);
                setEditRevision(revision);
                setView("profile");
              }}
            />
          )}
          {view === "profile" && (
            <ProfileEditor
              profile={editProfile || state.draft || profile}
              state={state}
              busy={busy}
              onChange={setEditProfile}
              onStart={() => navigate("interview")}
              stale={editRevision !== null && editRevision !== state.revision}
              onReload={() => {
                setEditProfile(state.draft || state.profile);
                setEditRevision(state.revision);
              }}
              onApprove={(p) =>
                act(async () => {
                  const data = await api("/api/approve-profile", {
                    profile: p,
                    revision: editRevision ?? state.revision,
                  });
                  setState(data.state);
                  setEditProfile(data.state.profile);
                  setEditRevision(data.state.revision);
                  setToast(
                    "Family approved. The shared care card has been updated.",
                  );
                  setView("overview");
                })
              }
            />
          )}
          {view === "journal" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    SMALL OBSERVATIONS, SHARED WITH CARE
                  </p>
                  <h1>Visit journal</h1>
                  <p>Caregivers share. You decide what belongs on the card.</p>
                </div>
                <button
                  className="button secondary"
                  onClick={() =>
                    window.open(
                      `/care/${state.qrToken}#visit-note`,
                      "_blank",
                      "noopener",
                    )
                  }
                >
                  <Plus size={17} /> Try a visit note
                </button>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Suggested profile updates</h2>
                  <span className="pill peach">{pending.length} to review</span>
                </div>
                <Suggestions
                  suggestions={state.suggestions}
                  state={state}
                  busy={busy}
                  onDecision={decide}
                />
              </section>
              <section className="panel journal-panel">
                <div className="panel-heading">
                  <h2>Notes from visits</h2>
                  <NotebookPen size={20} />
                </div>
                {state.notes.length ? (
                  state.notes.map((note) => (
                    <article className="visit-entry" key={note.id}>
                      <span className="user-avatar">{note.author[0]}</span>
                      <div>
                        <h3>{note.author}</h3>
                        <small>{formatDate(note.createdAt)}</small>
                        <p>{note.text}</p>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="empty-state">
                    <NotebookPen size={30} />
                    <h3>A place for the little moments.</h3>
                    <p>
                      Open the care card and leave a fictional visit note to try
                      the full review flow.
                    </p>
                  </div>
                )}
              </section>
            </>
          )}
          {view === "sharing" && (
            <Sharing
              state={state}
              busy={busy}
              onToast={setToast}
              rotate={() =>
                act(async () => {
                  const data = await api("/api/qr", {
                    revision: state.revision,
                  });
                  setState(data.state);
                  setToast(
                    "New QR link created. The previous link no longer works.",
                  );
                })
              }
            />
          )}
          <footer className="main-footer">
            <Logo />
            <span>
              Made for familiar moments.
              <span className="footer-demo"> Fictional hackathon demo.</span>
            </span>
            <Heart size={14} />
          </footer>
        </main>
      </div>
      <nav className="mobile-nav">
        {nav.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={view === id ? "active" : ""}
            onClick={() => navigate(id)}
            aria-label={label}
          >
            <Icon size={20} />
            <span>
              {id === "interview"
                ? "Family speaks"
                : id === "sharing"
                  ? "Share"
                  : id === "profile"
                    ? "Profile"
                    : id === "journal"
                      ? "Journal"
                      : "Home"}
            </span>
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal panel"
            role="dialog"
            aria-modal="true"
            aria-label="Demo guide"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              aria-label="Close guide"
              onClick={() => setHelp(false)}
            >
              <X />
            </button>
            <Sprout size={30} />
            <h2>Your KinCard demo</h2>
            <ol>
              <li>
                Use <strong>Family speaks</strong> to tell one story in the text
                box or microphone. The questions are a guide, not separate
                answers.
              </li>
              <li>
                Select <strong>Review privacy</strong>, edit and confirm the
                screened text, then let Gemini organize a draft. Review and
                approve the profile before sharing it.
              </li>
              <li>
                Open <strong>QR sharing</strong> to try the caregiver view.
                Choose a language and select <strong>Translate card</strong> to
                translate the card with Gemini.
              </li>
              <li>
                Leave a visit note, then return here to approve or reject a
                suggested update.
              </li>
            </ol>
            <p>
              The demo login is <strong>family / KinCard2026!</strong>. Use
              fictional information only. Speech availability depends on your
              browser; typing always works.
            </p>
            <button className="button full" onClick={() => setHelp(false)}>
              Got it <Check size={17} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [username, setUsername] = useState("family"),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <section className="login-story">
        <Logo />
        <div className="login-story-content">
          <span className="pill light">
            <Sprout size={14} /> A little familiarity. A better visit.
          </span>
          <h1>
            The person
            <br />
            behind <em>the care.</em>
          </h1>
          <p>
            The stories, routines, and little things that help
            <br className="desktop-break" /> every caregiver make a meaningful
            connection.
          </p>
          <div className="login-preview">
            <Avatar name="Maggie" large />
            <div>
              <span className="eyebrow">HELLO, I’M</span>
              <h2>
                Maggie<span>✳</span>
              </h2>
              <p>Teacher. Gardener. Biscuit’s favourite person.</p>
              <div className="preview-quote">
                <Heart size={17} />
                <span>
                  “A quiet room and a familiar song
                  <br />
                  help me feel right at home.”
                </span>
              </div>
            </div>
            <span className="sample-label">FICTIONAL SAMPLE KINCARD</span>
          </div>
        </div>
        <p className="login-bottom">
          Little details. More meaningful care. <Heart size={15} />
        </p>
      </section>
      <section className="login-form-side">
        <div className="login-form-wrap">
          <span className="pill peach">
            <Users size={14} /> Family space
          </span>
          <h2>
            Welcome to KinCard<span className="terracotta">.</span>
          </h2>
          <p>A familiar place to share their story.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api("/api/login", { username, password });
                await onLogin();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label htmlFor="username">Username</label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter the demo password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
            <button className="button full" disabled={busy}>
              {busy ? (
                <span className="spinner small" />
              ) : (
                "Sign in to family space"
              )}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="demo-credentials">
            <span className="section-icon">
              <Sparkles size={17} />
            </span>
            <div>
              <strong>Come in and try the demo</strong>
              <p>
                Username: <code>family</code>
                <br />
                Password: <code>KinCard2026!</code>
              </p>
              <button
                className="text-button"
                onClick={() => {
                  setUsername("family");
                  setPassword("KinCard2026!");
                }}
              >
                Fill demo credentials <ArrowRight size={13} />
              </button>
            </div>
          </div>
          <div className="registration-demo">
            <button disabled>Create account · demo only</button>
            <span> · </span>
            <button disabled>Forgot password · demo only</button>
          </div>
          <DemoNotice />
        </div>
        <div className="login-form-footer">
          <ShieldCheck size={16} /> A hackathon prototype, made with care.
        </div>
      </section>
    </main>
  );
}
