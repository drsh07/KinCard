// app/api/[...path]/route.ts
import {
  requirePrivacyReviewed,
  screenProfile,
  screenText,
} from "../../../lib/privacy.ts";
import {
  generateProfile,
  generateSuggestion,
  getAiStatus,
  checkGeminiConnection,
} from "../../../lib/ai.ts";
import { generateNarrative, parseStory } from "../../../lib/narrative.ts";
import type {
  KinState,
  Profile,
  ProfileField,
  Suggestion,
  VisitNote,
} from "../../../lib/domain.ts";
import {
  bindings,
  loadState,
  saveState,
  storageMode,
} from "../../../lib/store.ts";
import { approveProfile, decideSuggestion } from "../../../lib/transitions.ts";
import {
  cardMemory,
  changedFields,
  mergeNotice,
  mergeProfile,
  withHistory,
} from "../../../lib/memory.ts";
import { blendNotice, blendSections } from "../../../lib/blend.ts";
import { logEvents } from "../../../lib/events.ts";
import { aiPrivacyScreen } from "../../../lib/privacy-ai.ts";
import { transcribeAudio } from "../../../lib/transcribe.ts";
import type { CareEvent } from "../../../lib/events.ts";
import {
  InputError,
  parseAnswers,
  parseProfile,
  record,
  requireRevision,
  text,
} from "../../../lib/validation.ts";

function addedText(before: Profile | null, after: Profile, field: ProfileField) {
  const old = before?.[field] || "";
  const now = after[field];
  if (!now) return null;
  return old && now.startsWith(old) ? now.slice(old.length).trim() || null : now;
}

export const dynamic = "force-dynamic";

function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function parseCookies(headers: Headers): Record<string, string> {
  const cookieHeader = headers.get("cookie") || "";
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, decodeURIComponent(v.join("="))];
    }),
  );
}

async function getAuth0User(
  request: Request,
): Promise<{ sub: string; name?: string; email?: string; picture?: string } | null> {
  const cookies = parseCookies(request.headers);
  const sessionCookie = cookies["kincard_session"];

  if (sessionCookie && sessionCookie.trim() !== "") {
    try {
      const raw = Buffer.from(sessionCookie, "base64").toString("utf8");
      const user = JSON.parse(raw);
      if (user && user.sub) {
        return {
          sub: user.sub,
          name: user.name || user.nickname || user.given_name || user.email,
          email: user.email,
          picture: user.picture,
        };
      }
    } catch (e) {
      console.error("Failed to parse session cookie:", e);
    }
  }

  return null;
}

async function body(
  request: Request,
  max = 150000,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new InputError("Please send JSON.", 415);
  if (Number(request.headers.get("content-length")) > max)
    throw new InputError("This request is too large.", 413);
  const raw = await request.text();
  if (raw.length > max) throw new InputError("This request is too large.", 413);
  try {
    return record(JSON.parse(raw));
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("This request contains invalid JSON.");
  }
}

function interview(source: Record<string, unknown>) {
  if (typeof source.terms !== "boolean")
    throw new InputError(
      "The optional demo terms choice must be true or false.",
    );
  return {
    answers: Object.fromEntries(
      Object.entries(parseAnswers(source.answers)).map(([field, value]) => [
        field,
        requirePrivacyReviewed(value, source.privacyReviewed),
      ]),
    ) as ReturnType<typeof parseAnswers>,
    relationship: text(
      screenText(text(source.relationship, "Relationship", 80, true)).text,
      "Relationship",
      80,
      true,
    ),
    terms: source.terms,
  };
}

function narrativeInput(source: Record<string, unknown>, required = false) {
  if (typeof source.terms !== "boolean")
    throw new InputError(
      "The optional demo terms choice must be true or false.",
    );
  return {
    story: requirePrivacyReviewed(
      parseStory(source.story, required),
      source.privacyReviewed,
    ),
    relationship: text(
      screenText(text(source.relationship, "Relationship", 80, true)).text,
      "Relationship",
      80,
      true,
    ),
    terms: source.terms,
  };
}

