/** Browser-only recognition configured to require on-device processing.
 * Importing this module is safe during server rendering. It never starts the
 * microphone, installs a language pack, or falls back to a cloud recognizer.
 */
export type SpeechEngine = {
  processLocally: boolean;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type CandidateEngine = Omit<SpeechEngine, "processLocally"> & {
  processLocally?: boolean;
};

export type LocalSpeechConstructor = {
  new (): CandidateEngine;
  available?: (options: {
    langs: string[];
    processLocally: true;
  }) => Promise<string>;
};

export type LocalSpeechBrowser = {
  SpeechRecognition?: LocalSpeechConstructor;
  webkitSpeechRecognition?: LocalSpeechConstructor;
};

export async function createLocalSpeech(
  browserLike?: LocalSpeechBrowser,
): Promise<SpeechEngine> {
  const browser =
    browserLike ??
    (typeof window === "undefined"
      ? undefined
      : (window as unknown as LocalSpeechBrowser));
  const Recognition =
    browser?.SpeechRecognition || browser?.webkitSpeechRecognition;
  if (!Recognition) {
    throw new Error(
      "On-device voice-to-text is unavailable in this browser. Please type your story instead.",
    );
  }

  let engine: CandidateEngine;
  try {
    engine = new Recognition();
  } catch {
    throw new Error(
      "On-device speech recognition could not be prepared. Please type your story instead.",
    );
  }
  // Do not assign a new property to an old implementation: it could ignore the
  // option and still send audio to the browser vendor's cloud service.
  if (!("processLocally" in engine)) {
    throw new Error(
      "This browser cannot guarantee on-device transcription. Microphone capture has not started; please type your story instead.",
    );
  }
  try {
    engine.processLocally = true;
    if (engine.processLocally !== true) throw new Error("Local mode ignored");
    engine.lang = "en-US";
    engine.continuous = true;
    engine.interimResults = true;
  } catch {
    throw new Error(
      "This browser could not enable on-device transcription. Microphone capture has not started; please type your story instead.",
    );
  }

  if (typeof Recognition.available === "function") {
    let availability: string;
    try {
      availability = await Recognition.available({
        langs: ["en-US"],
        processLocally: true,
      });
    } catch {
      throw new Error(
        "Unable to verify on-device transcription. Microphone capture has not started; please type your story instead.",
      );
    }
    if (availability !== "available") {
      throw new Error(
        "The on-device English speech pack is not ready in this browser. No audio was captured. Please type your story or set up on-device speech in a supported browser.",
      );
    }
  }

  return engine as SpeechEngine;
}
