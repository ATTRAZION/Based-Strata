# Strata + Basalt

[Русский](README.md) · English

A local build where **Strata** starts and looks after **Basalt** as its model engine.
Only Strata's interface and its host are changed — so the app can see what Basalt is doing and work with it as its own engine.

Links: [Strata](https://github.com/Niko1221/Strata) · [Basalt](https://github.com/jesdga95/basalt) · [basalt.jgulfo.com](https://basalt.jgulfo.com)

## What happens here

Strata brings the managed Basalt server up on `127.0.0.1:18511`, keeps the `/metrics` key in the process's memory
and reads `/health` and `/metrics` every 1.5 seconds. The readings that used to look empty in a build like this
come from those answers.

## Branches and state

- `basalt-ui-0215` — this build: Strata 0.2.15 with Basalt 0.4.1 integrated, one commit on top of `c775728`.
- `main` — a mirror of upstream Strata, kept so a rebase onto a fresh version can be done later.

The changes were not carried onto upstream's current `main`: several thousand commits sit between `c775728` and
the head of `main`, and moving them means resolving conflicts in the host and on the Monitor screen, with the
interface checked over again afterwards.

## Build and check

```bash
cd apps/host
npm install
npm run build          # dist for the host
npm run typecheck      # tsc --noEmit
node --test --test-timeout=180000 tests/basalt-monitor.test.mjs tests/no-model-chat.test.mjs tests/chat-shortcuts.test.mjs tests/runtime-models.test.mjs
```

The host takes the managed Basalt profile from `basalt-local.json` next to the `host` folder: the path to the
`.basalt` package, the config, the port and the path to Python. The `/metrics` key is created at start and is
never written into the settings; from outside the host `/metrics` stays closed (401) — only the host reads it.
The managed server's log is `managed-basalt.log` in Strata's profile folder.

## What is not here

- No model format or server of our own: the `.basalt` package is served by official Basalt.
- No upstream badges, galleries or sponsor blocks: this is a working build for one machine, not a shop window.
- No results for the `timeskip-real` and `tune-and-timeskip-routes` tests: they need a `strata_cli` module,
  which this environment does not have.

## Licences and authorship

Strata's code — [Niko1221/Strata](https://github.com/Niko1221/Strata), MIT licence (the `LICENSE` file).
The Basalt engine — [jesdga95/basalt](https://github.com/jesdga95/basalt), site [basalt.jgulfo.com](https://basalt.jgulfo.com).
This repository is a personal build and is not connected with the authors of Strata and Basalt; their names and
trademarks belong to them.
