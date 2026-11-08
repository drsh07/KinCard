"use client";
import {
  Heart,
  Sprout,
  MessageCircle,
  ShieldCheck,
  Clock3,
  HandHeart,
  Ear,
  NotebookPen,
} from "lucide-react";
import type {
  AiMode,
  KinState,
  Profile,
  ProfileField,
  Suggestion,
  VisitNote,
} from "../../lib/domain";
import { FIELD_LABELS } from "../../lib/domain";
export function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark">
        <Heart size={21} strokeWidth={1.8} />
        <Sprout size={15} />
      </span>
      KinCard<span className="logo-dot">.</span>
    </span>
  );
}
export function DemoNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "demo-notice compact" : "demo-notice"}>
      <span className="demo-dot" />
      <span>
        <strong>Fictional demo</strong>
        {compact
          ? " · No real patient data"
          : " · Simplified login and QR access. Not suitable for real patient data."}
      </span>
    </div>
  );
}
export function Avatar({
  name = "Maggie",
  large = false,
}: {
  name?: string;
  large?: boolean;
}) {
  return (
    <div
      className={large ? "avatar large" : "avatar"}
      aria-label={`${name}'s initials`}
    >
      <span>
        {(name.trim() || "?")
          .split(/\s+/)
          .slice(0, 2)
          .map((x) => x[0])
          .join("")}
      </span>
      <Sprout size={large ? 27 : 16} />
    </div>
  );
}
const icons = {
  biography: Sprout,
  conversation: MessageCircle,
  comfort: Heart,
  avoid: HandHeart,
  routine: Clock3,
  communication: Ear,
  health: ShieldCheck,
  extra: NotebookPen,
};
export function CareSections({
  profile,
  compact = false,
}: {
  profile: Profile;
  compact?: boolean;
}) {
  const fields: (keyof typeof icons)[] = compact
    ? ["conversation", "comfort", "avoid"]
    : [
        "biography",
        "conversation",
        "comfort",
        "avoid",
        "routine",
        "communication",
        "health",
        "extra",
      ];
  return (
    <div
      className={compact ? "care-sections preview-sections" : "care-sections"}
    >
      {fields.map((field) => {
        const Icon = icons[field];
        return (
          <section className={`care-section field-${field}`} key={field}>
            <div className="section-icon">
              <Icon size={19} />
            </div>
            <div>
              <h3>{FIELD_LABELS[field]}</h3>
              <p>{profile[field] || "Not shared yet."}</p>
              {field === "health" && !compact && (
                <small>
                  Family-reported · Not clinically verified. This is not a
                  treatment plan.
                </small>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
export function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
type CareResponse = {
  profile: Profile | null;
  updatedAt: string;
  revision: number;
};
type StateResponse = { state: KinState };
type GenerationResponse = StateResponse & {
  profile: Profile;
  notice: string;
  mode: AiMode;
};
type NoteResponse = {
  note: VisitNote;
  suggestion: Suggestion | null;
  mode: AiMode;
  notice: string;
};
export function api(path: "/api/state"): Promise<KinState>;
export function api(path: `/api/care/${string}`): Promise<CareResponse>;
export function api(
  path: "/api/generate",
  body: unknown,
): Promise<GenerationResponse>;
export function api(
  path: `/api/care/${string}/notes`,
  body: unknown,
): Promise<NoteResponse>;
export function api(
  path: "/api/login" | "/api/logout",
  body: unknown,
): Promise<{ ok: boolean; demoOnly?: boolean }>;
export function api(path: string, body: unknown): Promise<StateResponse>;
export async function api(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data: unknown = await response
    .json()
    .catch(() => ({
      error: "Please try again. The server did not return a response.",
    }));
  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Something went wrong. Please try again.";
    throw new Error(message);
  }
  return data;
}
