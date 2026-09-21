from pathlib import Path

import pytest

from app.services.errors import UnsupportedMediaType
from app.services.storage import ALLOWED_MIME, FileStorage, media_type_for


def test_allowed_mime_table():
    assert ALLOWED_MIME["video/quicktime"] == ".mov"
    assert ALLOWED_MIME["image/jpeg"] == ".jpg"


def test_media_type_for():
    assert media_type_for("image/png") == "image"
    assert media_type_for("video/mp4") == "video"
    with pytest.raises(UnsupportedMediaType):
        media_type_for("application/pdf")


def test_save_writes_file_under_uploads(tmp_path: Path):
    storage = FileStorage(root=tmp_path)
    rel = storage.save("abc", "video/quicktime", b"bytes")
    assert rel == "uploads/abc.mov"
    assert storage.absolute(rel) == tmp_path / "uploads" / "abc.mov"
    assert storage.absolute(rel).read_bytes() == b"bytes"


def test_save_rejects_unknown_mime(tmp_path: Path):
    with pytest.raises(UnsupportedMediaType):
        FileStorage(root=tmp_path).save("abc", "text/plain", b"x")


def test_delete_is_idempotent(tmp_path: Path):
    storage = FileStorage(root=tmp_path)
    rel = storage.save("abc", "image/png", b"x")
    storage.delete(rel)
    assert not storage.absolute(rel).exists()
    storage.delete(rel)  # no error the second time
