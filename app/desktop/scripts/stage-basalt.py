#!/usr/bin/env python3
r"""Stage Basalt, the engine the installer ships: src-tauri/resources/basalt plus basalt-local.json.

    python app/desktop/scripts/stage-basalt.py --src D:\Basalt\basalt-v0.5.6-windows-x64 --config D:\Basalt\basalt_config.json
    STRATA_BASALT_SRC=... STRATA_BASALT_CONFIG=... python app/desktop/scripts/stage-basalt.py
    python app/desktop/scripts/stage-basalt.py --check          # verify what is staged

What lands in `resources/basalt/`: the unpacked Basalt release exactly as published (bin/, serve/, tools/,
data/, docs/, requirements.txt), minus __pycache__ and .git. What lands in `resources/basalt-local.json`:
the managed profile the host reads next to the app's `host` folder:

    {"config": "<absolute path to basalt_config.json>", "port": 18512,
     "release": "basalt", "python": "control/python/python.exe"}

`release` and `python` are relative to the install folder on purpose: the app resolves them there, so the same
profile works in any install directory. `config` stays absolute because the `.basalt` package it names lives on
this machine, not in the installer.

This is a BUILD step: the app never downloads Basalt and never runs pip. Without --src (or STRATA_BASALT_SRC)
the command says what to pass; there is no default release to guess.
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


def fail(message: str) -> "NoReturn":
    raise SystemExit(f"stage-basalt: {message}")


def tree_summary(folder: Path) -> tuple[int, int]:
    files = size = 0
    for path in folder.rglob("*"):
        if path.is_file():
            files += 1
            size += path.stat().st_size
    return files, size


def check_source(src: Path) -> None:
    if not src.is_dir():
        fail(f"the Basalt release folder is not there: {src}")
    engine = src / "bin" / "basalt.exe"
    if not engine.is_file():
        fail(f"not a Basalt release (no bin\basalt.exe): {src}")
    for part in ("serve", "tools"):
        if not (src / part).is_dir():
            fail(f"not a full Basalt release (no {part}): {src}")
    missing = [name for name in CUDA_DLLS if not (src / "bin" / name).is_file()]
    if missing:
        print(f"warning: bin/ has no {', '.join(missing)}; the engine will not start with 0xC0000135", file=sys.stderr)


def check_config(config: Path) -> dict:
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
    package = Path(model.get("model", ""))
    package = package if package.is_absolute() else config.parent / package
    if not package.is_file():
        print(f"warning: the model package is not on this PC yet: {package}", file=sys.stderr)
    return data


def stage(src: Path, config: Path, port: int, python: str) -> None:
    check_source(src)
    check_config(config)
    if not (1024 <= port <= 65535):
        fail("--port must be between 1024 and 65535")
    if not python or Path(python).is_absolute():
        fail("--python must be relative to the install folder, e.g. control/python/python.exe")
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, OUT, ignore=IGNORE)
    profile = {"config": str(config.resolve()).replace("\\", "/"), "port": port, "release": "basalt", "python": python}
    PROFILE.write_text(json.dumps(profile, indent=2) + "\n", encoding="utf-8")
    files, size = tree_summary(OUT)
    print(f"staged Basalt ({config.name}) into {OUT}: {files} files, {size / (1 << 20):.0f} MiB")
    print(f"wrote {PROFILE}")


def check_staged() -> int:
    problems = []
    if not OUT.is_dir():
        problems.append(f"the Basalt release is not staged: {OUT}")
    else:
        for part in ("bin/basalt.exe", "serve", "tools"):
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
        config = Path(profile.get("config", ""))
        if not config.is_file():
            problems.append(f"the profile's config is missing: {config}")
        else:
            try:
                check_config(config)
            except SystemExit as error:
                problems.append(str(error))
        if profile.get("release") not in (None, "basalt"):
            problems.append("the profile's release must be `basalt` (the folder this script stages)")
    if problems:
        for problem in problems:
            print(f"stage-basalt --check: {problem}", file=sys.stderr)
        return 1
    print(f"staged Basalt ok: {files} files, {size / (1 << 20):.0f} MiB, profile {PROFILE}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Stage the Basalt release and managed profile the installer ships.")
    ap.add_argument("--src", type=Path, default=os.environ.get("STRATA_BASALT_SRC"), help="unpacked Basalt release (bin/, serve/, tools/)")
    ap.add_argument("--config", type=Path, default=os.environ.get("STRATA_BASALT_CONFIG"), help="Basalt profile with one .basalt package")
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
    stage(src, config, args.port, args.python)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
