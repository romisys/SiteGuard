# SiteGuard — Construction Site Risk Assessment

Upload a photo or short video of a construction site; Gemini identifies worker PPE gaps, unsafe behaviour and site hazards; SiteGuard scores the risk, shows how much the recommended fixes reduce it, and keeps a history.

## Backend

```bash
cd backend
/usr/local/opt/python@3.11/bin/python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env            # then set GEMINI_API_KEY
uvicorn app.main:create_app --factory --reload --port 8000
```

API docs: http://localhost:8000/docs

### Tests

```bash
pytest -q                       # unit + API tests (no network)
pytest -m integration -q -s     # one real Gemini call (needs GEMINI_API_KEY in env)
```

### Smoke test on real footage

```bash
unzip -j Archive.zip "*.mov" -x "__MACOSX/*" -d samples/
python scripts/smoke_analyze.py   # backend must be running
```

## Frontend

See `frontend/README.md` (added with the frontend plan).

## Security

Never commit `.env`. If the Gemini key was ever shared in chat or a screenshot, rotate it in Google AI Studio.
