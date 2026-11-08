import { InputError } from "./validation.ts";

export type AiConfig = {
  key?: string;
  model?: string;
  fetcher?: typeof fetch;
};
export type AiStatus = {
  configured: boolean;
  model: string;
  mode: "gemini" | "mock";
  issue?: string;
};
export const DEFAULT_MODEL = "gemini-3.8-flash";

/** Safe, actionable errors only. Never include a key, submitted text or the
 * provider's response body in an error returned to the browser or a log. */
export class GeminiError extends InputError {}

function normalized(config: AiConfig) {
  const key = (config.key || "").trim();
  const model =
    (config.model || "").trim().replace(/^models\//, "") || DEFAULT_MODEL;
  let issue: string | undefined;
  if (!/^gemini-[a-zA-Z0-9._-]{1,90}$/.test(model))
    issue =
      "GEMINI_MODEL must be a Gemini model ID, such as gemini-3.8-flash. Update .env.local and restart KinCard.";
  else if (
    key &&
    (/^(?:your[_ -].*(?:key|here)|paste[_ -].*(?:key|here)|replace[_ -]?me|changeme|<.*>|\.\.\.)$/i.test(
      key,
    ) ||
      /^(?:GEMINI_API_KEY|Bearer)\s*[:= ]/i.test(key))
  )
    issue =
      "Replace the example GEMINI_API_KEY value in .env.local with your own key, then restart KinCard.";
  else if (
    key &&
    (/\s|[\r\n]/.test(key) || key.length > 4096 || /^["']|["']$/.test(key))
  )
    issue =
      "GEMINI_API_KEY is not usable. Put only the key value in .env.local, then restart KinCard.";
  return { key, model, issue };
}

/** Configured means a key is present; only the connection check verifies it. */
export function getAiStatus(config: AiConfig): AiStatus {
  const { key, model, issue } = normalized(config);
  return {
    configured: Boolean(key),
    model: /^gemini-[a-zA-Z0-9._-]{1,90}$/.test(model) ? model : DEFAULT_MODEL,
    mode: key ? "gemini" : "mock",
    ...(issue ? { issue } : {}),
  };
}

export function hasConfiguredGemini(config: AiConfig): boolean {
  const current = normalized(config);
  if (current.issue) throw new GeminiError(current.issue, 503);
  return Boolean(current.key);
}

export function geminiResultError(error: unknown): GeminiError {
  return error instanceof GeminiError
    ? error
    : new GeminiError(
        "Gemini returned a result that could not be validated. Your approved card has not changed. Try again or simplify the text.",
        502,
      );
}

function requestError(status: number, raw: string): GeminiError {
  // These values classify errors only; the provider text is never returned.
  let detail = "";
  try {
    const envelope = JSON.parse(raw);
    const error =
      envelope && typeof envelope === "object" ? envelope.error : undefined;
    detail = JSON.stringify(error || "").slice(0, 20000);
  } catch {
    /* A non-JSON upstream error still gets a safe status message. */
  }
  if (
    status === 401 ||
    status === 403 ||
    /API_KEY_INVALID|API_KEY_EXPIRED|API_KEY_SERVICE_BLOCKED|API_KEY_HTTP_REFERRER_BLOCKED|API key not valid|invalid api key/i.test(
      detail,
    )
  )
    return new GeminiError(
      "Gemini could not authenticate this key. Check GEMINI_API_KEY, its API permissions and restrictions, then restart KinCard.",
      502,
    );
  if (status === 404)
    return new GeminiError(
      "The configured Gemini model is unavailable for this key. Check GEMINI_MODEL in .env.local, then restart KinCard.",
      502,
    );
  if (status === 429 || /RESOURCE_EXHAUSTED/.test(detail))
    return new GeminiError(
      "Gemini's request limit or quota was reached. Check the key's quota and billing, then try again later. Your approved card has not changed.",
      503,
    );
  if (status >= 500)
    return new GeminiError(
      "Gemini is temporarily unavailable. Please try again later. Your approved card has not changed.",
      503,
    );
  return new GeminiError(
    "Gemini rejected this request. Check the configured model and key permissions, then try again. Your approved card has not changed.",
    502,
  );
}

export type JsonRequestOptions = {
  maxOutputTokens?: number;
  maxResponseCharacters?: number;
  // Extra input parts sent before the JSON data, e.g. an audio recording.
  media?: { mimeType: string; data: string }[];
};

export async function requestJson(
  config: AiConfig,
  system: string,
  data: unknown,
  schema: unknown,
  options: JsonRequestOptions = {},
): Promise<unknown> {
  const { key, model, issue } = normalized(config);
  if (issue) throw new GeminiError(issue, 503);
  if (!key)
    throw new GeminiError(
      "Add GEMINI_API_KEY to .env.local and restart KinCard before checking the connection or using Gemini.",
      503,
    );
  const signal = AbortSignal.timeout(60000);
  try {
    const response = await (config.fetcher || fetch)(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [
            {
              role: "user",
              parts: [
                ...(options.media || []).map((inlineData) => ({ inlineData })),
                { text: JSON.stringify(data) },
              ],
            },
          ],
          generationConfig: {
            // Gemini 3.8 retires temperature/topP/topK. Leaving sampling at the
            // model default also keeps this request compatible with older IDs.
            maxOutputTokens: options.maxOutputTokens || 24576,
            ...(/^gemini-[3-9](?:[.-]|$)/.test(model)
              ? { thinkingConfig: { thinkingLevel: "LOW" } }
              : {}),
            responseMimeType: "application/json",
            responseJsonSchema: schema,
          },
        }),
      },
    );
    const raw = await response.text();
    if (!response.ok) throw requestError(response.status, raw);
    if (raw.length > 2000000) throw geminiResultError(null);
    let json: {
      promptFeedback?: { blockReason?: string };
      candidates?: {
        finishReason?: string;
        content?: { parts?: { text?: string; thought?: boolean }[] };
      }[];
    };
    try {
      json = JSON.parse(raw);
    } catch {
      throw geminiResultError(null);
    }
    if (!json || typeof json !== "object") throw geminiResultError(null);
    const candidate = Array.isArray(json.candidates)
      ? json.candidates[0]
      : undefined;
    if (
      json.promptFeedback?.blockReason ||
      /^(?:SAFETY|BLOCKLIST|PROHIBITED_CONTENT|SPII|RECITATION)$/.test(
        candidate?.finishReason || "",
      )
    )
      throw new GeminiError(
        "Gemini declined to process this text. Review it for sensitive or unsupported details and try again. Your approved card has not changed.",
        502,
      );
    if (candidate?.finishReason === "MAX_TOKENS")
      throw new GeminiError(
        "Gemini's response was cut short. Shorten the story or card text and try again. Your approved card has not changed.",
        502,
      );
    if (candidate?.finishReason && candidate.finishReason !== "STOP")
      throw geminiResultError(null);
    const parts = candidate?.content?.parts;
    if (
      !Array.isArray(parts) ||
      parts.some(
        (part) =>
          !part ||
          typeof part !== "object" ||
          (part.text !== undefined && typeof part.text !== "string"),
      )
    )
      throw geminiResultError(null);
    const content = parts
      .filter((part) => !part.thought)
      .map((part) => part.text || "")
      .join("");
    if (!content || content.length > (options.maxResponseCharacters || 180000))
      throw geminiResultError(null);
    try {
      return JSON.parse(content);
    } catch {
      throw geminiResultError(null);
    }
  } catch (error) {
    if (error instanceof GeminiError) throw error;
    if (
      signal.aborted ||
      (error instanceof Error &&
        /^(?:TimeoutError|AbortError)$/.test(error.name))
    )
      throw new GeminiError(
        "Gemini took too long to respond. Please try again. Your approved card has not changed.",
        504,
      );
    throw new GeminiError(
      "KinCard could not reach Gemini. Check the internet connection and try again. Your approved card has not changed.",
      503,
    );
  }
}

export async function checkGeminiConnection(
  config: AiConfig,
): Promise<{ ok: true; mode: "gemini"; model: string; notice: string }> {
  const output = await requestJson(
    config,
    "This is KinCard's connection check. Return only the supplied JSON schema with ok=true. No patient information is involved.",
    { check: "Return ok=true." },
    {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
      additionalProperties: false,
    },
    { maxOutputTokens: 2048, maxResponseCharacters: 1000 },
  );
  if (
    !output ||
    typeof output !== "object" ||
    Array.isArray(output) ||
    Object.keys(output).length !== 1 ||
    (output as { ok?: unknown }).ok !== true
  )
    throw geminiResultError(null);
  return {
    ok: true,
    mode: "gemini",
    model: normalized(config).model,
    notice:
      "Gemini connected. Profile generation, suggested updates and translation are ready.",
  };
}
