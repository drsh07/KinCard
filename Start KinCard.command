#!/bin/zsh
set -e
cd "${0:A:h}"

# Prefer the user's Node; Codex desktop also bundles a suitable runtime.
if command -v node >/dev/null 2>&1; then
  kincard_node="$(command -v node)"
elif [[ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]]; then
  kincard_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  print "Install Node.js 22.13 or later, then open this launcher again."
  exit 1
fi
export PATH="${kincard_node:h}:${kincard_node:h}/../../bin/fallback:$PATH"

if [[ ! -f node_modules/vinext/dist/cli.js ]]; then
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install
  elif command -v npm >/dev/null 2>&1; then
    npm install
  else
    print "Install pnpm or npm, then open this launcher again."
    exit 1
  fi
fi

print "Preparing the fictional KinCard demo…"
"$kincard_node" scripts/setup-db.mjs
print "Open the Local address below. Demo login: family / KinCard2026!"
print "Keep this window open while using KinCard. Press Control-C to stop."
"$kincard_node" scripts/run-framework.mjs dev --hostname 127.0.0.1
