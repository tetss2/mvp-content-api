#!/usr/bin/env python3
"""Input/output helpers for the local semantic cleaner."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree


SUPPORTED_EXTENSIONS = {".txt", ".md", ".docx"}


def read_source_text(path: Path) -> tuple[str, list[str]]:
    """Read supported source formats without external dependencies."""
    ext = path.suffix.lower()
    warnings: list[str] = []
    if ext in {".txt", ".md"}:
        return path.read_text(encoding="utf-8", errors="ignore"), warnings
    if ext == ".docx":
        try:
            with zipfile.ZipFile(path) as archive:
                raw = archive.read("word/document.xml")
            root = ElementTree.fromstring(raw)
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            paragraphs: list[str] = []
            for paragraph in root.findall(".//w:p", ns):
                pieces = [node.text or "" for node in paragraph.findall(".//w:t", ns)]
                if pieces:
                    paragraphs.append("".join(pieces))
            return "\n\n".join(paragraphs), warnings
        except Exception as exc:  # noqa: BLE001 - batch report instead of hard fail
            warnings.append(f"docx_read_failed:{exc.__class__.__name__}")
            return "", warnings
    warnings.append(f"unsupported_extension:{ext or '<none>'}")
    return "", warnings


def iter_input_files(input_dir: Path) -> list[Path]:
    files: list[Path] = []
    for path in input_dir.rglob("*"):
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS:
            files.append(path)
    return sorted(files)


def write_json(path: Path, payload: dict[str, Any] | list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
