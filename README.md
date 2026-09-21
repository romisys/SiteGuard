# SiteGuard — Construction Site Risk Assessment

Upload a photo or short video of a construction site; Gemini identifies worker PPE gaps, unsafe behaviour and site hazards; SiteGuard scores the risk, shows how much the recommended fixes reduce it, and keeps a history.

## Backend

Requires Python >= 3.11 (on this Mac: `/usr/local/opt/python@3.11/bin/python3.11`).

```bash
cd backend
python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env            # then set GEMINI_API_KEY
uvicorn app.main:create_app --factory --reload --port 8000
```

API docs: http://localhost:8000/docs

`GEMINI_THINKING_BUDGET` (default 2048) caps the model's reasoning tokens per request: `0` disables thinking; higher values are more thorough but slower and costlier.

### Tests

```bash
pytest -q                       # unit + API tests (no network)
pytest -m integration -q -s     # one real Gemini call (needs GEMINI_API_KEY in env)
```

### Smoke test on real footage

Runs from the repo root (the blocks above `cd backend`), with the backend running.

```bash
cd ..                             # back to the repo root
unzip -j Archive.zip "*.mov" -x "__MACOSX/*" -d samples/
python scripts/smoke_analyze.py   # uploads every clip in samples/
```

## Frontend

See `frontend/README.md` (added with the frontend plan).

## Security

Never commit `.env`. If the Gemini key was ever shared in chat or a screenshot, rotate it in Google AI Studio.
