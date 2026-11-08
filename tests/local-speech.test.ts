import test from "node:test";
import assert from "node:assert/strict";
import { createLocalSpeech, type SpeechEngine } from "../lib/local-speech.ts";

class LocalEngine implements SpeechEngine {
  processLocally = false;
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: SpeechEngine["onresult"] = null;
  onerror: SpeechEngine["onerror"] = null;
  onend: SpeechEngine["onend"] = null;
  static starts = 0;
  start() {
    LocalEngine.starts++;
  }
  stop() {}
  abort() {}
}

test("local speech is configured without capturing audio", async () => {
  LocalEngine.starts = 0;
  const engine = await createLocalSpeech({ SpeechRecognition: LocalEngine });
  assert.equal(engine.processLocally, true);
  assert.equal(engine.lang, "en-US");
  assert.equal(engine.continuous, true);
  assert.equal(engine.interimResults, true);
  assert.equal(LocalEngine.starts, 0);
});

test("availability checks explicitly request only on-device English", async () => {
  class AvailableEngine extends LocalEngine {
    static async available(options: unknown) {
      assert.deepEqual(options, { langs: ["en-US"], processLocally: true });
      return "available";
    }
  }
  const engine = await createLocalSpeech({
    SpeechRecognition: AvailableEngine,
  });
  assert.equal(engine.processLocally, true);
  assert.equal(LocalEngine.starts, 0);
});

test("legacy cloud-only recognition cannot start or gain an ignored local flag", async () => {
  class LegacyEngine {
    continuous = false;
    interimResults = false;
    lang = "";
    onresult = null;
    onerror = null;
    onend = null;
    static starts = 0;
    start() {
      LegacyEngine.starts++;
    }
    stop() {}
    abort() {}
  }
  await assert.rejects(
    createLocalSpeech({ webkitSpeechRecognition: LegacyEngine }),
    /cannot guarantee on-device.*please type/i,
  );
  assert.equal(LegacyEngine.starts, 0);
});

test("unavailable, downloading and downloadable language packs fail closed", async () => {
  for (const status of [
    "unavailable",
    "downloadable",
    "downloading",
    "unexpected",
  ]) {
    class MissingPackEngine extends LocalEngine {
      static async available() {
        return status;
      }
    }
    await assert.rejects(
      createLocalSpeech({ SpeechRecognition: MissingPackEngine }),
      /speech pack is not ready.*No audio was captured/,
    );
  }
  assert.equal(LocalEngine.starts, 0);
});

test("failed availability verification does not silently use cloud recognition", async () => {
  class FailedCheckEngine extends LocalEngine {
    static async available(): Promise<string> {
      throw Error("provider internals");
    }
  }
  await assert.rejects(
    createLocalSpeech({ SpeechRecognition: FailedCheckEngine }),
    /Unable to verify on-device transcription/,
  );
  assert.equal(LocalEngine.starts, 0);
});

test("an implementation that ignores the local-only flag fails closed", async () => {
  class IgnoredFlagEngine extends LocalEngine {
    constructor() {
      super();
      Object.defineProperty(this, "processLocally", {
        get: () => false,
        set: () => {},
      });
    }
  }
  await assert.rejects(
    createLocalSpeech({ SpeechRecognition: IgnoredFlagEngine }),
    /could not enable on-device transcription/,
  );
  assert.equal(LocalEngine.starts, 0);
});

test("unavailable browser APIs and server-side calls have a typing fallback", async () => {
  await assert.rejects(createLocalSpeech({}), /Please type your story/);
  await assert.rejects(createLocalSpeech(), /Please type your story/);
});

test("failed constructors produce a readable local-only fallback", async () => {
  class FailedConstructor extends LocalEngine {
    constructor() {
      super();
      throw Error("sensitive internals");
    }
  }
  await assert.rejects(
    createLocalSpeech({ SpeechRecognition: FailedConstructor }),
    /could not be prepared.*Please type/,
  );
});
