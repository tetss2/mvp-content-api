const CTA_PATTERNS = [
  /запишитесь\s+на\s+консультац[ию][юи]/gi,
  /приходите\s+на\s+консультац[ию][юи]/gi,
  /напишите\s+мне/gi,
  /оставьте\s+заявку/gi,
  /переходите\s+по\s+ссылке/gi,
  /свяжитесь\s+со\s+мной/gi,
];

const ROBOTIC_TRANSITIONS = [
  [/^\s*таким образом,?\s*/gim, ""],
  [/^\s*в заключени[еи],?\s*/gim, ""],
  [/^\s*следует отметить,?\s*/gim, ""],
  [/^\s*важно понимать,?\s*/gim, "Важно заметить: "],
];

const DISCLAIMER_PATTERNS = [
  /я\s+не\s+являюсь\s+врачом[^\n.?!]*[.?!]/gi,
  /данный\s+текст\s+не\s+является\s+медицинской\s+консультацией[^\n.?!]*[.?!]/gi,
  /обратитесь\s+к\s+квалифицированному\s+специалисту[^\n.?!]*[.?!]/gi,
];

function collapseWhitespace(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function dedupeRepeatedParagraphs(text) {
  const seen = new Set();
  const paragraphs = collapseWhitespace(text).split(/\n{2,}/);
  return paragraphs
    .filter((paragraph) => {
      const key = paragraph.toLowerCase().replace(/\s+/g, " ").slice(0, 220);
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n\n");
}

function limitCtas(text, maxCtas = 1) {
  let ctaCount = 0;
  const paragraphs = collapseWhitespace(text).split(/\n{2,}/);
  const kept = paragraphs.filter((paragraph) => {
    const hasCta = CTA_PATTERNS.some((pattern) => pattern.test(paragraph));
    CTA_PATTERNS.forEach((pattern) => { pattern.lastIndex = 0; });
    if (!hasCta) return true;
    ctaCount += 1;
    return ctaCount <= maxCtas;
  });
  return kept.join("\n\n");
}

function removeRepeatedDisclaimers(text) {
  let disclaimerKept = false;
  let sanitized = text;
  for (const pattern of DISCLAIMER_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      if (disclaimerKept) return "";
      disclaimerKept = true;
      return match;
    });
  }
  return sanitized;
}

function sanitizeRuntimeOutput(text = "", options = {}) {
  const before = String(text || "");
  let sanitized = collapseWhitespace(before)
    .replace(/[•●◆◇■□▪▫]+/g, "-")
    .replace(/[*_`~]{2,}/g, "")
    .replace(/[!?]{3,}/g, "!")
    .replace(/([🙂😉😊😍🔥✨💫❤️❤])(?:\s*\1){1,}/g, "$1");

  for (const [pattern, replacement] of ROBOTIC_TRANSITIONS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  sanitized = removeRepeatedDisclaimers(sanitized);
  sanitized = dedupeRepeatedParagraphs(sanitized);
  sanitized = limitCtas(sanitized, options.maxCtas ?? 1);
  sanitized = collapseWhitespace(sanitized);

  return {
    sanitizedText: sanitized,
    changed: sanitized !== before,
    diagnostics: {
      original_chars: before.length,
      sanitized_chars: sanitized.length,
      removed_chars: Math.max(0, before.length - sanitized.length),
      max_ctas: options.maxCtas ?? 1,
    },
  };
}

export {
  CTA_PATTERNS,
  sanitizeRuntimeOutput,
};
