import logging
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from app.services.errors import StorageError, UnsupportedMediaType

log = logging.getLogger(__name__)

ALLOWED_MIME: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
}


def media_type_for(mime_type: str) -> str:
    if mime_type not in ALLOWED_MIME:
        raise UnsupportedMediaType(
            f"Unsupported file type '{mime_type}'. Allowed: {', '.join(sorted(ALLOWED_MIME))}"
        )
    return mime_type.split("/", 1)[0]


class FileStorage:
    """Stores uploaded media on disk under <root>/uploads/<id><ext>."""

    def __init__(self, root: Path):
        self.root = root
        (self.root / "uploads").mkdir(parents=True, exist_ok=True)

    def save(self, analysis_id: str, mime_type: str, data: bytes) -> str:
        media_type_for(mime_type)  # raises if not allowed
        rel = f"uploads/{analysis_id}{ALLOWED_MIME[mime_type]}"
        self.absolute(rel).write_bytes(data)
        return rel

    def absolute(self, rel_path: str) -> Path:
        return self.root / rel_path

    def delete(self, rel_path: str) -> None:
        self.absolute(rel_path).unlink(missing_ok=True)


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
                headers={
                    **self._headers(),
                    "content-type": mime_type,
                    "x-add-random-suffix": "0",
                },
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
            self._http.delete(
                f"{BLOB_API}/delete", json={"urls": [rel_path]}, headers=self._headers()
            )
        except Exception:  # noqa: BLE001 - best effort, matches FileStorage.delete
            log.warning("could not delete blob %s", rel_path)
