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

```bash
cd frontend && npm install && npm run dev     # http://localhost:5173 (backend must be on :8000)
npm test
```

See `frontend/README.md` for routes, design tokens and the test setup.

## Visual annotations

Gemini returns a bounding box (`box_2d`, normalised 0–1000) for each hazard it
localises. The report uses it twice:

- **Beside every finding**, a still captured from the clip at that hazard's
  timestamp, with a risk-coloured box drawn around it.
- **Over the player**, the same boxes appear while their hazard is on screen,
  with a timeline below marking each one — click a marker to jump there.

Frames are captured in the browser (one off-screen `<video>` seeks through the
timestamps and paints to a `<canvas>`), so there is no ffmpeg and no
server-side image work — which is what lets this run on serverless functions.

Box accuracy is good but not exact: a clear subject gets a tight box, a worker
behind scaffolding can get a loose one. Findings Gemini cannot localise simply
show no still, and the report is otherwise unchanged.

## Deployment

The app runs on Vercel as one project with two services (`vercel.json`): the
Vite frontend and the FastAPI backend on `/api`, sharing a domain. Serverless
means the filesystem is ephemeral, so deployments need:

| Variable | Source |
|---|---|
| `DATABASE_URL` | Neon Postgres (Vercel Storage → Create Database) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store, connected to the project |
| `GEMINI_API_KEY` | Google AI Studio |
| `SITEGUARD_SYNC_ANALYSIS=1` | runs the analysis inside the request, since work scheduled after a response is not guaranteed to finish |

Without `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` the app falls back to SQLite
and local disk, which is what you want locally and fatal on Vercel.

Uploads are capped at 4.5 MB by the platform on every plan. Lifting that means
uploading from the browser straight to Blob and passing the URL to the API.

## Security

Never commit `.env`. If the Gemini key was ever shared in chat or a screenshot, rotate it in Google AI Studio.
