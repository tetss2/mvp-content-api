#!/usr/bin/env python3
"""Rule definitions for local semantic cleaning."""

from __future__ import annotations

import re


def ru(value: str) -> str:
    return value.encode("ascii").decode("unicode_escape")


TOC_RE = re.compile(
    "|".join(
        [
            ru(r"\u043e\u0433\u043b\u0430\u0432\u043b\u0435\u043d\u0438\u0435"),
            ru(r"\u0441\u043e\u0434\u0435\u0440\u0436\u0430\u043d\u0438\u0435"),
            r"\bcontents\b",
        ]
    ),
    re.IGNORECASE,
)
BIB_RE = re.compile(
    "|".join(
        [
            ru(r"\u0441\u043f\u0438\u0441\u043e\u043a\s+\u043b\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u044b"),
            ru(r"\u043b\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u0430"),
            r"\breferences\b",
            r"\bbibliography\b",
            r"\bdoi\b",
            r"\bisbn\b",
        ]
    ),
    re.IGNORECASE,
)
TEST_RE = re.compile(
    "|".join(
        [
            r"\btest\b",
            ru(r"\b\u0442\u0435\u0441\u0442\w*\b"),
            ru(r"\b\u043e\u043f\u0440\u043e\u0441\u043d\u0438\u043a\w*\b"),
            ru(r"\b\u0430\u043d\u043a\u0435\u0442\w*\b"),
            ru(r"\b\u0448\u043a\u0430\u043b\w*\b"),
            ru(r"\b\u043a\u043b\u044e\u0447\b"),
            ru(r"\b\u0431\u0430\u043b\u043b\w*\b"),
            ru(r"\b\u0438\u043d\u0442\u0435\u0440\u043f\u0440\u0435\u0442\u0430\u0446\w*\b"),
            ru(r"\b\u0432\u044b\u0431\u0435\u0440\u0438\u0442\u0435\s+\u043e\u0442\u0432\u0435\u0442\b"),
            ru(r"\b\u043f\u043e\u0434\u0441\u0447\u0438\u0442\u0430\u0439\u0442\u0435\b"),
            ru(r"\b\u043e\u0431\u0432\u0435\u0434\u0438\u0442\u0435\b"),
        ]
    ),
    re.IGNORECASE,
)
QUESTIONNAIRE_RE = re.compile(
    "|".join(
        [
            ru(r"\b\u043e\u043f\u0440\u043e\u0441\u043d\u0438\u043a\w*\b"),
            ru(r"\b\u0430\u043d\u043a\u0435\u0442\w*\b"),
            ru(r"\b\u0448\u043a\u0430\u043b\w*\b"),
            r"\bsoi\b",
            ru(r"\b\u0441\u0444\u0436\b"),
            ru(r"\b\u0441\u0444\u043c\b"),
        ]
    ),
    re.IGNORECASE,
)
EXERCISE_RE = re.compile(
    "|".join(
        [
            ru(r"\u0443\u043f\u0440\u0430\u0436\u043d\u0435\u043d"),
            ru(r"\u043f\u0440\u0430\u043a\u0442\u0438\u043a"),
            ru(r"\u0437\u0430\u0434\u0430\u043d\u0438"),
            ru(r"\u0434\u043d\u0435\u0432\u043d\u0438\u043a"),
            ru(r"\u0437\u0430\u043f\u0438\u0448\u0438\u0442\u0435"),
            ru(r"\u0441\u0444\u043e\u0440\u043c\u0443\u043b\u0438\u0440\u0443\u0439\u0442\u0435"),
            ru(r"\u0432\u044b\u043f\u043e\u043b\u043d\u0438\u0442\u0435"),
        ]
    ),
    re.IGNORECASE,
)
THEORY_RE = re.compile(
    "|".join(
        [
            ru(r"\u043f\u0441\u0438\u0445\u043e\u0442\u0435\u0440\u0430\u043f"),
            ru(r"\u0441\u0435\u043a\u0441\u043e\u043b\u043e\u0433"),
            ru(r"\u0441\u0435\u043a\u0441\u0443\u0430\u043b"),
            ru(r"\u043e\u0442\u043d\u043e\u0448\u0435\u043d"),
            ru(r"\u043a\u043b\u0438\u043d\u0438\u0447"),
            ru(r"\u0441\u0438\u043c\u043f\u0442\u043e\u043c"),
            ru(r"\u0442\u0435\u0440\u0430\u043f"),
            ru(r"\u043e\u0431\u044a\u044f\u0441\u043d"),
            ru(r"\u0440\u0430\u0437\u0432\u0438\u0442"),
            ru(r"\u043f\u0440\u0438\u0447\u0438\u043d"),
            ru(r"\u0438\u0441\u0441\u043b\u0435\u0434\u043e\u0432"),
            ru(r"\u043f\u0440\u0438\u043c\u0435\u0440"),
        ]
    ),
    re.IGNORECASE,
)

NUMBERED_LINE_RE = re.compile(r"^\s*(?:\d{1,3}[\).:]|[a-zA-Zа-яА-Я][\).:])\s+\S+")
TOC_LINE_RE = re.compile(r".{3,120}\s+\.{2,}\s*\d{1,4}\s*$")
REFERENCE_LINE_RE = re.compile(r"\b(?:19|20)\d{2}\b.*(?:\.|,).{8,}", re.IGNORECASE)
