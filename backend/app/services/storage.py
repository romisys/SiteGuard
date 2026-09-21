from pathlib import Path

from app.services.errors import UnsupportedMediaType

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
