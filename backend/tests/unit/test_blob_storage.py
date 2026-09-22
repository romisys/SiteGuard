import pytest

from app.services.errors import StorageError, UnsupportedMediaType
from app.services.storage import BlobStorage


class FakeResponse:
    def __init__(self, status, payload, content=b""):
        self.status_code, self._payload, self.content = status, payload, content

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


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


def test_save_uploads_and_returns_blob_url(tmp_path):
    http = FakeHttp()
    storage = BlobStorage(token="tok", http=http, cache_dir=tmp_path)
    url = storage.save("abc", "video/quicktime", b"bytes")
    assert url == "https://blob.example/uploads/abc.mov"
    method, put_url, headers = http.calls[0]
    assert method == "put"
    assert "uploads/abc.mov" in put_url
    assert headers["authorization"] == "Bearer tok"


def test_save_rejects_unknown_mime(tmp_path):
    with pytest.raises(UnsupportedMediaType):
        storage = BlobStorage(token="tok", http=FakeHttp(), cache_dir=tmp_path)
        storage.save("abc", "text/plain", b"x")


def test_absolute_downloads_to_a_local_path(tmp_path):
    storage = BlobStorage(token="tok", http=FakeHttp(content=b"hello"), cache_dir=tmp_path)
    path = storage.absolute("https://blob.example/uploads/abc.mov")
    assert path.read_bytes() == b"hello"
    assert path.suffix == ".mov"


def test_absolute_caches_the_download(tmp_path):
    http = FakeHttp(content=b"hello")
    storage = BlobStorage(token="tok", http=http, cache_dir=tmp_path)
    first = storage.absolute("https://blob.example/uploads/abc.mov")
    second = storage.absolute("https://blob.example/uploads/abc.mov")
    assert first == second
    assert [c[0] for c in http.calls] == ["get"]


def test_delete_calls_the_blob_api(tmp_path):
    http = FakeHttp()
    BlobStorage(token="tok", http=http, cache_dir=tmp_path).delete(
        "https://blob.example/uploads/abc.mov"
    )
    assert http.calls[-1][0] == "delete"
    assert http.calls[-1][1] == "https://blob.example/uploads/abc.mov"


def test_delete_never_raises(tmp_path):
    class Boom(FakeHttp):
        def delete(self, url, *, json, headers):
            raise RuntimeError("network down")

    BlobStorage(token="tok", http=Boom(), cache_dir=tmp_path).delete("https://blob.example/x.mov")


def test_save_wraps_transport_errors(tmp_path):
    class Boom(FakeHttp):
        def put(self, url, *, content, headers):
            raise RuntimeError("network down")

    with pytest.raises(StorageError):
        BlobStorage(token="tok", http=Boom(), cache_dir=tmp_path).save("abc", "image/png", b"x")


def test_absolute_wraps_transport_errors(tmp_path):
    class Boom(FakeHttp):
        def get(self, url):
            raise RuntimeError("network down")

    with pytest.raises(StorageError):
        BlobStorage(token="tok", http=Boom(), cache_dir=tmp_path).absolute(
            "https://blob.example/uploads/abc.mov"
        )


def test_create_app_selects_blob_storage_when_token_is_set(
    settings, fake_analyzer, monkeypatch, tmp_path
):
    from app.main import create_app
    from app.services import storage as storage_module

    built = {}

    class SpyBlobStorage(storage_module.BlobStorage):
        def __init__(self, token, http=None, cache_dir=None):
            built["token"] = token
            super().__init__(token=token, http=FakeHttp(), cache_dir=cache_dir)

    monkeypatch.setattr("app.main.BlobStorage", SpyBlobStorage)
    settings.blob_token = "tok"
    # Blob deployments use Postgres; point the DB somewhere that is not data_dir.
    settings.database_url_env = f"sqlite:///{tmp_path / 'blob.db'}"
    app = create_app(settings=settings, analyzer=fake_analyzer)
    assert built["token"] == "tok"
    assert isinstance(app.state.service._storage, storage_module.BlobStorage)
    # /tmp-only filesystem on Vercel: create_app must not touch data_dir.
    assert not settings.data_dir.exists()
