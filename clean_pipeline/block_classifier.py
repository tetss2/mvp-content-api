#!/usr/bin/env python3
"""Local semantic block classifier for conservative cleaning."""

from __future__ import annotations

import hashlib
import re
from collections import Counter
from dataclasses import dataclass

try:
    from .cleaning_rules import (
        BIB_RE,
        EXERCISE_RE,
        NUMBERED_LINE_RE,
        QUESTIONNAIRE_RE,
        REFERENCE_LINE_RE,
        TEST_RE,
        THEORY_RE,
        TOC_LINE_RE,
        TOC_RE,
    )
    from .section_detector import RawBlock
except ImportError:  # pragma: no cover - direct script execution fallback
    from cleaning_rules import (  # type: ignore
        BIB_RE,
        EXERCISE_RE,
        NUMBERED_LINE_RE,
        QUESTIONNAIRE_RE,
        REFERENCE_LINE_RE,
        TEST_RE,
        THEORY_RE,
        TOC_LINE_RE,
        TOC_RE,
    )
    from section_detector import RawBlock  # type: ignore


@dataclass
class ClassifiedBlock:
    index: int
    text: str
    label: str
    action: str
    confidence: float
    reasons: list[str]
    char_count: int
    heading: str | None = None

    def preview(self, limit: int = 360) -> str:
        compact = re.sub(r"\s+", " ", self.text).strip()
        return compact[:limit]


def _density(count: int, text: str, per_chars: int = 1000) -> float:
    return count / max(len(text) / per_chars, 1.0)


def _line_ratios(text: str) -> tuple[float, float, float]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return 0.0, 0.0, 0.0
    numbered = sum(1 for line in lines if NUMBERED_LINE_RE.match(line))
    toc_lines = sum(1 for line in lines if TOC_LINE_RE.match(line))
    reference_lines = sum(1 for line in lines if REFERENCE_LINE_RE.search(line))
    total = len(lines)
    return numbered / total, toc_lines / total, reference_lines / total


def _ocr_noise_score(text: str) -> float:
    if not text:
        return 1.0
    sample = text[:4000]
    chars = len(sample)
    letters = len(re.findall(r"[A-Za-zА-Яа-яЁё]", sample))
    replacements = sample.count("\ufffd")
    strange_runs = len(re.findall(r"[^A-Za-zА-Яа-яЁё0-9\s.,;:!?()\-\"]{4,}", sample))
    return min(1.0, (1 - letters / max(chars, 1)) * 0.65 + replacements * 0.02 + strange_runs * 0.03)


def _theory_score(text: str) -> float:
    hits = len(THEORY_RE.findall(text))
    sentence_count = max(1, len(re.findall(r"[.!?]", text)))
    avg_sentence_len = len(text) / sentence_count
    narrative_bonus = 0.12 if 55 <= avg_sentence_len <= 260 else 0.0
    return min(1.0, _density(hits, text) / 4 + narrative_bonus)


