#!/usr/bin/env python3
"""Manage Open Payments Hackathon AI-policy artifacts (stdlib only).

  ai_rules.py init  [repo]            scaffold AI_USAGE.md and prompts/
  ai_rules.py log   <area> <prompt> [--repo R] [--tool T]   append a verbatim prompt
  ai_rules.py check [repo]            audit compliance (exit 1 on problems)
"""
import argparse
import datetime
import re
import sys
from pathlib import Path

TEMPLATES = Path(__file__).resolve().parent.parent / "templates"
PLACEHOLDER = re.compile(r"<[A-Z_]{3,}>|<Area>|<path/to/file>|<what>|<tool>|<list[^>]*>|<what we changed[^>]*>")
REQUIRED_SECTIONS = ["Tools Used", "Where and How We Used AI", "What We Did Ourselves", "Prompt Log"]


def init(repo: Path) -> int:
    (repo / "prompts").mkdir(parents=True, exist_ok=True)
    target = repo / "AI_USAGE.md"
    if target.exists():
        print(f"skip   {target} (exists)")
    else:
        target.write_text((TEMPLATES / "AI_USAGE.md").read_text(encoding="utf-8"), encoding="utf-8")
        print(f"create {target}")
    keep = repo / "prompts" / "README.md"
    if not keep.exists():
        keep.write_text("# Prompts\n\nOne file per area, containing verbatim prompts. Use `ai_rules.py log`.\n", encoding="utf-8")
    return 0


def log(repo: Path, area: str, prompt: str, tool: str) -> int:
    area = re.sub(r"[^a-zA-Z0-9_-]+", "-", area).strip("-").lower() or "general"
    path = repo / "prompts" / f"{area}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text((TEMPLATES / "prompt-log.md").read_text(encoding="utf-8").replace("<AREA>", area), encoding="utf-8")
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    entry = f"\n## {stamp} - {tool}\n\n```text\n{prompt.rstrip()}\n```\n"
    with path.open("a", encoding="utf-8") as f:
        f.write(entry)
    print(f"logged -> {path}")
    return 0


def check(repo: Path) -> int:
    problems, warnings = [], []
    usage = repo / "AI_USAGE.md"
    text = ""
    if not usage.is_file():
        problems.append("AI_USAGE.md missing at repo root")
    else:
        text = usage.read_text(encoding="utf-8", errors="replace")
        for sec in REQUIRED_SECTIONS:
            if not re.search(rf"^#+\s*{re.escape(sec)}", text, re.M | re.I):
                problems.append(f"AI_USAGE.md lacks section '{sec}'")
        if PLACEHOLDER.search(text):
            problems.append("AI_USAGE.md still contains template placeholders")
        if not re.search(r"[`/\\]\S+\.\w+|\w+\.(ts|js|py|tsx|jsx|php|rs)", text):
            warnings.append("AI_USAGE.md names no specific files/functions")
        if not re.search(r"open[- ]?payments", text, re.I):
            warnings.append("AI_USAGE.md never mentions Open Payments (state which file(s) hold the integration)")

    prompts = repo / "prompts"
    logs = [p for p in prompts.glob("**/*.md") if p.name.lower() != "readme.md"] if prompts.is_dir() else []
    real = [p for p in logs if len(p.read_text(encoding="utf-8", errors="replace").strip().splitlines()) > 3]
    inline = re.search(r"^#+\s*Prompt Log\s*\n(?:(?!^#).*\n){3,}", text, re.M | re.I) and "/prompts" not in text
    if not real and not inline:
        problems.append("no prompt log: add real prompt text under /prompts/*.md (or inline in AI_USAGE.md)")
    for p in logs:
        if p not in real:
            warnings.append(f"{p.relative_to(repo)} looks empty")

    if not any(repo.glob("**/*.env")) and (repo / ".env").exists() and not (repo / ".gitignore").exists():
        warnings.append(".env present without .gitignore - do not commit secrets/private keys")

    for w in warnings:
        print(f"WARN  {w}")
    for p in problems:
        print(f"FAIL  {p}")
    if not problems:
        print("OK    AI policy artifacts look compliant. Still verify the manual checklist in REFERENCE.md.")
    return 1 if problems else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("init", "check"):
        s = sub.add_parser(name)
        s.add_argument("repo", nargs="?", default=".")
    s = sub.add_parser("log")
    s.add_argument("area")
    s.add_argument("prompt")
    s.add_argument("--repo", default=".")
    s.add_argument("--tool", default="AI")
    a = ap.parse_args()
    if a.cmd == "init":
        return init(Path(a.repo))
    if a.cmd == "log":
        return log(Path(a.repo), a.area, a.prompt, a.tool)
    return check(Path(a.repo))


if __name__ == "__main__":
    sys.exit(main())
