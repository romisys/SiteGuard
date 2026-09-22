"""The module-level `app` Vercel loads as its handler."""

import importlib

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.main


def test_no_app_instance_off_platform():
    """Importing the module in tests must not build an engine or touch the DB."""
    importlib.reload(app.main)
    assert app.main.app is None


def test_app_instance_on_vercel(monkeypatch, tmp_path):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    try:
        module = importlib.reload(app.main)
        assert isinstance(module.app, FastAPI)
        with TestClient(module.app) as client:
            assert client.get("/api/health").status_code == 200
    finally:
        monkeypatch.undo()
        importlib.reload(app.main)