def classify_blocks(blocks: list[RawBlock]) -> list[ClassifiedBlock]:
    fingerprints: Counter[str] = Counter()
    for block in blocks:
        normalized = re.sub(r"\s+", " ", block.text.lower()).strip()
        if 40 <= len(normalized) <= 600:
            fingerprints[hashlib.sha1(normalized.encode("utf-8", errors="ignore")).hexdigest()] += 1

    classified: list[ClassifiedBlock] = []
    for block in blocks:
        text = block.text
        lower = text.lower()
        reasons: list[str] = []
        numbered_ratio, toc_ratio, reference_ratio = _line_ratios(text)
        theory_score = _theory_score(text)
        noise_score = _ocr_noise_score(text)
        test_hits = len(TEST_RE.findall(lower))
        questionnaire_hits = len(QUESTIONNAIRE_RE.findall(lower))
        exercise_hits = len(EXERCISE_RE.findall(lower))
        bib_hits = len(BIB_RE.findall(lower))
        toc_hits = len(TOC_RE.findall(lower))
        toc_chapter_hits = len(re.findall(r"\b(?:глава|chapter)\s+\d{1,3}", lower, re.IGNORECASE))
        explicit_scoring = bool(
            re.search(
                r"(?:подсчит|суммир|ключ\s+(?:к|теста|опросника)|"
                r"количество\s+балл|балл\w*\s+по\s+шкал|общий\s+балл)",
                lower,
                re.IGNORECASE,
            )
        )
        explicit_exercise_instruction = bool(
            re.search(
                r"(?:выполните|запишите|нарисуйте|выберите|обсудите|разделитесь|"
                r"участник\w*\s+должн|работа\s+в\s+парах|домашнее\s+задание)",
                lower,
                re.IGNORECASE,
            )
        )
        clinical_explanation = bool(
            re.search(
                r"(?:клиент|пациент|терапевт|психотерап|метод|техник|означает|"
                r"помогает|используется|применяется|лечение|терапии)",
                lower,
                re.IGNORECASE,
            )
        )
        duplicate_count = 0

        normalized = re.sub(r"\s+", " ", lower).strip()
        if 40 <= len(normalized) <= 600:
            duplicate_count = fingerprints[hashlib.sha1(normalized.encode("utf-8", errors="ignore")).hexdigest()]

        label = "review_unclear"
        action = "keep"
        confidence = 0.52

        if duplicate_count >= 4 and theory_score < 0.35:
            label = "reject_duplicate_paragraph"
            action = "reject"
            confidence = 0.86
            reasons.append(f"duplicate paragraph repeated {duplicate_count} times")
        elif noise_score >= 0.72 and len(text) < 1200 and theory_score < 0.25:
            label = "reject_ocr_noise"
            action = "reject"
            confidence = 0.82
            reasons.append(f"ocr_noise_score={noise_score:.2f}")
        elif (toc_hits >= 1 and toc_ratio >= 0.25) or toc_ratio >= 0.45 or (toc_chapter_hits >= 3 and len(text) < 3500):
            label = "reject_toc"
            action = "reject"
            confidence = 0.88
            reasons.append(f"toc_ratio={toc_ratio:.2f}, toc_chapter_hits={toc_chapter_hits}")
        elif bib_hits >= 2 and (reference_ratio >= 0.35 or _density(bib_hits, text) >= 5) and theory_score < 0.45:
            label = "reject_bibliography"
            action = "reject"
            confidence = 0.86
            reasons.append(f"bibliography_hits={bib_hits}, reference_ratio={reference_ratio:.2f}")
        elif questionnaire_hits >= 2 and numbered_ratio >= 0.22 and theory_score < 0.5:
            label = "reject_questionnaire"
            action = "reject"
            confidence = 0.84
            reasons.append(f"questionnaire_hits={questionnaire_hits}, numbered_ratio={numbered_ratio:.2f}")
        elif test_hits >= 4 and numbered_ratio >= 0.2 and theory_score < 0.5:
            label = "reject_test"
            action = "reject"
            confidence = 0.83
            reasons.append(f"test_hits={test_hits}, numbered_ratio={numbered_ratio:.2f}")
        elif explicit_scoring and (numbered_ratio >= 0.12 or questionnaire_hits >= 1 or test_hits >= 4) and theory_score < 0.45:
            label = "reject_scoring_key"
            action = "reject"
            confidence = 0.8
            reasons.append(f"explicit scoring markers with test_hits={test_hits}, numbered_ratio={numbered_ratio:.2f}")
        elif (
            exercise_hits >= 3
            and numbered_ratio >= 0.12
            and explicit_exercise_instruction
            and not clinical_explanation
            and theory_score < 0.5
        ):
            label = "reject_exercise"
            action = "reject"
            confidence = 0.78
            reasons.append(
                f"exercise_hits={exercise_hits}, numbered_ratio={numbered_ratio:.2f}, explicit_instruction=true"
            )
        elif theory_score >= 0.55:
            label = "keep_theory"
            confidence = 0.82
            reasons.append(f"theory_score={theory_score:.2f}")
        elif theory_score >= 0.35 and len(text) >= 450:
            label = "keep_clinical"
            confidence = 0.72
            reasons.append(f"theory_score={theory_score:.2f}, substantial narrative block")
        elif len(text) >= 650 and numbered_ratio < 0.25 and noise_score < 0.6:
            label = "keep_narrative"
            confidence = 0.68
            reasons.append("long narrative/explanatory block with low list density")
        else:
            label = "review_unclear"
            confidence = 0.56
            reasons.append("low confidence; kept for manual review")

        if action == "reject" and label not in {"reject_toc", "reject_bibliography"} and theory_score >= 0.55:
            action = "keep"
            label = "review_unclear"
            confidence = 0.58
            reasons.append("rescued because explanatory theory score is high")

        classified.append(
            ClassifiedBlock(
                index=block.index,
                text=text,
                label=label,
                action=action,
                confidence=round(confidence, 2),
                reasons=reasons,
                char_count=len(text),
                heading=block.heading,
            )
        )
    return classified
