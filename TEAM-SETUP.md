# Run KinCard with your team

KinCard uses Google Gemini, not the OpenAI API. You do not need Codex or an OpenAI account to run the demo. **Use fictional people and details only.**

## First run

1. Install Node.js 22.13 or newer; Node 24 is used for this project. Node includes npm. Restart VS Code after installation.
2. Clone the repository and open its project folder in VS Code.
3. Open **Terminal → New Terminal** and run:

```sh
npm install
npm run setup
npm run dev
```

Keep that terminal open and visit the Local URL it prints, normally [http://127.0.0.1:5173](http://127.0.0.1:5173). The first load can take 20–30 seconds.

**Demo username:** `family`  
**Demo password:** `KinCard2026!`

Setup and development recreate `.openai/hosting.json` if missing while preserving an existing configuration. This is optional Sites hosting metadata, not an OpenAI dependency. Each developer has a separate local database; GitHub shares code changes, not demo records.

If npm is not found, install Node/npm or restart the terminal. The Mac launcher can also use Codex's bundled runtime on machines that have it; ordinary Node/npm works for teammates on macOS, Windows, and Linux.

## Add Gemini and generate the card

The API-ready download already includes a blank `.env.local` in the project root, beside `package.json`. If using a Git clone, copy `.env.example` to `.env.local`. Add your own key locally and restart the server:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.8-flash
```

Never commit, paste into chat, or screenshot an actual key. Do not use `VITE_` or `NEXT_PUBLIC_` for this setting. No OpenAI key is needed. A hosted copy needs separately configured server runtime secrets.

Open **Family speaks**, then select **Check Gemini connection**. This checks the server's key and model with a small request containing no patient information. The presence of a key alone does not prove it works. With a valid connection, **Generate draft care card** uses Gemini to interpret the reviewed story. Review and approve that draft to publish it at the QR link. The preloaded fictional Maggie sample is not a newly generated card; adding a key does not automatically replace it.

Without a key, profile generation and suggested updates have a labelled local preview. With a configured key, rejected credentials, exhausted quota, or invalid results show an error rather than successful mock output. Fix the reported issue and retry; the approved card remains unchanged. **Translation requires a working Gemini key.** If the key is missing or translation fails, the English card remains with a message rather than a fake translation.

Both `npm run dev` and the built local preview (`npm run build`, then `npm start`) read this root `.env.local`. Restart after changing it. A hosted deployment still requires separately configured server secrets.

## Try the privacy and translation flow

1. Sign in and open **Family speaks**. Type a fictional story or use supported on-device voice-to-text.
2. Select **Review privacy**. Inspect the detected categories and the screened text, edit it, and confirm your review.
3. Save or generate the care card. The server rechecks the reviewed text before storage or Gemini. Review the draft and approve it.
4. Open the caregiver view through **QR sharing**. Choose one of the 12 language options and select **Translate card**. The translated view includes card values, section labels, and caregiver questions/buttons; original English remains available and is not replaced in storage.
5. Leave a fictional observation, then return to the family journal to approve or reject a suggested update.

Detected identifiers are reduced, not guaranteed to be fully removed. Names, health details, and indirect identifiers may remain. A review checkbox is not legal consent; existing saved records are **not retroactively scrubbed**. Translation can misstate meaning, so a person must compare important details with the original before care decisions. Read [README.md](README.md) for the workflow, limitations, and BC privacy references.

## Voice and phone demo notes

Microphone transcription requires a browser that supports local `processLocally` speech recognition and a ready on-device English language pack. The app does not install a language pack or fall back to a cloud recognizer. If local recognition or permissions are unavailable, type instead. KinCard does not send microphone audio to Gemini; reviewed text can be sent when Gemini is configured.

A phone cannot reach your computer through its own `localhost` or `127.0.0.1`. Use a reachable hosted demo for phone scanning. A private Site may require the site owner's hosting sign-in in addition to KinCard's demo access.

## Checks and collaboration

```sh
npm run typecheck
npm test
npm run build
```

Commit and push source changes, then teammates can pull them. Do not commit `.env.local`, local database state, dependencies, or generated build files. The shared login and QR route are demonstration features, not real patient-data protection.
