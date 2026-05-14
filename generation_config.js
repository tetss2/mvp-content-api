export const SEXOLOGIST_LENGTH_CONFIG = {
  short: {
    label: "short",
    maxTokens: 280,
    instruction: "Напиши КОРОТКИЙ пост: строго 2 абзаца, до 600 символов. Эмодзи только если звучат естественно: 2-5 на весь текст.",
  },
  normal: {
    label: "normal",
    maxTokens: 560,
    instruction: "Напиши пост: строго 3-4 абзаца, до 1200 символов. Эмодзи только если звучат естественно: 3-6 на весь текст.",
  },
  long: {
    label: "long",
    maxTokens: 1100,
    instruction: "Напиши ДЛИННЫЙ article-style текст: примерно 1800-2400 символов, 6-8 коротких абзацев. Это полноценная мини-статья с мягким вступлением, объяснением причин, практическим взглядом и бережным завершением. Не делай нумерованный список. Эмодзи только если звучат естественно: 4-7 на весь текст.",
  },
};

export const PSYCHOLOGIST_LENGTH_CONFIG = {
  short: {
    maxTokens: 280,
    instruction: "Напиши КОРОТКИЙ пост: строго 2 абзаца, до 600 символов. Эмодзи только если звучат естественно: 2-5 на весь текст.",
  },
  normal: {
    maxTokens: 560,
    instruction: "Напиши пост: строго 3-4 абзаца, до 1200 символов. Эмодзи только если звучат естественно: 3-6 на весь текст.",
  },
  long: {
    maxTokens: 450,
    instruction: "Напиши РАЗВЁРНУТЫЙ пост: 3-4 абзаца, СТРОГО до 1024 символов включая эмодзи. Текст должен быть смыслово завершён и не обрываться. Эмодзи только если звучат естественно: 3-6 на весь текст.",
  },
};

export function getLengthConfig(scenario, lengthMode = "normal") {
  const config = scenario === "sexologist" ? SEXOLOGIST_LENGTH_CONFIG : PSYCHOLOGIST_LENGTH_CONFIG;
  return config[lengthMode] || config.normal;
}
