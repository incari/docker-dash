#!/usr/bin/env python3
"""Move the hand-written CHANGELOG forward at release time.

The changelog is written by hand and its prose is the point, so nothing here
generates text from commits. It only relocates the `[Unreleased]` section under
a version heading and keeps the link references at the bottom in step.

    changelog.py extract              print the [Unreleased] body (for a release note)
    changelog.py release X.Y.Z        move [Unreleased] to [X.Y.Z] - <today>
"""

import datetime
import pathlib
import re
import sys

CHANGELOG = pathlib.Path(__file__).resolve().parent.parent / "CHANGELOG.md"
REPO_URL = "https://github.com/incari/docker-dash"

UNRELEASED_HEADING = "## [Unreleased]"
VERSION_HEADING = re.compile(r"^## \[(\d+\.\d+\.\d+[^\]]*)\]", re.MULTILINE)


def read() -> str:
    return CHANGELOG.read_text(encoding="utf-8")


def split_unreleased(text: str) -> tuple[str, str, str]:
    """Return (before, unreleased body, after) around the [Unreleased] section."""
    start = text.find(UNRELEASED_HEADING)
    if start == -1:
        sys.exit("CHANGELOG.md has no '## [Unreleased]' section")

    body_start = start + len(UNRELEASED_HEADING)

    # The section runs until the next '## ' heading, or the link-reference block.
    next_heading = VERSION_HEADING.search(text, body_start)
    end = next_heading.start() if next_heading else len(text)

    return text[:start], text[body_start:end], text[end:]


def previous_version(text: str) -> str | None:
    match = VERSION_HEADING.search(text)
    return match.group(1) if match else None


def cmd_extract() -> None:
    _, body, _ = split_unreleased(read())
    body = body.strip()
    if not body:
        sys.exit("The [Unreleased] section is empty - nothing to release")
    print(body)


def cmd_release(version: str) -> None:
    text = read()
    before, body, after = split_unreleased(text)

    if not body.strip():
        sys.exit("The [Unreleased] section is empty - nothing to release")

    if f"## [{version}]" in text:
        sys.exit(f"CHANGELOG.md already has a [{version}] section")

    previous = previous_version(after)
    today = datetime.date.today().isoformat()

    new_text = (
        f"{before}{UNRELEASED_HEADING}\n\n"
        f"## [{version}] - {today}\n\n"
        f"{body.strip()}\n\n"
        f"{after.lstrip(chr(10))}"
    )

    # Keep the link references at the bottom pointing at the right ranges.
    new_text = re.sub(
        r"^\[Unreleased\]: .*$",
        f"[Unreleased]: {REPO_URL}/compare/v{version}...HEAD",
        new_text,
        count=1,
        flags=re.MULTILINE,
    )

    link = (
        f"[{version}]: {REPO_URL}/compare/v{previous}...v{version}"
        if previous
        else f"[{version}]: {REPO_URL}/releases/tag/v{version}"
    )
    new_text = re.sub(
        r"^(\[Unreleased\]: .*)$",
        lambda m: f"{m.group(1)}\n{link}",
        new_text,
        count=1,
        flags=re.MULTILINE,
    )

    CHANGELOG.write_text(new_text, encoding="utf-8")
    print(f"CHANGELOG.md: [Unreleased] -> [{version}] - {today}")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)

    command = sys.argv[1]
    if command == "extract":
        cmd_extract()
    elif command == "release":
        if len(sys.argv) != 3:
            sys.exit("usage: changelog.py release X.Y.Z")
        cmd_release(sys.argv[2])
    else:
        sys.exit(f"unknown command: {command}")


if __name__ == "__main__":
    main()
