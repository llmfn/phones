"""Generate phone catalogue records from the curated model list.

A one-off dev tool: reads ``data/models.yaml``, drafts a full record per model
with an LLM, validates it against the real catalogue schema, and writes
``data/phones/<id>.json``. Models whose file already exists are skipped, so
the script is idempotent -- edit the list or delete a bad record and re-run,
and only what is missing gets generated.

The LLM is reached through ``claude -p`` (Claude Code headless mode), so a
Claude subscription is enough -- no API key. The LLM drafts only the creative
fields (narrative, specs, signals, variants); deterministic fields (variant
ids, placeholder image URLs) are computed here. The three hand-enriched
records named in ``EXAMPLE_IDS`` serve as few-shot examples, so improving
those files improves every generated record.

Usage:
    uv run python scripts/generate_phones.py --limit 10   # pilot batch
    uv run python scripts/generate_phones.py --only poco-f6,lava-agni-2
    uv run python scripts/generate_phones.py --dry-run    # print a prompt
    uv run python scripts/generate_phones.py              # everything missing
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import yaml
from pydantic import ValidationError

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.catalog import PhoneDoc  # noqa: E402  (needs ROOT on sys.path)

MODELS_FILE = ROOT / "data" / "models.yaml"
PHONES_DIR = ROOT / "data" / "phones"

# The few-shot examples: hand-written records that define the house style.
EXAMPLE_IDS = ["google-pixel-8a", "samsung-a54", "apple-iphone-15"]

# Canonical colour families and the placeholder-image tint per family, kept
# in sync with the hand-migrated records.
FAMILY_HEX = {
    "black": ("26282e", "ffffff"), "white": ("e8e8ea", "333333"),
    "blue": ("2f4f7a", "ffffff"), "green": ("2f6b4f", "ffffff"),
    "red": ("8a3232", "ffffff"), "pink": ("b06a8a", "ffffff"),
    "purple": ("5d4a7a", "ffffff"), "gray": ("5a5e66", "ffffff"),
    "silver": ("c0c4cc", "333333"), "gold": ("b8965a", "333333"),
    "orange": ("b86a2e", "ffffff"), "yellow": ("d4b13f", "333333"),
}

INSTRUCTIONS = f"""\
You are generating one product record for a phone-recommender teaching
dataset. Specs must be plausible for the named model -- close to the real
device is ideal, but certified accuracy is not required; this dataset is its
own source of truth.

Given one curated entry (brand, name, price segment, approximate India launch
price in INR, demo personas, optional notes), reply with a JSON object with
exactly these fields:

- "narrative": one paragraph, 60-120 words, written for semantic search.
  Describe who the phone is for and what it is like to live with, in concrete
  language a buyer might use. If personas are given, make the phone an
  obviously strong match for them without naming them as labels. Vary voice
  and sentence rhythm between records; do not reuse stock phrases from the
  examples. Never use the words "mom", "mother" or "grandma" (a course demo
  depends on a "mom" query matching nothing at the keyword layer) -- say
  "parent" or "older relative" instead.
- "specs": object of 5-8 plausible key specs: display, chipset, battery_mah,
  main_camera_mp, weight_g, os, plus extras like ip_rating or charging when
  notable. Numeric values are JSON numbers, not strings.
- "signals": 3-5 short kebab-case use-case tags (e.g. "camera", "battery",
  "value", "gaming", "compact", "ease-of-use", "long-updates").
- "variants": 1-4 purchasable configurations. Each has "color_name" (the real
  marketing name when known, else plausible), "color_family" (one of:
  {", ".join(FAMILY_HEX)}), "ram_gb", "storage_gb", and "price" in INR near
  the approximate price (higher storage tiers cost more). The FIRST variant
  is the lead configuration a result card shows by default. Use multiple
  colour families when the real phone ships in several.

