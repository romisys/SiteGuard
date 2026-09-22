# SiteGuard on Vercel — Deployment Plan

**Goal:** Deploy the existing SiteGuard frontend + backend to a single Vercel project (Hobby plan) with GitHub CI/CD, without breaking the 152 existing tests.

**Target:** demo use. Vercel Hobby (free) — 300 s function duration, 2 GB memory, 4.5 MB request body, Blob storage included.

---

## Why the code must change

Vercel functions are **serverless**: the filesystem is ephemeral and any work scheduled after the response is sent may be killed. Three consequences:

| Current | Problem on Vercel | Fix |
|---|---|---|
| SQLite file in `data/` | wiped on every deploy / cold start | Postgres (Neon) |
| Uploads written to `data/uploads/` | same | Vercel Blob |
| `BackgroundTasks` runs `service.run` after the 202 response | function may freeze before it finishes | run the analysis **inside** the request |

Everything else (scoring, Gemini client, schemas, frontend) is unchanged.

## Architecture

One Vercel project, two services, one domain — no CORS:

```json
{
  "services": {
    "web": { "root": "frontend/" },
    "api": { "root": "backend/", "entrypoint": "app.main:app" }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "api" } },
    { "source": "/(.*)",     "destination": { "service": "web" } }
  ]
}
```

`services` is in Beta. If it is not enabled on the account, fall back to **two Vercel projects** (frontend + backend); the code below supports both because the frontend reads `VITE_API_URL` (defaulting to same-origin) and the backend keeps its CORS middleware.

## Principle: local dev and tests keep working

Nothing is replaced — a second implementation is added and selected by environment:

- `DATABASE_URL` set → Postgres. Unset → SQLite under `data/` (current behaviour).
- `BLOB_READ_WRITE_TOKEN` set → Vercel Blob. Unset → local `FileStorage` (current behaviour).
- `SITEGUARD_SYNC_ANALYSIS=1` → analysis runs inside the request. Unset → BackgroundTasks (current behaviour).

All 99 backend and 53 frontend tests must still pass unchanged, plus new tests for the new paths.

---

### Task 1: Settings and Postgres support

**Files:** `backend/app/config.py`, `backend/app/db/session.py`, `backend/pyproject.toml`, `backend/.env.example`
**Test:** `backend/tests/unit/test_config.py`, `backend/tests/unit/test_session.py` (new)

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/unit/test_session.py
from app.db.session import make_engine


def test_sqlite_engine_gets_check_same_thread(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'x.db'}")
    assert engine.dialect.name == "sqlite"


def test_postgres_url_does_not_get_sqlite_connect_args():
    # Must not raise TypeError from passing check_same_thread to psycopg.
    engine = make_engine("postgresql+psycopg://u:p@localhost/db")
    assert engine.dialect.name == "postgresql"
    assert "check_same_thread" not in engine.dialect.create_connect_args(engine.url)[1]


def test_postgres_engine_uses_nullpool():
    from sqlalchemy.pool import NullPool

    engine = make_engine("postgresql+psycopg://u:p@localhost/db")
    assert isinstance(engine.pool, NullPool)
