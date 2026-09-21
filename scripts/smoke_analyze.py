#!/usr/bin/env python3
"""Upload every clip in samples/ to a running SiteGuard API and print the scores.

Usage:  python scripts/smoke_analyze.py [--api http://localhost:8000] [--dir samples]
Requires: backend running (uvicorn app.main:create_app --factory) with GEMINI_API_KEY set.
"""

import argparse
import mimetypes
import sys
import time
from pathlib import Path

import httpx

mimetypes.add_type("video/quicktime", ".mov")

MEDIA_SUFFIXES = {".mov", ".mp4", ".webm", ".jpg", ".jpeg", ".png", ".webp"}


def wait_for(client: httpx.Client, analysis_id: str, timeout: float = 600.0) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        detail = client.get(f"/api/analyses/{analysis_id}").json()
        if detail["status"] in ("completed", "failed"):
            return detail
        time.sleep(2)
    raise TimeoutError(analysis_id)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--dir", default="samples")
    args = parser.parse_args()

    clips = sorted(p for p in Path(args.dir).iterdir() if p.suffix.lower() in MEDIA_SUFFIXES)
    if not clips:
        print(f"no media in {args.dir}", file=sys.stderr)
        return 1

    total_in = total_out = 0
    print(
        f"{'file':<14} {'status':<10} {'score':>5} {'resid':>5} {'level':<9} "
        f"{'find':>4} {'ppe':>5} {'tok in':>7} {'tok out':>7}"
    )
    with httpx.Client(base_url=args.api, timeout=60) as client:
        for clip in clips:
            mime = mimetypes.guess_type(clip.name)[0] or "application/octet-stream"
            with clip.open("rb") as fh:
                r = client.post(
                    "/api/analyses",
                    files={"file": (clip.name, fh, mime)},
                    data={"site_name": "smoke"},
                )
            r.raise_for_status()
            analysis_id = r.json()["id"]
            try:
                detail = wait_for(client, analysis_id)
            except TimeoutError:
                print(f"{clip.name:<14} {'timeout':<10} still processing: {analysis_id}")
                continue
            if detail["status"] == "failed":
                print(f"{clip.name:<14} {'failed':<10} {detail['error_message']}")
                continue
            s = detail["scores"]
            ppe = "-" if s["ppe_compliance_rate"] is None else f"{s['ppe_compliance_rate']:.0%}"
            tin, tout = detail["input_tokens"] or 0, detail["output_tokens"] or 0
            total_in += tin
            total_out += tout
            print(
                f"{clip.name:<14} {'completed':<10} {s['risk_score']:>5} {s['residual_score']:>5} "
                f"{s['risk_level']:<9} {len(detail['result']['findings']):>4} {ppe:>5} "
                f"{tin:>7} {tout:>7}"
            )
    print(f"\ntotal tokens: in={total_in} out={total_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
