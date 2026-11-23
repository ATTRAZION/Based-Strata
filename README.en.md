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

## Installer with Basalt

The installer is built from four staged components: `control` (Python 3.12.15 and `strata_control`), `harness`,
`basalt` (the engine, its profile and the managed profile) and the UI. None of `control`, `harness` or `basalt` is
in the repository.

```bash
# 1. Control at the matching version (0.1.66 today)
python app/desktop/scripts/stage-control.py

# 2. Basalt 0.5.6, its profile and the model path, in one command
python app/desktop/scripts/stage-basalt.py --src D:\Basalt\basalt-v0.5.6-windows-x64 --config D:\Basalt\basalt_config.json --model D:\Basalt\models\model.basalt

# 3. Harness from a built checkout (pnpm install --frozen-lockfile && pnpm run build:artifacts)
node app/desktop/scripts/stage-harness.mjs --src <path to deepseek-harness>

# 4. The installer itself
cd app/desktop && npm ci && npm run build
```

`stage-basalt.py` copies the unpacked Basalt release (`bin/`, `serve/`, `tools/`, `data/`) and the **profile**
`basalt_config.json` into `app/desktop/src-tauri/resources/basalt`. The installer no longer carries a
`basalt-local.json`: the app writes one on first start (`app/host/server/basalt-profile.mjs`), with a port free on
that machine and only paths inside the install:

```json
{ "config": "basalt/basalt_config.json", "port": 50856, "release": "basalt", "python": "control/python/python.exe" }
```

An older profile with an absolute `config` is replaced at start with such a relative one. When the install folder
is read-only (Program Files), the profile is kept with the user's data. The `.basalt` package path is chosen at
staging time: `--model` (or `STRATA_BASALT_MODEL`); without it, the path from the source profile is used. The
installed profile names the package by file name (or relatively when it sits inside the release). At start the app
looks it up in its own models folder (Settings → Model directory) and, when it is missing, says where to put it
instead of failing to start; model weights are not part of the installer. The release and profile paths come from
`STRATA_BASALT_SRC` / `STRATA_BASALT_CONFIG` / `STRATA_BASALT_MODEL`, or run it from `app/desktop`
as `npm run stage:basalt -- --src ... --config ... --model ...`. `python app/desktop/scripts/stage-basalt.py --check`
verifies a stage.

The whole build on one line (use your own Basalt and Harness paths):

```bash
python app/desktop/scripts/stage-control.py && python app/desktop/scripts/stage-basalt.py --src D:\Basalt\basalt-v0.5.6-windows-x64 --config D:\Basalt\basalt_config.json --model D:\Basalt\models\model.basalt && node app/desktop/scripts/stage-harness.mjs --src <path to deepseek-harness> && cd app/desktop && npm ci && npm run build
```

The finished installer: `app/desktop/src-tauri/target/release/bundle/nsis/BasedStrata_0.2.20_x64-setup.exe`.

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
