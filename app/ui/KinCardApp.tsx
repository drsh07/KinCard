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
import { Onboarding } from "./Onboarding";
import {
  api,
  ApiError,
  Avatar,
  CareSections,
  DemoNotice,
  formatDate,
  Logo,
  type AuthUser,
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
  const [state, setState] = useState<KinState | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [help, setHelp] = useState(false);
  const [editProfile, setEditProfile] = useState<Profile | null>(null);
  const [editRevision, setEditRevision] = useState<number | null>(null);

  const refreshRequest = useRef(0);
  const refreshController = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const request = ++refreshRequest.current;
    refreshController.current?.abort();
    const abort = new AbortController();
    refreshController.current = abort;
    try {
      const [stateData, authData] = await Promise.all([
        api("/api/state", undefined, abort.signal),
        api("/api/auth/me", undefined, abort.signal).catch(() => ({ user: null })),
      ]);
      if (refreshRequest.current === request && !abort.signal.aborted) {
        setState(stateData);
        setUser(authData.user);
        setError("");
      }
    } catch (e) {
      if (refreshRequest.current === request && !abort.signal.aborted) {
        if (e instanceof ApiError && e.status === 401) {
          setState(null);
          setUser(null);
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

  if (!state || (state as any).unauthenticated) return <Login />;
  // A new account has no card yet: set up the patient first, then the dashboard.
  if (!state.profile)
    return (
      <Onboarding
        state={state}
        userName={user?.name}
        onDone={async () => {
          await refresh();
          setView("overview");
          window.scrollTo({ top: 0 });
        }}
      />
    );
  const pending = (state.suggestions || []).filter((x) => x.status === "pending");
  const profile = state.profile;
  const name = profile?.preferredName || "your loved one";

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
            <HelpCircle size={19} /> How KinCard works
          </button>
          <div className="family-user">
            {user?.picture ? (
              <img src={user.picture} alt={user.name || "User"} className="w-8 h-8 rounded-full" />
            ) : (
              <span className="user-avatar">{user?.name ? user.name[0] : "F"}</span>
            )}
            <div>
              <strong>{user?.name || "Family Member"}</strong>
              <small>{user?.email || "Auth0 Account"}</small>
            </div>
            <a
              className="icon-button flex items-center justify-center"
              aria-label="Sign out"
              href="/auth/logout"
            >
              <LogOut size={18} />
            </a>
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
            Your family space
          </span>
          <button
            className="icon-button"
            aria-label="Refresh dashboard"
            onClick={() => act(refresh)}
          >
            <RefreshCw size={17} />
          </button>
          <a
            className="mobile-signout icon-button flex items-center justify-center"
            aria-label="Sign out"
            href="/auth/logout"
          >
            <LogOut size={17} />
          </a>
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
                    Welcome back, {user?.name?.split(" ")[0] || "Family"}<span className="terracotta">.</span>
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
                    <small>Anyone with the link can view</small>
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
                            Your care card is ready. Try adding a caregiver visit note.
                          </p>
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
                      Open the care card and leave a visit note to try the full review flow.
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
            <span>Made for familiar moments.</span>
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
            aria-label="App guide"
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
            <h2>KinCard Guide</h2>
            <ol>
              <li>
                Use <strong>Family speaks</strong> to tell one story in the text
                box or microphone.
              </li>
              <li>
                Select <strong>Review privacy</strong>, edit and confirm the
                screened text, then let Gemini organize a draft.
              </li>
              <li>
                Open <strong>QR sharing</strong> to try the caregiver view and translate card details.
              </li>
              <li>
                Leave a visit note, then return to approve or reject a suggested update.
              </li>
            </ol>
            <button className="button full" onClick={() => setHelp(false)}>
              Got it <Check size={17} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function Login() {
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
            <span className="sample-label">KINCARD PROFILE</span>
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
          <p>Sign in with Auth0 to access your family care space.</p>

          <a
            href="/auth/login"
            className="flex items-center justify-center gap-3 w-full py-4 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition shadow-sm my-6 text-center cursor-pointer decoration-0"
            style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" style={{ width: "20px", height: "20px", marginRight: "10px" }}>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Auth0 (Google / Email)
          </a>

          <DemoNotice />
        </div>
        <div className="login-form-footer">
          <ShieldCheck size={16} /> Official Auth0 SDK v4 Multi-tenant architecture.
        </div>
      </section>
    </main>
  );
}