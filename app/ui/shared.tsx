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
import type { CareTranslation } from "../../lib/care-language";

export type AuthUser = {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
};

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
        <strong>Multi-Tenant Workspace</strong>
        {compact
          ? " · Powered by Auth0 SDK v4"
          : " · Multi-tenant account isolation with Databricks analytics backend."}
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
  labels = FIELD_LABELS,
  emptyText = "Not shared yet.",
  healthNotice = "Family-reported · Not clinically verified. This is not a treatment plan.",
}: {
  profile: Profile;
  compact?: boolean;
  labels?: Record<ProfileField, string>;
  emptyText?: string;
  healthNotice?: string;
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
              <h3>{labels[field]}</h3>
              <p>{profile[field] || emptyText}</p>
              {field === "health" && !compact && <small>{healthNotice}</small>}
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
export type AiStatus = {
  configured: boolean;
  model: string;
  mode: "gemini" | "mock";
  issue?: string;
  storage?: "databricks" | "local";
};
export type AiCheck = {
  ok: true;
  mode: "gemini";
  model: string;
  notice: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function api(
  path: "/api/ai/status",
  body?: undefined,
  signal?: AbortSignal,
): Promise<AiStatus>;
export function api(
  path: "/api/ai/check",
  body: Record<string, never>,
  signal?: AbortSignal,
): Promise<AiCheck>;
export function api(
  path: `/api/care/${string}/translate`,
  body: unknown,
  signal?: AbortSignal,
): Promise<CareTranslation>;
export function api(
  path: "/api/state",
  body?: undefined,
  signal?: AbortSignal,
): Promise<KinState>;
export function api(
  path: "/api/auth/me",
  body?: undefined,
  signal?: AbortSignal,
): Promise<{ user: AuthUser | null }>;
export function api(path: `/api/care/${string}`): Promise<CareResponse>;
export function api(
  path: "/api/generate",
  body: unknown,
): Promise<GenerationResponse>;
export function api(
  path: `/api/care/${string}/notes`,
  body: unknown,
  signal?: AbortSignal,
): Promise<NoteResponse>;
export function api(path: string, body?: unknown, signal?: AbortSignal): Promise<StateResponse>;
export async function api(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(
      "KinCard could not be reached. Keep the server running and try again.",
      0,
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(
      "KinCard did not return a readable response. Please try again.",
      response.ok ? 502 : response.status,
    );
  }
  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Something went wrong. Please try again.";
    throw new ApiError(message, response.status);
  }
  return data;
}