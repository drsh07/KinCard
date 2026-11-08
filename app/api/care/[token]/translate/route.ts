import { loadState, bindings } from "../../../../../lib/store.ts";
import {
  translateCareProfile,
  parseCareLanguage,
} from "../../../../../lib/translation.ts";
import { InputError, record } from "../../../../../lib/validation.ts";
import { sameOrigin } from "../../../../../lib/origin.ts";
import { householdOfToken } from "../../../../../lib/household.ts";
export const dynamic = "force-dynamic";
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    if (!sameOrigin(request))
      throw new InputError("Open the care card in its own browser tab.", 403);
    if (!request.headers.get("content-type")?.includes("application/json"))
      throw new InputError("Please send JSON.", 415);
    if (Number(request.headers.get("content-length")) > 1000)
      throw new InputError("Translation request is too large.", 413);
    const raw = await request.text();
    if (raw.length > 1000)
      throw new InputError("Translation request is too large.", 413);
    let input: Record<string, unknown>;
    try {
      input = record(JSON.parse(raw));
    } catch {
      throw new InputError("Invalid translation request.");
    }
    if (
      Object.keys(input).some((key) => !["language", "revision"].includes(key))
    )
      throw new InputError(
        "Only a language and card revision may be submitted.",
      );
    const language = parseCareLanguage(input.language);
    const { token } = await params;
    const household = householdOfToken(token);
    const state = await loadState(household);
    if (token !== state.qrToken || !state.profile)
      throw new InputError(
        "This care-card link is no longer active. Ask the family for the latest QR code.",
        404,
      );
    if (!Number.isInteger(input.revision) || input.revision !== state.revision)
      throw new InputError(
        "The card changed. Refresh it before translating.",
        409,
      );
    const config = bindings();
    const result = await translateCareProfile(state.profile, language, {
      key: config.GEMINI_API_KEY,
      model: config.GEMINI_MODEL,
    });
    // Recheck after the external call so retired links or changed cards cannot
    // receive a response for an obsolete revision.
    const latest = await loadState(household);
    if (latest.qrToken !== token)
      throw new InputError("This care-card link is no longer active.", 404);
    if (latest.revision !== state.revision)
      throw new InputError(
        "The card changed while translating. Refresh it and try again.",
        409,
      );
    return json(result);
  } catch (error) {
    return json(
      {
        error:
          error instanceof InputError
            ? error.message
            : "The translation could not be completed. The original card remains available.",
      },
      error instanceof InputError ? error.status : 500,
    );
  }
}
