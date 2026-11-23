#!/usr/bin/env python3
r"""Stage Basalt, the engine the installer ships: src-tauri/resources/basalt plus basalt-local.json.

    python app/desktop/scripts/stage-basalt.py --src D:\Basalt\basalt-v0.5.6-windows-x64 \
        --config D:\Basalt\basalt_config.json --model D:\Basalt\models\model.basalt
    STRATA_BASALT_SRC=... STRATA_BASALT_CONFIG=... STRATA_BASALT_MODEL=... python app/desktop/scripts/stage-basalt.py
    python app/desktop/scripts/stage-basalt.py --check          # verify what is staged

What lands in `resources/basalt/`: the unpacked Basalt release (bin/, serve/, tools/, data/), minus
__pycache__ and .git, and the profile copied in as `basalt_config.json` with its model path resolved.
`resources/basalt-local.json` then needs no absolute path at all:

    {"config": "basalt/basalt_config.json", "port": 18512,
     "release": "basalt", "python": "control/python/python.exe"}

Every value is relative to the install folder, so the profile travels with the installer. The one thing that may
stay outside is the `.basalt` package itself (model weights are not part of the installer): pass it with `--model`
(or STRATA_BASALT_MODEL). Without `--model` the package named by the source profile is resolved against that
profile's folder, so the copied profile keeps pointing at the same file. A package placed inside the release is
stored relative to the profile and travels too.

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
PROFILE = HERE.parent / "src-tauri" / "resources" / "basalt-local.json"
IGNORE = shutil.ignore_patterns("__pycache__", "*.pyc", ".git")
#: Windows CUDA 13 runtime the 0.5.6 archive leaves out; without them bin/basalt.exe exits with 0xC0000135.
CUDA_DLLS = ("cublas64_13.dll", "cublasLt64_13.dll", "cudart64_13.dll")
CONFIG_IN_BUNDLE = "basalt_config.json"
#: What the host resolves against the install folder (app/host/server/basalt-runtime.mjs).
PROFILE_CONFIG = f"basalt/{CONFIG_IN_BUNDLE}"


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


def stage(src: Path, config: Path, model: Path | None, port: int, python: str) -> None:
    check_source(src)
    data = load_config(config)
    package = package_of(config, data, model)
    if not package.is_file():
        fail(f"the .basalt package is not there: {package} (pass the right path with --model)")
    if not (1024 <= port <= 65535):
        fail("--port must be between 1024 and 65535")
    if not python or Path(python).is_absolute():
        fail("--python must be relative to the install folder, e.g. control/python/python.exe")
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, OUT, ignore=IGNORE)
    try:
        model_value = posix(package.relative_to(OUT))
    except ValueError:
        model_value = posix(package)      # weights stay on this PC: the only path a profile may name absolutely
    data["models"][0]["model"] = model_value
    (OUT / CONFIG_IN_BUNDLE).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    profile = {"config": PROFILE_CONFIG, "port": port, "release": "basalt", "python": python}
    PROFILE.write_text(json.dumps(profile, indent=2) + "\n", encoding="utf-8")
    files, size = tree_summary(OUT)
    print(f"staged Basalt into {OUT}: {files} files, {size / (1 << 20):.0f} MiB")
    print(f"  profile {PROFILE} -> {PROFILE_CONFIG} (model {model_value})")
    print(f"wrote {OUT / CONFIG_IN_BUNDLE}")


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
    if not PROFILE.is_file():
        problems.append(f"the managed profile is not staged: {PROFILE}")
    else:
        try:
            profile = json.loads(PROFILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            problems.append(f"the staged profile is not valid JSON ({error})")
            profile = {}
        for key, kind in (("config", str), ("port", int), ("release", str), ("python", str)):
            if not isinstance(profile.get(key), kind):
                problems.append(f"the staged profile has no {key}")
        if isinstance(profile.get("port"), int) and not (1024 <= profile["port"] <= 65535):
            problems.append("the staged profile's port is outside 1024..65535")
        if profile.get("release") not in (None, "basalt"):
            problems.append("the profile's release must be `basalt` (the folder this script stages)")
        if profile.get("config") != PROFILE_CONFIG:
            problems.append(f"the profile's config must be `{PROFILE_CONFIG}`, not `{profile.get('config')}` (an absolute path does not travel with the installer)")
        if OUT.is_dir():
            staged_config = OUT.parent / str(profile.get("config", ""))
            if not staged_config.is_file():
                problems.append(f"the profile's config is missing next to the release: {staged_config}")
            else:
                try:
                    data = load_config(staged_config)
                    package = package_of(staged_config, data, None)
                    if not package.is_file():
                        print(f"warning: the model package is not on this PC yet: {package}", file=sys.stderr)
                except SystemExit as error:
                    problems.append(str(error))
    if problems:
        for problem in problems:
            print(f"stage-basalt --check: {problem}", file=sys.stderr)
        return 1
    print(f"staged Basalt ok: {files} files, {size / (1 << 20):.0f} MiB, profile {PROFILE}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Stage the Basalt release, its profile and the managed profile the installer ships.")
    ap.add_argument("--src", type=Path, default=os.environ.get("STRATA_BASALT_SRC"), help="unpacked Basalt release (bin/, serve/, tools/)")
    ap.add_argument("--config", type=Path, default=os.environ.get("STRATA_BASALT_CONFIG"), help="Basalt profile with one .basalt package (copied into the install)")
    ap.add_argument("--model", type=Path, default=os.environ.get("STRATA_BASALT_MODEL"), help="the .basalt package; default: the path named by --config, resolved")
    ap.add_argument("--port", type=int, default=int(os.environ.get("STRATA_BASALT_PORT", "18512")), help="loopback port of the managed server (default: 18512)")
    ap.add_argument("--python", default=os.environ.get("STRATA_BASALT_PYTHON", "control/python/python.exe"), help="interpreter path relative to the install folder (default: control/python/python.exe)")
    ap.add_argument("--check", action="store_true", help="verify what is staged and exit")
    args = ap.parse_args()
    if args.check:
        return check_staged()
    if not args.src:
        fail("pass the unpacked Basalt release with --src (or STRATA_BASALT_SRC)")
    src = args.src.expanduser()
    config = args.config.expanduser() if args.config else src.parent / "basalt_config.json"
    stage(src, config, args.model, args.port, args.python)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
