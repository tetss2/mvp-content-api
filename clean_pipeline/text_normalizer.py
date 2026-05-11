#!/usr/bin/env python3
"""Conservative OCR and whitespace normalization."""

from __future__ import annotations

import re
from collections import Counter


PAGE_NUMBER_RE = re.compile(r"^\s*(?:-?\s*)?\d{1,4}(?:\s*-)?\s*$")
ROMAN_PAGE_RE = re.compile(r"^\s*[ivxlcdm]{1,8}\s*$", re.IGNORECASE)


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\ufeff", "")
    text = text.replace("\u00ad", "")
    text = text.replace("\u200b", "")
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def is_page_marker(line: str) -> bool:
    value = line.strip()
    if PAGE_NUMBER_RE.match(value) or ROMAN_PAGE_RE.match(value):
        return True
    if re.match(r"^=+\s*page\s+\d{1,4}\s*/\s*\d{1,4}\s*=+$", value, re.IGNORECASE):
        return True
    if re.match(r"^\s*(?:page|стр\.?|страница)\s+\d{1,4}\s*$", value, re.IGNORECASE):
        return True
    return False


def remove_page_markers(text: str) -> tuple[str, int]:
    kept: list[str] = []
    removed = 0
    for line in text.splitlines():
        if is_page_marker(line):
            removed += 1
            continue
        kept.append(line)
    return "\n".join(kept), removed


def remove_repeated_headers_footers(text: str) -> tuple[str, list[str]]:
    lines = text.splitlines()
    normalized = [line.strip() for line in lines if 5 <= len(line.strip()) <= 120]
    counts = Counter(normalized)
    repeated = {
        line
        for line, count in counts.items()
        if count >= 4 and not line.endswith(".") and len(set(line.lower().split())) >= 2
    }
    if not repeated:
        return text, []
    kept = [line for line in lines if line.strip() not in repeated]
    return "\n".join(kept), sorted(repeated)


def repair_ocr_line_breaks(text: str) -> str:
    """Join obvious OCR line wraps while keeping paragraph breaks."""
    paragraphs = re.split(r"\n\s*\n", text)
    repaired: list[str] = []
    for paragraph in paragraphs:
        lines = [line.strip() for line in paragraph.splitlines() if line.strip()]
        if not lines:
            continue
        current = lines[0]
        for line in lines[1:]:
            if current.endswith("-") and line and line[0].islower():
                current = current[:-1] + line
            elif not re.search(r"[.!?;:)]$", current) and line and line[0].islower():
                current += " " + line
            else:
                current += "\n" + line
        repaired.append(current)
    return "\n\n".join(repaired)


def clean_ocr_artifacts(text: str) -> str:
    text = re.sub(r"[~|]{3,}", " ", text)
    text = re.sub(r"[_]{4,}", " ", text)
    text = re.sub(r"\.{5,}", " ... ", text)
    text = re.sub(r"([A-Za-zА-Яа-яЁё])\s+([,.;:!?])", r"\1\2", text)
    text = re.sub(r"\s{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalize_for_cleaning(text: str) -> tuple[str, dict[str, object]]:
    stats: dict[str, object] = {}
    text = normalize_text(text)
    text, page_markers_removed = remove_page_markers(text)
    text, repeated_lines = remove_repeated_headers_footers(text)
    text = repair_ocr_line_breaks(text)
    text = clean_ocr_artifacts(text)
    stats["page_markers_removed"] = page_markers_removed
    stats["repeated_header_footer_lines"] = repeated_lines
    return text, stats
