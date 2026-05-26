from __future__ import annotations

from tongflow.models.asset import Asset
from tongflow.protocol import asset, asset_to_tempfile


def test_tempfile_suffix_from_asset_filename() -> None:
    a = asset(b"fake", mime="audio/mpeg", filename="ref.mp3")
    p = asset_to_tempfile(a)
    try:
        assert p.suffix == ".mp3"
    finally:
        p.unlink()


def test_tempfile_suffix_from_asset_mime_when_no_extension() -> None:
    a = Asset(bytesBase64="Zm9v", mime="audio/mpeg", filename=None)
    p = asset_to_tempfile(a)
    try:
        assert p.suffix == ".mp3"
    finally:
        p.unlink()