Do not include "id", "brand", "name", or "image" fields -- the caller adds
those. Output ONLY the JSON object: no markdown fences, no commentary.
"""


def reduced(doc: PhoneDoc) -> dict:
    """A record as the LLM should emit it: creative fields only."""
    return {
        "narrative": doc.narrative,
        "specs": doc.specs,
        "signals": doc.signals,
        "variants": [
            {
                "color_name": v.color_name,
                "color_family": v.color_family,
                "ram_gb": v.ram_gb,
                "storage_gb": v.storage_gb,
                "price": v.price,
            }
            for v in doc.variants
        ],
    }


def entry_text(entry: dict) -> str:
    return json.dumps(entry, ensure_ascii=False)


def build_prompt(entry: dict, examples: list[tuple[dict, dict]]) -> str:
    parts = [INSTRUCTIONS]
    for ex_entry, ex_output in examples:
        parts.append(f"Input: {entry_text(ex_entry)}")
        parts.append(f"Output: {json.dumps(ex_output, ensure_ascii=False)}")
    parts.append(f"Input: {entry_text(entry)}")
    parts.append("Output:")
    return "\n\n".join(parts)


def ask_claude(prompt: str, model: str | None) -> str:
    cmd = ["claude", "-p", prompt, "--output-format", "json"]
    if model:
        cmd += ["--model", model]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if proc.returncode != 0:
        raise RuntimeError(f"claude exited {proc.returncode}: {proc.stderr.strip()[:500]}")
    envelope = json.loads(proc.stdout)
    if envelope.get("is_error"):
        raise RuntimeError(f"claude error: {str(envelope.get('result'))[:500]}")
    return envelope["result"]


def extract_json(reply: str) -> dict:
    """Pull the JSON object out of the reply, tolerating fences/preamble."""
    start, end = reply.find("{"), reply.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("reply contains no JSON object")
    return json.loads(reply[start : end + 1])


def color_slug(color_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", color_name.split()[-1].lower()).strip("-")
    return slug or "color"


def assemble(entry: dict, draft: dict) -> dict:
    """Combine the curated entry with the LLM draft into a full record."""
    pid, name = entry["id"], entry["name"]
    variants = []
    for v in draft["variants"]:
        family = v["color_family"]
        if family not in FAMILY_HEX:
            raise ValueError(f"color_family {family!r} not in {list(FAMILY_HEX)}")
        bg, fg = FAMILY_HEX[family]
        text = f"{name} {v['color_name']}".replace(" ", "+")
        variants.append({
            "id": f"{pid}-{color_slug(v['color_name'])}-{v['storage_gb']}",
            "color_name": v["color_name"],
            "color_family": family,
            "ram_gb": v["ram_gb"],
            "storage_gb": v["storage_gb"],
            "price": v["price"],
            "image": f"https://placehold.co/200x200/{bg}/{fg}?text={text}",
        })
    # Same colour slug + storage at different RAM would collide; disambiguate.
    if len({v["id"] for v in variants}) != len(variants):
        for v in variants:
            v["id"] = f"{pid}-{color_slug(v['color_name'])}-{v['ram_gb']}-{v['storage_gb']}"
    if len({v["id"] for v in variants}) != len(variants):
        raise ValueError("duplicate variants (same colour, RAM and storage)")

    narrative = draft["narrative"]
    if re.search(r"\b(mom|mother|grandma)\b", narrative, re.IGNORECASE):
        raise ValueError('narrative must not contain "mom"/"mother"/"grandma"')

    record = {
        "id": pid,
        "brand": entry["brand"],
        "name": name,
        "narrative": narrative,
        "specs": draft.get("specs", {}),
        "signals": draft.get("signals", []),
        "variants": variants,
    }
    PhoneDoc.model_validate(record)  # fail loudly before anything is written
    return record


def generate(entry: dict, examples, model: str | None, attempts: int = 3) -> dict:
    prompt = build_prompt(entry, examples)
    error = None
    for _ in range(attempts):
        attempt_prompt = prompt
        if error:
            attempt_prompt += (
                f"\n\nYour previous reply was rejected: {error}\n"
                "Reply again with only the corrected JSON object."
            )
        reply = ask_claude(attempt_prompt, model)
        try:
            return assemble(entry, extract_json(reply))
        except (ValueError, KeyError, TypeError, ValidationError) as exc:
            error = str(exc)[:800]
            print(f"  retrying ({error.splitlines()[0][:100]})")
    raise RuntimeError(f"{entry['id']}: failed after {attempts} attempts: {error}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--limit", type=int, help="generate at most N missing records")
    parser.add_argument("--only", help="comma-separated ids to generate (still skips existing)")
    parser.add_argument("--model", help="model passed through to claude (default: CLI default)")
    parser.add_argument("--dry-run", action="store_true", help="print the first prompt and exit")
    args = parser.parse_args()

    models = yaml.safe_load(MODELS_FILE.read_text())
    examples = []
    by_id = {m["id"]: m for m in models}
    for ex_id in EXAMPLE_IDS:
        doc = PhoneDoc.model_validate(json.loads((PHONES_DIR / f"{ex_id}.json").read_text()))
        examples.append((by_id[ex_id], reduced(doc)))

    pending = [m for m in models if not (PHONES_DIR / f"{m['id']}.json").exists()]
    if args.only:
        wanted = set(args.only.split(","))
        unknown = wanted - {m["id"] for m in models}
        if unknown:
            sys.exit(f"unknown ids: {', '.join(sorted(unknown))}")
        pending = [m for m in pending if m["id"] in wanted]
    if args.limit:
        pending = pending[: args.limit]

    if not pending:
        print("Nothing to generate: every requested record already exists.")
        return
    if args.dry_run:
        print(build_prompt(pending[0], examples))
        return

    print(f"Generating {len(pending)} record(s)...")
    failures = []
    for i, entry in enumerate(pending, 1):
        print(f"[{i}/{len(pending)}] {entry['id']}")
        try:
            record = generate(entry, examples, args.model)
        except (RuntimeError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
            failures.append(entry["id"])
            print(f"  FAILED: {str(exc)[:200]}")
            continue
        path = PHONES_DIR / f"{entry['id']}.json"
        path.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
        print(f"  wrote {path.relative_to(ROOT)}")

    done = len(pending) - len(failures)
    print(f"\n{done} written, {len(failures)} failed.")
    if failures:
        print("Failed (re-run to retry just these):", ", ".join(failures))
        sys.exit(1)


if __name__ == "__main__":
    main()
