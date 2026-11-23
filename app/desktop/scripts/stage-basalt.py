#!/usr/bin/env python3
r"""Stage Basalt, the engine the installer ships into src-tauri/resources/basalt.

    python app/desktop/scripts/stage-basalt.py --src D:\Basalt\basalt-v0.5.6-windows-x64 \
        --config D:\Basalt\basalt_config.json --model D:\Basalt\models\model.basalt
    STRATA_BASALT_SRC=... STRATA_BASALT_CONFIG=... STRATA_BASALT_MODEL=... python app/desktop/scripts/stage-basalt.py
    python app/desktop/scripts/stage-basalt.py --check          # verify what is staged

What lands in `resources/basalt/`: the unpacked Basalt release (bin/, serve/, tools/, data/) minus __pycache__
and .git, and the profile copied in as `basalt_config.json` with its one model resolved.

No `basalt-local.json` is staged: the app writes it on first start (app/host/server/basalt-profile.mjs), with a
port that is free on that machine and only paths relative to the install folder — `basalt/basalt_config.json`,
`basalt`, `control/python/python.exe` — so the profile names no machine that built the installer.

The `.basalt` package is named in the copied profile by its file name only (or by a path relative to the config when
it sits inside the release). At start the app resolves that name in its own models folder, falling back to a clear
message instead of a crash. Pass the package with `--model` (or STRATA_BASALT_MODEL); without it the path named by
the source profile is used for staging, not for the installed profile.

This is a BUILD step: the app never downloads Basalt and never runs pip.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "src-tauri" / "resources" / "basalt"
IGNORE = shutil.ignore_patterns("__pycache__", "*.pyc", ".git")
#: Windows CUDA 13 runtime the 0.5.6 archive leaves out; without them bin/basalt.exe exits with 0xC0000135.
CUDA_DLLS = ("cublas64_13.dll", "cublasLt64_13.dll", "cudart64_13.dll")
CONFIG_IN_BUNDLE = "basalt_config.json"


def fail(message: str) -> "NoReturn":
    raise SystemExit(f"stage-basalt: {message}")


def tree_summary(folder: Path) -> tuple[int, int]:
    files = size = 0
    for path in folder.rglob("*"):
        if path.is_file():
            files += 1
            size += path.stat().st_size
    return files, size


def posix(path: Path) -> str:
    return path.as_posix()


def check_source(src: Path) -> None:
    if not src.is_dir():
        fail(f"the Basalt release folder is not there: {src}")
    if not (src / "bin" / "basalt.exe").is_file():
        fail(f"not a Basalt release (no bin/basalt.exe): {src}")
    for part in ("serve", "tools"):
        if not (src / part).is_dir():
            fail(f"not a full Basalt release (no {part}/): {src}")
    missing = [name for name in CUDA_DLLS if not (src / "bin" / name).is_file()]
    if missing:
        print(f"warning: bin/ has no {', '.join(missing)}; the engine will not start with 0xC0000135", file=sys.stderr)


def load_config(config: Path) -> dict:
    """The Basalt profile with the one model the managed runtime needs; the package path is resolved separately."""
    if not config.is_file():
        fail(f"the Basalt profile is not there: {config}")
    try:
        data = json.loads(config.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as error:
        fail(f"the Basalt profile is not valid JSON ({error}): {config}")
    models = data.get("models")
    if not isinstance(models, list) or len(models) != 1:
        fail("the managed profile needs exactly one model in `models`")
    model = models[0]
    if not model.get("alias") or not isinstance(model.get("max-context"), (int, float)) or model["max-context"] <= 0:
        fail("the model needs an `alias` and a positive `max-context`")
    return data


def package_of(config: Path, data: dict, model: Path | None) -> Path:
    """Where the `.basalt` package is: --model wins, else the source profile's own path, resolved."""
    declared = model if model else Path(str(data["models"][0].get("model", "")))
    if not str(declared):
        fail("--model is required: the profile names no package")
    declared = declared.expanduser()
    return declared if declared.is_absolute() else (config.parent / declared).resolve()


def stage(src: Path, config: Path, model: Path | None) -> None:
    check_source(src)
    data = load_config(config)
    package = package_of(config, data, model)
    if not package.is_file():
        fail(f"the .basalt package is not there: {package} (pass the right path with --model)")
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, OUT, ignore=IGNORE)
    try:
        model_value = posix(package.relative_to(OUT))
    except ValueError:
        model_value = package.name        # resolved in Strata's models folder at start; never a path of this PC
    data["models"][0]["model"] = model_value
    (OUT / CONFIG_IN_BUNDLE).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    files, size = tree_summary(OUT)
    print(f"staged Basalt into {OUT}: {files} files, {size / (1 << 20):.0f} MiB")
    print(f"  {CONFIG_IN_BUNDLE} (model {model_value}); no basalt-local.json: the app writes it on first start")
    if model_value == package.name:
        print(f"  the package is looked up in Strata's models folder ({package.name}); copy it there before using Basalt")


def check_staged() -> int:
    problems = []
    if not OUT.is_dir():
        problems.append(f"the Basalt release is not staged: {OUT}")
        files = size = 0
    else:
        for part in ("bin/basalt.exe", CONFIG_IN_BUNDLE, "serve", "tools"):
            if not (OUT / part).exists():
                problems.append(f"staged Basalt has no {part}")
        files, size = tree_summary(OUT)
        staged_config = OUT / CONFIG_IN_BUNDLE
        if staged_config.is_file():
            try:
                data = load_config(staged_config)
                package = package_of(staged_config, data, None)
                if not package.is_file():
                    print(f"warning: no package beside the engine; at start {package.name} is looked up in Strata's models folder", file=sys.stderr)
            except SystemExit as error:
                problems.append(str(error))
    if problems:
        for problem in problems:
            print(f"stage-basalt --check: {problem}", file=sys.stderr)
        return 1
    print(f"staged Basalt ok: {files} files, {size / (1 << 20):.0f} MiB (the app writes basalt-local.json on first start)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Stage the Basalt release and its profile; the app writes the managed profile on first start.")
    ap.add_argument("--src", type=Path, default=os.environ.get("STRATA_BASALT_SRC"), help="unpacked Basalt release (bin/, serve/, tools/)")
    ap.add_argument("--config", type=Path, default=os.environ.get("STRATA_BASALT_CONFIG"), help="Basalt profile with one .basalt package (copied into the install)")
    ap.add_argument("--model", type=Path, default=os.environ.get("STRATA_BASALT_MODEL"), help="the .basalt package; default: the path named by --config, resolved")
    ap.add_argument("--check", action="store_true", help="verify what is staged and exit")
    args = ap.parse_args()
    if args.check:
        return check_staged()
    if not args.src:
        fail("pass the unpacked Basalt release with --src (or STRATA_BASALT_SRC)")
    src = args.src.expanduser()
    config = args.config.expanduser() if args.config else src.parent / "basalt_config.json"
    stage(src, config, args.model)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
