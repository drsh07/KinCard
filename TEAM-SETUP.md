# Run KinCard with your team

KinCard uses Google Gemini, not the OpenAI API. You do not need Codex, an OpenAI account, or an API key to try the demo.

1. Install Node.js 22.13 or newer (Node 24 was used to test this project). Node includes npm. Restart VS Code after installing Node.
2. Clone the GitHub repository, then open its project folder in VS Code.
3. Open Terminal → New Terminal in that folder and run:

```sh
npm install
npm run setup
npm run dev
```

Keep the terminal open and visit the Local address it prints. The first load can take 20–30 seconds.

Demo login: **family** / **KinCard2026!**.

The setup and development configuration automatically recreate `.openai/hosting.json` if it is missing. Despite its folder name, this is optional Sites hosting metadata, not an OpenAI dependency. Existing hosting configuration is preserved.

No key is required for the local demo fallback. For real Gemini interpretation, each developer may create `.env.local` with `GEMINI_API_KEY` and optionally `GEMINI_MODEL`, then restart the server. Keep actual keys out of GitHub. `.env.example` documents the settings. Use fictional data only.

If npm is not found, Node/npm is not installed or the terminal needs restarting. The Mac launcher can also use the runtime bundled with Codex on machines that have it; teammates can use ordinary Node/npm on macOS, Windows, or Linux.

Each developer has their own local database. This does not share demo data across teammates’ computers. Share the code changes by committing and pushing from GitHub Desktop, then teammates can pull them.
