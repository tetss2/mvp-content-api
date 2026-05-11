#!/usr/bin/env python3
"""Paragraph and section detection for chunk-aware cleaning."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class RawBlock:
    index: int
    text: str
    heading: str | None = None

    @property
    def char_count(self) -> int:
        return len(self.text)


def is_heading(paragraph: str) -> bool:
    value = paragraph.strip()
    if not value or len(value) > 140:
        return False
    if re.match(r"^(?:chapter|part|section|глава|часть|раздел)\b", value, re.IGNORECASE):
        return True
    if re.match(r"^\d{1,2}(?:\.\d{1,2}){0,3}\.?\s+\S+", value):
        return True
    letters = [ch for ch in value if ch.isalpha()]
    if len(letters) >= 4 and value == value.upper():
        return True
    return False


def _split_long_part(part: str, max_chars: int = 1800) -> list[str]:
    lines = [line.strip() for line in part.splitlines() if line.strip()]
    if len(lines) <= 1:
        return [part.strip()] if part.strip() else []
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for line in lines:
        starts_new = is_heading(line) or re.match(r"^\d{1,3}[\).:]\s+\S+", line)
        if current and (starts_new or current_len + len(line) > max_chars):
            chunks.append("\n".join(current).strip())
            current = []
            current_len = 0
        current.append(line)
        current_len += len(line) + 1
    if current:
        chunks.append("\n".join(current).strip())
    return chunks


def split_paragraphs(text: str) -> list[str]:
    parts = re.split(r"\n\s*\n", text)
    paragraphs: list[str] = []
    for part in parts:
        value = re.sub(r"[ \t]+", " ", part).strip()
        if not value:
            continue
        if len(value) > 2600:
            paragraphs.extend(_split_long_part(value))
        else:
            paragraphs.append(value)
    return paragraphs


def build_blocks(text: str, max_chars: int = 2200) -> list[RawBlock]:
    """Build blocks without splitting mid-narrative more than necessary."""
    paragraphs = split_paragraphs(text)
    blocks: list[RawBlock] = []
    current: list[str] = []
    current_heading: str | None = None

    def flush() -> None:
        nonlocal current
        if current:
            blocks.append(RawBlock(index=len(blocks), text="\n\n".join(current), heading=current_heading))
            current = []

    for paragraph in paragraphs:
        if is_heading(paragraph):
            flush()
            current_heading = paragraph
            current = [paragraph]
            continue
        if current and sum(len(item) for item in current) + len(paragraph) > max_chars:
            flush()
        current.append(paragraph)
    flush()
    return blocks