function assertToken(state: KinState, token: string) {
  if (state.qrToken !== token)
    throw new InputError(
      "This care-card link is no longer active. Ask the family for their latest QR code.",
      404,
    );
  if (!state.profile)
    throw new InputError("The family has not approved a care card yet.", 404);
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const parts = route.split("/");
  const envVars = bindings();

  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin)
      throw new InputError("Please use KinCard from its own browser tab.", 403);
  }

  // Auth0 Session Status Check
  if (request.method === "GET" && route === "auth/me") {
    const user = await getAuth0User(request);
    return json({ user });
  }

  // State route: gracefully returns unauthenticated status if not logged in
  if (request.method === "GET" && route === "state") {
    const user = await getAuth0User(request);
    if (!user) {
      return json({ unauthenticated: true, profile: null, draft: null });
    }
    return json(await loadState(user.sub));
  }

  // Public Visitor QR Care View (Unauthenticated)
  if (parts[0] === "care") {
    const state = await loadState("demo");
    assertToken(state, parts[1] || "");
    if (request.method === "GET" && parts.length === 2)
      return json({
        profile: state.profile,
        updatedAt: state.profileUpdatedAt || state.updatedAt,
        revision: state.revision,
      });

    if (
      request.method === "POST" &&
      parts.length === 3 &&
      parts[2] === "notes"
    ) {
      const input = await body(request);
      const screened = await aiPrivacyScreen(
        text(input.text, "Visit note", 4000, true),
        [
          state.profile?.preferredName || "",
          ...(state.profile?.fullName || "").split(/\s+/),
        ],
        { key: envVars.GEMINI_API_KEY, model: envVars.GEMINI_MODEL },
      );
      const note: VisitNote = {
        id: crypto.randomUUID(),
        author: text(
          screenText(text(input.author, "Visitor name", 80, true)).text,
          "Visitor name",
          80,
          true,
        ),
        text: text(screened.text, "Visit note", 4000, true),
        createdAt: new Date().toISOString(),
      };
      if (state.notes.length >= 300)
        throw new InputError("The visit-note limit has been reached.", 409);

      const result = await generateSuggestion(note.text, {
        key: envVars.GEMINI_API_KEY,
        model: envVars.GEMINI_MODEL,
      });
      const safeSuggestion = text(
        screenText(result.value).text,
        "Screened suggestion",
        4000,
      );
      const suggestion: Suggestion | null = safeSuggestion
        ? {
            id: crypto.randomUUID(),
            noteId: note.id,
            field: result.field,
            value: safeSuggestion,
            reason:
              "Visitor-reported observation, not an established fact. Confirm with the family before adding it.",
            uncertain: true,
            status: "pending",
            createdAt: note.createdAt,
            baseValue: state.profile![result.field],
          }
        : null;

      await saveState(
        {
          ...state,
          notes: [note, ...state.notes],
          suggestions: suggestion
            ? [suggestion, ...state.suggestions]
            : state.suggestions,
        },
        state.revision,
        "demo",
      );
      await logEvents(envVars, [
        {
          type: "visitor_note",
          field: suggestion?.field ?? null,
          note: note.text,
        },
      ]);
      return json(
        { note, suggestion, mode: result.mode, notice: result.notice },
        201,
      );
    }

    if (
      request.method === "POST" &&
      parts.length === 3 &&
      parts[2] === "transcribe"
    ) {
      const input = await body(request, 6_000_000);
      return json({
        text: await transcribeAudio(input.audio, {
          key: envVars.GEMINI_API_KEY,
          model: envVars.GEMINI_MODEL,
        }),
      });
    }
    throw new InputError("This care-card action was not found.", 404);
  }

  // Require Auth0 session for remaining workspace routes
  const user = await getAuth0User(request);
  if (!user) {
    throw new InputError(
      "Please sign in with Auth0 to access your family space.",
      401,
    );
  }
  const userId = user.sub;

  if (request.method === "GET" && route === "ai/status")
    return json({
      ...getAiStatus({
        key: envVars.GEMINI_API_KEY,
        model: envVars.GEMINI_MODEL,
      }),
      storage: storageMode(),
    });

  if (request.method === "POST" && route === "ai/check") {
    const input = await body(request);
    if (Object.keys(input).length)
      throw new InputError(
        "The connection check does not accept story text or API keys.",
      );
    return json(
      await checkGeminiConnection({
        key: envVars.GEMINI_API_KEY,
        model: envVars.GEMINI_MODEL,
      }),
    );
  }

  if (request.method === "POST" && route === "transcribe") {
    const input = await body(request, 6_000_000);
    return json({
      text: await transcribeAudio(input.audio, {
        key: envVars.GEMINI_API_KEY,
        model: envVars.GEMINI_MODEL,
      }),
    });
  }

  if (request.method === "POST" && route === "privacy-review") {
    const input = await body(request);
    const current = await loadState(userId);
    const card = current.draft || current.profile;
    return json(
      await aiPrivacyScreen(
        text(input.text, "Story", 12000, true),
        [card?.preferredName || "", ...(card?.fullName || "").split(/\s+/)],
        { key: envVars.GEMINI_API_KEY, model: envVars.GEMINI_MODEL },
      ),
    );
  }

  if (request.method !== "POST")
    throw new InputError("This action was not found.", 404);

  const input = await body(request);
  const state = await loadState(userId);
  requireRevision(input, state.revision);

  if (route === "interview") {
    const submitted =
      "story" in input
        ? narrativeInput(input)
        : { ...interview(input), story: undefined };
    const next = { ...state, ...submitted, draft: null };
    return json({ state: await saveState(next, state.revision, userId) });
  }

  if (route === "generate") {
    const base = state.draft || state.profile;
    const aiConfig = {
      key: envVars.GEMINI_API_KEY,
      model: envVars.GEMINI_MODEL,
    };
    const submitted =
      "story" in input
        ? narrativeInput(input, true)
        : { ...interview(input), story: undefined };
    const result =
      "answers" in submitted
        ? await generateProfile(submitted.answers, aiConfig)
        : await generateNarrative(submitted.story, aiConfig, cardMemory(base));

    const merge = mergeProfile(base, screenProfile(result.profile));
    const blend =
      base && !merge.startedNew
        ? await blendSections(base, merge.profile, merge.additions, aiConfig)
        : null;
    const profile = screenProfile(blend ? blend.profile : merge.profile);
    const notice = [
      result.notice,
      mergeNotice(merge, base?.preferredName || "their"),
      state.draft && !merge.startedNew
        ? "This builds on your earlier draft that hasn't been approved yet."
        : "",
      blend ? blendNotice(blend) : "",
    ]
      .filter(Boolean)
      .join(" ");

    const { uncertainties: _flags, ...extractedAnswers } = profile;
    const answers =
      "answers" in submitted ? submitted.answers : extractedAnswers;

    const next = await saveState(
      {
        ...state,
        ...submitted,
        answers,
        draft: profile,
        aiMode: result.mode,
        aiNotice: notice,
      },
      state.revision,
      userId,
    );
    return json({
      profile,
      mode: result.mode,
      notice,
      added: merge.added,
      startedNew: merge.startedNew,
      state: next,
    });
  }

  if (route === "approve-profile") {
    const approved = approveProfile(
      state,
      screenProfile(parseProfile(input.profile)),
    );
    const fields = changedFields(state.profile, approved.profile!);
    const next = withHistory(approved, {
      source: state.draft ? "family story" : "family edit",
      summary: state.draft
        ? `Family story added to ${fields.length} section${fields.length === 1 ? "" : "s"}`
        : `Family edited ${fields.length} section${fields.length === 1 ? "" : "s"}`,
      fields,
    });
    const saved = await saveState(next, state.revision, userId);
    await logEvents(
      envVars,
      fields
        .filter((f) => f !== "fullName" && f !== "preferredName")
        .map(
          (field): CareEvent => ({
            type: state.draft ? "family_story" : "family_edit",
            field,
            note: addedText(state.profile, saved.profile!, field) || undefined,
          }),
        ),
    );
    return json({ state: saved });
  }

  if (route === "qr")
    return json({
      state: await saveState(
        { ...state, qrToken: crypto.randomUUID() },
        state.revision,
        userId,
      ),
    });

  if (parts[0] === "suggestions" && parts.length === 2) {
    if (input.decision !== "approved" && input.decision !== "rejected")
      throw new InputError("Choose approve or reject.");
    let next = decideSuggestion(state, parts[1], input.decision);
    if (next.profile && input.decision === "approved") {
      const suggestion = state.suggestions.find((s) => s.id === parts[1])!;
      const field = suggestion.field;
      const before = state.profile!;
      if (before[field] && next.profile[field] !== before[field]) {
        const blend = await blendSections(
          before,
          next.profile,
          { [field]: `Visitor observation: ${suggestion.value}` },
          { key: envVars.GEMINI_API_KEY, model: envVars.GEMINI_MODEL },
        );
        next = { ...next, profile: blend.profile };
      }
      next = { ...next, profile: screenProfile(next.profile!) };
      next = withHistory(next, {
        source: "visitor observation",
        summary: `Visitor observation added: ${suggestion.value.slice(0, 120)}`,
        fields: changedFields(state.profile, next.profile!),
      });
    }
    const saved = await saveState(next, state.revision, userId);
    const decided = state.suggestions.find((s) => s.id === parts[1]);
    if (decided)
      await logEvents(envVars, [
        input.decision === "approved"
          ? {
              type: "observation_approved",
              field: decided.field,
              note: decided.value,
            }
          : { type: "observation_rejected", field: decided.field },
      ]);
    return json({ state: saved });
  }

  throw new InputError("This action was not found.", 404);
}

async function dispatch(request: Request) {
  try {
    return await handle(request);
  } catch (error) {
    return json(
      {
        error:
          error instanceof InputError
            ? error.message
            : "The application could not complete this action. Please try again.",
      },
      error instanceof InputError ? error.status : 500,
    );
  }
}

export const GET = dispatch;
export const POST = dispatch;