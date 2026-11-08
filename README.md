# KinCard

**Every visit should start with knowing the person.**

Built at HackCamp 2026 by Darsh Sood, Alexander Lee, Kevin Akita Kang and Hamza Riaz.

## Our mission

People living with dementia are cared for by a constantly changing group of home-care workers, nurses, respite workers and volunteers. Most of them walk in knowing only the medical side of the person, if anything, and nothing about who they are. Without that, visits go badly: the person becomes confused or upset, care quality drops, and families end up repeating the same story to every new face.

KinCard makes sure that whoever walks through the door already knows the person on the other side.

## The problem

- More than 770,000 Canadians live with dementia, and 17 more develop it every hour.
- 45% of unpaid dementia caregivers show signs of distress.
- Paper profiles like "This is me" help, but they often go unfilled (only 1 in 3 completed in one hospital study), can't be updated and end up in a drawer.
- Care-team apps need an install and an invite code, so volunteers and substitute workers never get access.

## How KinCard works

**For the family (one account, about 10 minutes)**

1. Describe your loved one in your own words, by typing or dictating.
2. A privacy review removes details like phone numbers, addresses and health-card numbers.
3. Gemini organizes the story into a short care card. You review and approve it.
4. Print the QR code and put it on the fridge.

**For caregivers and visitors (no account, no app)**

1. Scan the QR code with your phone camera.
2. Read the card in 30 seconds: what to call them, what calms them, what to avoid, what to talk about and their routine.
3. Translate it into any of 12 languages with one tap.
4. Leave a quick note after the visit.

**It gets better every visit.** Gemini turns caregiver notes into suggested updates, and nothing changes until the family approves.

## Key features

- **No app or login for caregivers:** just a QR code and a phone browser
- **AI that organizes, never invents:** Gemini uses structured output to sort the family's own words into fixed fields, and every response is validated
- **Privacy by design:** no diagnoses, medications or addresses on the card; sensitive details are screened before anything is saved or sent to AI
- **On-device voice input:** microphone audio is never uploaded
- **Translation into 12 languages,** including Punjabi, Tagalog and Simplified and Traditional Chinese
- **Family stays in control:** every change needs approval, and replacing the QR link kills the old one

## Built with

React, TypeScript, Vite, Cloudflare Workers, Cloudflare D1, Drizzle ORM, Google Gemini API, Databricks and the Web Speech API.

> **Demo only.** All data is fictional. The shared demo login and QR access are deliberately simplified, and KinCard is not ready for real patient information.

## Run it locally