```

Add to `backend/tests/unit/test_config.py`:

```python
def test_database_url_prefers_explicit_env(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@host/db")
    s = Settings(_env_file=None, data_dir=tmp_path)
    # normalised to the psycopg driver SQLAlchemy needs
    assert s.database_url == "postgresql+psycopg://u:p@host/db"


def test_database_url_falls_back_to_sqlite(tmp_path):
    s = Settings(_env_file=None, data_dir=tmp_path)
    assert s.database_url == f"sqlite:///{tmp_path / 'siteguard.db'}"


def test_serverless_flags_default_off(tmp_path):
    s = Settings(_env_file=None, data_dir=tmp_path)
    assert s.blob_token is None
    assert s.sync_analysis is False
```

- [ ] **Step 2: Run, confirm failures**

`pytest tests/unit/test_session.py tests/unit/test_config.py -q`

- [ ] **Step 3: Add settings fields**

In `Settings`:

```python
    database_url_env: str | None = Field(default=None, alias="DATABASE_URL")
    blob_token: str | None = Field(default=None, alias="BLOB_READ_WRITE_TOKEN")
    sync_analysis: bool = Field(default=False, alias="SITEGUARD_SYNC_ANALYSIS")
```

(`Field` from pydantic; keep `populate_by_name=True` in `model_config` so existing keyword construction in tests still works.)

Replace the `database_url` property:

```python
    @property
    def database_url(self) -> str:
        """Postgres when DATABASE_URL is set, else a local SQLite file.

        Neon/Heroku hand out `postgres://` and `postgresql://` URLs; SQLAlchemy 2
        needs an explicit driver, and psycopg 3 is the one we install.
        """
        raw = self.database_url_env
        if not raw:
            return f"sqlite:///{self.data_dir / 'siteguard.db'}"
        for prefix in ("postgres://", "postgresql://"):
            if raw.startswith(prefix):
                return "postgresql+psycopg://" + raw[len(prefix) :]
        return raw
```

- [ ] **Step 4: Make the engine dialect-aware**

`backend/app/db/session.py`:

```python
def make_engine(database_url: str) -> Engine:
    """SQLite needs check_same_thread=False; Postgres on serverless needs NullPool
    (each invocation is a fresh process, so a pool would leak connections)."""
    if database_url.startswith("sqlite"):
        return create_engine(database_url, connect_args={"check_same_thread": False})
    return create_engine(database_url, poolclass=NullPool, pool_pre_ping=True)
```

- [ ] **Step 5: Add the driver dependency**

`backend/pyproject.toml` dependencies: `"psycopg[binary]>=3.2"`.
`backend/.env.example`: add `DATABASE_URL=`, `BLOB_READ_WRITE_TOKEN=`, `SITEGUARD_SYNC_ANALYSIS=`.

- [ ] **Step 6: Run tests**

`pytest -q` → all pass (99 + 6 new = 105).

- [ ] **Step 7: Commit**

```
feat(backend): support Postgres via DATABASE_URL

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 2: Blob storage behind the existing interface

**Files:** `backend/app/services/storage.py`, `backend/app/main.py`
**Test:** `backend/tests/unit/test_blob_storage.py` (new)

`FileStorage` has three methods used by `AnalysisService`: `save(id, mime, data) -> str`, `absolute(rel) -> Path`, `delete(rel)`. The Gemini client only ever reads bytes from the path. Add `BlobStorage` with the same three methods: `save` uploads to Vercel Blob and returns the blob URL; `absolute` downloads the blob to a temp file under `/tmp` and returns that path; `delete` deletes the blob.

- [ ] **Step 1: Write failing tests** (stub the HTTP client, no network)

```python
# backend/tests/unit/test_blob_storage.py
import pytest

from app.services.errors import StorageError, UnsupportedMediaType
from app.services.storage import BlobStorage


class FakeHttp:
    def __init__(self, put_url="https://blob.example/uploads/abc.mov", content=b"bytes"):
        self.put_url, self.content, self.calls = put_url, content, []

    def put(self, url, *, content, headers):
        self.calls.append(("put", url, headers))
        return FakeResponse(200, {"url": self.put_url})

    def get(self, url):
        self.calls.append(("get", url, None))
        return FakeResponse(200, None, self.content)

    def delete(self, url, *, json, headers):
        self.calls.append(("delete", json["urls"][0], headers))
        return FakeResponse(200, {})


class FakeResponse:
    def __init__(self, status, payload, content=b""):
        self.status_code, self._payload, self.content = status, payload, content

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def test_save_uploads_and_returns_blob_url():
    http = FakeHttp()
    storage = BlobStorage(token="tok", http=http)
    url = storage.save("abc", "video/quicktime", b"bytes")
    assert url == "https://blob.example/uploads/abc.mov"
    method, put_url, headers = http.calls[0]
    assert method == "put"
    assert "uploads/abc.mov" in put_url
    assert headers["authorization"] == "Bearer tok"


def test_save_rejects_unknown_mime():
    with pytest.raises(UnsupportedMediaType):
        BlobStorage(token="tok", http=FakeHttp()).save("abc", "text/plain", b"x")


def test_absolute_downloads_to_a_local_path():
    storage = BlobStorage(token="tok", http=FakeHttp(content=b"hello"))
    path = storage.absolute("https://blob.example/uploads/abc.mov")
    assert path.read_bytes() == b"hello"
    assert path.suffix == ".mov"


def test_delete_calls_the_blob_api():
    http = FakeHttp()
    BlobStorage(token="tok", http=http).delete("https://blob.example/uploads/abc.mov")
    assert http.calls[-1][0] == "delete"
    assert http.calls[-1][1] == "https://blob.example/uploads/abc.mov"


def test_delete_never_raises():
    class Boom(FakeHttp):
        def delete(self, url, *, json, headers):
            raise RuntimeError("network down")

    BlobStorage(token="tok", http=Boom()).delete("https://blob.example/x.mov")  # no raise


def test_save_wraps_transport_errors():
    class Boom(FakeHttp):
        def put(self, url, *, content, headers):
            raise RuntimeError("network down")

    with pytest.raises(StorageError):
        BlobStorage(token="tok", http=Boom()).save("abc", "image/png", b"x")
```

- [ ] **Step 2: Run, confirm `ImportError`**

- [ ] **Step 3: Add `StorageError` to `backend/app/services/errors.py`**

```python
class StorageError(ServiceError):
    """Uploading to or reading from blob storage failed."""
```

- [ ] **Step 4: Implement `BlobStorage` in `backend/app/services/storage.py`**

```python
BLOB_API = "https://blob.vercel-storage.com"


class BlobStorage:
    """Vercel Blob implementation of the FileStorage interface.

    `save` returns the blob URL (stored in Analysis.storage_path just like the
    relative path was), `absolute` materialises it under /tmp for the Gemini
    client to read, `delete` removes it.
    """

    def __init__(self, token: str, http=None, cache_dir: Path | None = None):
        import httpx

        self._token = token
        self._http = http or httpx.Client(timeout=120)
        self._cache_dir = cache_dir or Path(tempfile.gettempdir()) / "siteguard-blobs"
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    def _headers(self) -> dict[str, str]:
        return {"authorization": f"Bearer {self._token}", "x-api-version": "7"}

    def save(self, analysis_id: str, mime_type: str, data: bytes) -> str:
        media_type_for(mime_type)  # raises UnsupportedMediaType
        name = f"uploads/{analysis_id}{ALLOWED_MIME[mime_type]}"
        try:
            response = self._http.put(
                f"{BLOB_API}/{name}",
                content=data,
                headers={**self._headers(), "content-type": mime_type, "x-add-random-suffix": "0"},
            )
            response.raise_for_status()
            return response.json()["url"]
        except Exception as exc:  # noqa: BLE001 - normalise transport + API errors
            raise StorageError(f"Could not upload to Blob storage: {exc}") from exc

    def absolute(self, rel_path: str) -> Path:
        target = self._cache_dir / Path(urlparse(rel_path).path).name
        if not target.exists():
            try:
                response = self._http.get(rel_path)
                response.raise_for_status()
                target.write_bytes(response.content)
            except Exception as exc:  # noqa: BLE001
                raise StorageError(f"Could not read from Blob storage: {exc}") from exc
        return target

    def delete(self, rel_path: str) -> None:
        try:
            self._http.delete(f"{BLOB_API}/delete", json={"urls": [rel_path]}, headers=self._headers())
        except Exception:  # noqa: BLE001 - best effort, matches FileStorage.delete
            log.warning("could not delete blob %s", rel_path)
```

Add the imports the file now needs (`tempfile`, `logging`, `urllib.parse.urlparse`) and a module `log`.

- [ ] **Step 5: Select the implementation in `create_app`**

```python
    storage = (
        BlobStorage(token=settings.blob_token)
        if settings.blob_token
        else FileStorage(root=settings.data_dir)
    )
```

Guard the local-only line too, since `/` is read-only on Vercel:

```python
    if not settings.blob_token:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
```

- [ ] **Step 6: Add `httpx` to `backend/pyproject.toml`** runtime dependencies (it is currently dev-only).

- [ ] **Step 7: Run `pytest -q` (111 passing) and commit**

```
feat(backend): add Vercel Blob storage backend

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 3: Synchronous analysis mode

**Files:** `backend/app/api/routes/analyses.py`, `backend/app/main.py`, `backend/app/services/analysis_service.py`
**Test:** `backend/tests/api/test_analyses.py`

In sync mode the POST does the analysis inline and returns the finished record, so nothing depends on work outliving the response. The response shape is unchanged (`CreatedResponse`), so the frontend's existing poll still works — the first GET simply returns `completed`.

- [ ] **Step 1: Write failing tests**

```python
def test_sync_mode_completes_within_the_request(settings, fake_analyzer):
    from app.main import create_app
    from fastapi.testclient import TestClient

    settings.sync_analysis = True
    app = create_app(settings=settings, analyzer=fake_analyzer)
    with TestClient(app) as client:
        created = client.post("/api/analyses", files={"file": PNG}).json()
        assert created["status"] == "completed"
        assert client.get(f"/api/analyses/{created['id']}").json()["status"] == "completed"


def test_sync_mode_reports_failure_in_the_response(settings, fake_analyzer):
    from app.main import create_app
    from app.services.errors import AnalyzerError
    from fastapi.testclient import TestClient

    settings.sync_analysis = True
    fake_analyzer.queue.extend([AnalyzerError("quota"), AnalyzerError("quota")])
    app = create_app(settings=settings, analyzer=fake_analyzer)
    with TestClient(app) as client:
        created = client.post("/api/analyses", files={"file": PNG}).json()
        assert created["status"] == "failed"
```

- [ ] **Step 2: Run, confirm failure** (status is `pending`)

- [ ] **Step 3: Implement**

`AnalysisService` gains a flag set from settings:

```python
    def __init__(self, ..., sync: bool = False, ...):
        self._sync = sync

    @property
    def runs_inline(self) -> bool:
        return self._sync
```

In `create_analysis` and `retry_analysis`, replace the unconditional `background.add_task(...)`:

```python
    if service.runs_inline:
        service.run(analysis.id)                    # blocks; never raises
        analysis = service.get(analysis.id) or analysis
    else:
        background.add_task(service.run, analysis.id)
    return CreatedResponse(id=analysis.id, status=analysis.status)
```

`service.run` is synchronous and already swallows every exception, so the route needs no extra error handling. Because the route is `async def`, wrap the inline call in `run_in_threadpool` so the event loop is not blocked for 60 s.

- [ ] **Step 4: Guard the startup sweep**

`fail_interrupted()` currently fails every `pending`/`processing` row at startup. On serverless there are many cold starts and, in sync mode, a row is only `processing` during its own request — so a concurrent cold start could fail a live analysis. Restrict it to rows older than a cutoff:

```python
INTERRUPTED_AFTER = timedelta(minutes=30)

def fail_interrupted(self, message: str = INTERRUPTED_MESSAGE) -> int:
    cutoff = datetime.now(UTC) - INTERRUPTED_AFTER
    ...  # add `Analysis.created_at < cutoff` to the WHERE clause
```

Update the existing repository/API tests to insert an old `created_at` (they currently rely on "any age"), and add one asserting a fresh `processing` row survives the sweep.

- [ ] **Step 5: Run `pytest -q` and commit**

```
feat(backend): add synchronous analysis mode for serverless

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 4: Vercel entrypoint and project configuration

**Files:** `backend/app/main.py`, `backend/requirements.txt` (new), `vercel.json` (new), `frontend/src/api/client.ts`, `frontend/.env.example` (new), `.gitignore`

- [ ] **Step 1: Export a module-level app**

At the end of `backend/app/main.py`:

```python
# Vercel's Python runtime loads `app` from the module named in vercel.json.
app = create_app() if os.environ.get("VERCEL") else None
```

Guarding on `VERCEL` keeps `import app.main` cheap in tests (no engine, no DB) while giving the platform the variable it needs. Add a test asserting `app.main.app is None` off-platform.

- [ ] **Step 2: Pin Python and dependencies for the build**

`backend/.python-version` → `3.12`. Vercel reads `pyproject.toml` dependencies directly; make sure `psycopg[binary]` and `httpx` are listed and that `excludeFiles` keeps tests out of the bundle.

- [ ] **Step 3: Write `vercel.json` at the repo root**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "services": {
    "web": { "root": "frontend/" },
    "api": {
      "root": "backend/",
      "entrypoint": "app.main:app",
      "excludeFiles": "{tests/**,data/**,.venv/**}"
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "api" } },
    { "source": "/(.*)", "destination": { "service": "web" } }
  ]
}
```

- [ ] **Step 4: Make the frontend API base configurable**

`frontend/src/api/client.ts`:

```ts
// Same-origin by default (Vercel services share a domain); override for a split deploy.
const BASE = import.meta.env.VITE_API_URL ?? (typeof window !== 'undefined' ? window.location.origin : '')
```

Add `frontend/.env.example` with `VITE_API_URL=`. The existing client test must still pass (no env var set in tests → same behaviour as today).

- [ ] **Step 5: Lower the upload limit to fit the platform**

Vercel caps a function request body at **4.5 MB on every plan**. Set `max_upload_bytes` default to `4 * 1024 * 1024` when running on Vercel, and update the Dropzone's copy so the user sees the real limit (it reads `DEFAULT_MAX_BYTES`, so expose the limit through `/api/health` and have the Dropzone use it, or hard-code 4 MB for the demo). Add a test for whichever path is chosen.

- [ ] **Step 6: Run the full suites, commit**

```
feat: add Vercel deployment configuration

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

---

### Task 5: Deploy and verify

Manual, with the user:

- [ ] Create a Neon project, copy the **pooled** connection string.
- [ ] In Vercel: import the GitHub repo `melhem-romisys/SiteGuard`.
- [ ] Create a Blob store in the project (Storage tab) — Vercel injects `BLOB_READ_WRITE_TOKEN`.
- [ ] Set environment variables: `GEMINI_API_KEY`, `GEMINI_THINKING_BUDGET=2048`, `DATABASE_URL`, `SITEGUARD_SYNC_ANALYSIS=1`.
- [ ] Deploy; hit `/api/health` → `{"status":"ok","gemini_configured":true}`.
- [ ] Upload one sample clip through the UI, confirm the report renders.
- [ ] Update `README.md` with the deployment section.

**If `services` is not enabled on the account:** create two projects instead — `frontend/` (Vite preset) and `backend/` (Python) — set `VITE_API_URL` on the frontend to the backend URL and add that URL to `cors_origins`.

---

## Known limitation for the demo

Uploads are capped at **4.5 MB** by the platform. The sample clips (~2 MB) are fine; a long phone video is not. Lifting it requires uploading from the browser straight to Blob and passing the URL to the API — a follow-up, not part of this plan.
