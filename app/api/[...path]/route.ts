import { generateProfile, generateSuggestion } from "../../../lib/ai.ts";
import { generateNarrative, parseStory } from "../../../lib/narrative.ts";
import type { KinState, Suggestion, VisitNote } from "../../../lib/domain.ts";
import { bindings, loadState, saveState } from "../../../lib/store.ts";
import { approveProfile, decideSuggestion } from "../../../lib/transitions.ts";
import {
  InputError,
  parseAnswers,
  parseProfile,
  record,
  requireRevision,
  text,
} from "../../../lib/validation.ts";

export const dynamic = "force-dynamic";
const COOKIE = "kincard_demo";
// Deliberately shared and forgeable demo marker. This is NOT production auth.
const DEMO_MARKER = "fictional-family-demo";
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
function signedIn(request: Request): boolean {
  return (request.headers.get("cookie") || "")
    .split(";")
    .some((part) => part.trim() === `${COOKIE}=${DEMO_MARKER}`);
}
function cookie(request: Request, logout = false): string {
  return `${COOKIE}=${logout ? "" : DEMO_MARKER}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${logout ? 0 : 28800}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new InputError("Please send JSON.", 415);
  if (Number(request.headers.get("content-length")) > 50000)
    throw new InputError("This request is too large.", 413);
  const raw = await request.text();
  if (raw.length > 50000)
    throw new InputError("This request is too large.", 413);
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
    answers: parseAnswers(source.answers),
    relationship: text(source.relationship, "Relationship", 80, true),
    terms: source.terms,
  };
}
function narrativeInput(source: Record<string, unknown>, required = false) {
  if (typeof source.terms !== "boolean")
    throw new InputError(
      "The optional demo terms choice must be true or false.",
    );
  return {
    story: parseStory(source.story, required),
    relationship: text(source.relationship, "Relationship", 80, true),
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
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin)
      throw new InputError("Please use KinCard from its own browser tab.", 403);
  }
  if (request.method === "POST" && route === "login") {
    const input = await body(request);
    if (input.username !== "family" || input.password !== "KinCard2026!")
      throw new InputError("That demo username or password is incorrect.", 401);
    return json({ ok: true, demoOnly: true }, 200, {
      "Set-Cookie": cookie(request),
    });
  }
  if (request.method === "POST" && route === "logout")
    return json({ ok: true }, 200, { "Set-Cookie": cookie(request, true) });

  if (parts[0] === "care") {
    const state = await loadState();
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
      const note: VisitNote = {
        id: crypto.randomUUID(),
        author: text(input.author, "Visitor name", 80, true),
        text: text(input.text, "Visit note", 4000, true),
        createdAt: new Date().toISOString(),
      };
      if (state.notes.length >= 300)
        throw new InputError(
          "The shared demo has reached its visit-note limit.",
          409,
        );
      const config = bindings();
      const result = await generateSuggestion(note.text, {
        key: config.GEMINI_API_KEY,
        model: config.GEMINI_MODEL,
      });
      const suggestion: Suggestion | null = result.value
        ? {
            id: crypto.randomUUID(),
            noteId: note.id,
            field: result.field,
            value: result.value,
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
      );
      return json(
        { note, suggestion, mode: result.mode, notice: result.notice },
        201,
      );
    }
    throw new InputError("This care-card action was not found.", 404);
  }
  if (!signedIn(request))
    throw new InputError("Please sign in with the demo family account.", 401);
  if (request.method === "GET" && route === "state")
    return json(await loadState());
  if (request.method !== "POST")
    throw new InputError("This action was not found.", 404);
  const input = await body(request);
  const state = await loadState();
  requireRevision(input, state.revision);
  if (route === "interview") {
    const submitted =
      "story" in input
        ? narrativeInput(input)
        : { ...interview(input), story: undefined };
    const next = { ...state, ...submitted, draft: null };
    return json({ state: await saveState(next, state.revision) });
  }
  if (route === "generate") {
    const config = bindings();
    const aiConfig = { key: config.GEMINI_API_KEY, model: config.GEMINI_MODEL };
    const submitted =
      "story" in input
        ? narrativeInput(input, true)
        : { ...interview(input), story: undefined };
    const result =
      "answers" in submitted
        ? await generateProfile(submitted.answers, aiConfig)
        : await generateNarrative(submitted.story, aiConfig);
    const { uncertainties: _flags, ...extractedAnswers } = result.profile;
    const answers =
      "answers" in submitted ? submitted.answers : extractedAnswers;
    const next = await saveState(
      {
        ...state,
        ...submitted,
        answers,
        draft: result.profile,
        aiMode: result.mode,
        aiNotice: result.notice,
      },
      state.revision,
    );
    return json({
      profile: result.profile,
      mode: result.mode,
      notice: result.notice,
      state: next,
    });
  }
  if (route === "approve-profile") {
    const next = approveProfile(state, parseProfile(input.profile));
    return json({ state: await saveState(next, state.revision) });
  }
  if (route === "qr")
    return json({
      state: await saveState(
        { ...state, qrToken: crypto.randomUUID() },
        state.revision,
      ),
    });
  if (parts[0] === "suggestions" && parts.length === 2) {
    if (input.decision !== "approved" && input.decision !== "rejected")
      throw new InputError("Choose approve or reject.");
    const next = decideSuggestion(state, parts[1], input.decision);
    return json({ state: await saveState(next, state.revision) });
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
            : "The demo could not complete this action. Please try again.",
      },
      error instanceof InputError ? error.status : 500,
    );
  }
}
export const GET = dispatch;
export const POST = dispatch;