**1. Install Node.js 22.13 or newer.** Download the LTS version from [nodejs.org](https://nodejs.org), then restart your terminal and check it worked:

```sh
node -v
```

**2. Get the code:**

```sh
git clone https://github.com/drsh07/KinCard.git
cd KinCard
```

**3. Install, set up the local database, and start the app:**

```sh
npm install
npm run setup
npm run dev
```

**4. Open the Local URL** printed by the server, normally [http://127.0.0.1:5173](http://127.0.0.1:5173). The first load can take 20 to 30 seconds. Sign in with:

| Username | Password |
| --- | --- |
| `family` | `KinCard2026!` |

The app works without any API key using a clearly labelled local preview. To use real AI generation and translation, add a Gemini key (see **Connect Gemini** below). Each computer has its own local demo database, so demo records don't sync between teammates. Setup tips for teammates are in [TEAM-SETUP.md](TEAM-SETUP.md).

**5. Try it on a phone (optional).** The QR code points to the address the app is open on, and `127.0.0.1` only works on your own computer. Keep `npm run dev` running and, in a second terminal, run:

```sh
npx cloudflared tunnel --url http://127.0.0.1:5173
```

Open the app through the `https://….trycloudflare.com` link it prints, then go to **QR sharing**. Any phone can now scan the code.

## Connect Gemini and generate a real card

If `.env.local` doesn't exist yet, copy the example configuration:

```sh
cp .env.example .env.local
```

On Windows, copying the file in your editor is also fine. Add your own key to the local file and restart the development server:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.8-flash
```

Keep actual keys out of Git, chat, screenshots, and client code. Never prefix the key with `VITE_` or `NEXT_PUBLIC_`. `.env.local` is ignored by Git and is read by the development server. A deployed instance needs its own server runtime secret; this local file is not a hosted secret.

Then:

1. Stop the running server with Control-C and run `npm run dev` again. The built local preview (`npm run build`, then `npm start`) also reads this same root `.env.local`; keys are loaded at runtime rather than stored in the build.
2. Sign in and open **Family speaks**. The Gemini panel shows whether the server has a key. Select **Check Gemini connection** to make a small request containing no patient information.
3. Write or dictate a fictional story, select **Review privacy**, edit the screened text, and confirm your review.
4. Select **Generate draft care card**. With a working key, Gemini interprets the story into profile fields and flags uncertainty.
5. Review the generated fields, check the approval box, and select **Approve & publish care card**. The QR card now shows that approved profile. Merely adding a key does not replace an existing card or approve new information automatically.
6. Open **QR sharing**, then **Open caregiver view**. Translation and visit-note suggestions use that same server-side Gemini connection. A suggestion still requires family approval.

Without a key, profile interpretation and suggested updates use a clearly labelled deterministic local preview. **Once a key is present, a Gemini failure is an error, not a successful mock card.** Rejected keys, unavailable models, exhausted quota, network failures, and incomplete responses produce an actionable message. The reviewed story remains available for another attempt and the approved card is not replaced. A caregiver note that cannot get a Gemini suggestion stays in the form for retry rather than reporting a false success.

**Translation has no fake fallback:** without a working Gemini key, the original English card stays visible with an explanatory message. Model availability depends on your Gemini account; `GEMINI_MODEL` is configurable. See Google's [Gemini API](https://ai.google.dev/gemini-api/docs) and [structured output](https://ai.google.dev/gemini-api/docs/structured-output) documentation.

The preloaded Maggie card is an explicitly fictional sample for trying the demo. It is separate from a new Gemini-generated draft. A connection check verifies access at that moment; later requests can still fail because of quota, connectivity, or provider changes. The key must belong to a Gemini API project with access to the selected model and sufficient quota. A Cloudflare-hosted copy needs its own runtime secrets; a local file does not configure a remote deployment.

## Privacy review before sharing

The family story follows this sequence:

1. **Write or dictate locally.** Raw text stays in the current page until you choose to share reviewed text.
2. **Select Review privacy.** A local heuristic screen detects common identifiers and unnecessary third-party details. It removes detected details such as contact numbers, addresses, full birth dates, health-card numbers, financial details, and credentials. Findings show categories and counts rather than echoing removed values.
3. **Review and edit the screened text.** Check the remaining story yourself. Changes require confirmation again. The review checkbox records your review; it is not legal consent or a compliance certificate.
4. **Save or generate.** The server checks the reviewed text again before saving it or sending it to Gemini. Reintroduced details detected by the screen must be reviewed again.
5. **Review the generated care card.** Correct content and uncertainty before approving publication. Only the approved profile appears at the QR link.

Caregiver observations are also screened before they are shared. The original source text and AI output can still contain information the heuristic misses. Names, family relationships, health information, rare events, and combinations of details may identify someone even without an obvious identifier. The screen does not remove every name or health fact, and it cannot decide whether a disclosure is lawful.

**This feature does not retroactively scrub or erase previously saved records.** Existing stories, profiles, notes, exports, backups, and information previously sent to a vendor require separate review and handling. Editing or replacing the current care card is not a guarantee that earlier copies have been deleted.

### Local voice recognition only

Microphone transcription is allowed only when the browser exposes and accepts `SpeechRecognition.processLocally = true`. When its availability API is available, the app also checks that the on-device English (`en-US`) language pack is ready. Browser and operating-system support vary. A local language pack may need to be installed through the browser's own setup; KinCard does not install one automatically.

If local recognition cannot be verified, a pack is missing, microphone access is denied, or recognition fails, use the typed entry. **There is no automatic cloud transcription fallback.** KinCard does not upload microphone audio to Gemini; reviewed transcript text can be sent to Gemini when configured. Browser permissions, browser implementation, and any local pack download remain outside this app's control, so this is not an assurance about every browser or device.

## Caregiver translation

The caregiver card offers 12 language choices: original English, Punjabi in Gurmukhi script, Simplified Chinese, Traditional Chinese, Hindi, Tagalog/Filipino, French, Spanish, Korean, Vietnamese, Arabic, and Portuguese.

Choose a language and select **Translate card**. Gemini translates the care-card section labels and contents, uncertainty notices, and caregiver interface copy, including visit-note questions and buttons. The translation control itself remains available in English. Names are preserved as names rather than translated.

The server reads the already approved profile; the browser sends only a language choice and card revision. Full-name and preferred-name fields are excluded from the translation payload. Matching occurrences in other text are replaced with placeholders where possible and restored for display afterward. The remaining text is screened for detected identifiers before it is sent. Unrecognized names, indirect identifiers, and sensitive context can remain: this is data minimization, not guaranteed anonymity.

Translation is a temporary viewing aid. It is not saved as a replacement profile and does not change the original English card. **Show original English** returns to the family-approved text. Missing credentials, API errors, stale cards, or incomplete/invalid translations leave English available with a message; the app does not present invented placeholder translations as successful results.

AI translation can change meaning even when validation passes. Compare the original and ask the family or an appropriate human interpreter about uncertain wording before relying on it for care decisions. It is not a clinically verified translation or a treatment instruction.

## Family approval and QR sharing

After generating a draft, the family can edit the profile and explicitly approve it. A caregiver visit note may suggest an update, but it does not automatically change the card. The family can approve or reject each suggestion. Revision checks prevent a stale tab from silently overwriting newer changes.

QR sharing provides a real code, a copyable link, and a PNG download. Replacing the QR link retires the previous link. At the app level, anyone with an active link can view the fictional approved profile and submit a note; this is not caregiver authentication. A private hosted Site may additionally require the owner's hosting sign-in.

A QR with `localhost` or `127.0.0.1` works only on the computer serving the app. For a separate phone, see step 5 of **Run it locally**.

## Privacy obligations in British Columbia

The applicable law depends on the organization, its role, and any public-body contract: PIPA commonly applies to private organizations, while FIPPA governs public bodies. The OIPC's [PIPA and AI scribes guidance](https://www.oipc.bc.ca/documents/guidance-documents/3082) expressly distinguishes private healthcare settings from public-body use. Names and health information are not universally prohibited categories; permission to collect, use, or disclose them requires a contextual assessment of authority, meaningful consent where required, purpose, and necessity.

A real implementation would also need vendor and contract review, security controls, retention/deletion rules, and consideration of other professional obligations. Public-body work requires the applicable FIPPA analysis and privacy impact assessment process; see the Province's [PIA guidance](https://www2.gov.bc.ca/gov/content/governments/services-for-government/information-management-technology/privacy/privacy-impact-assessments/complete-a-privacy-impact-assessment). The app's review checkbox, redaction rules, and local audio option do not replace those requirements or establish compliance. The OIPC's [generative AI principles](https://www.oipc.bc.ca/documents/guidance-documents/2811) provide further context on minimizing information and checking outputs.

## Checks and architecture

```sh
npm run typecheck
npm test
npm run build
```

`npm start` previews the built Worker locally after a build. Keep the development server running while trying the demo; stopping it makes its local QR link unavailable.

The app uses React, TypeScript, Vinext/Vite, server API routes, and Cloudflare D1. Local records persist under `.wrangler/state`; hosted D1 is a separate database. `lib/privacy.ts` contains the heuristic text screen, `lib/local-speech.ts` enforces local-only recognition, and `lib/translation.ts` validates Gemini translation responses. Tests cover screening, speech capability handling, translation validation, and profile transitions using fictional or mocked inputs. Live results still require human review.

The login is one shared demo account, not production security. The privacy screen cannot guarantee complete removal, legal compliance, vendor behaviour, or translation accuracy. Do not use real patient information in this MVP.

