import "dotenv/config";

process.env.ENABLE_KB_RETRIEVAL = "true";

const { default: OpenAI } = await import("openai");
const { retrieveGroundingContext, estimateKbTokens } = await import("../retrieval_service.js");
const { buildSexologistPrompt, normalizeSexologistStyleKey } = await import("../sexologist_prompt.js");
const { buildAuthorVoicePrompt, loadAuthorVoiceProfile, logAuthorVoiceStatus } = await import("../author_voice.js");
const { getLengthConfig } = await import("../generation_config.js");

const DEFAULT_TOPIC = "Не хочу секса в отношениях, это нормально?";

function parseArgs(argv) {
  const args = {
    topic: "",
    lengthMode: "normal",
    styleKey: "auto",
    callOpenAi: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--call-openai") args.callOpenAi = true;
    else if (arg === "--topic") args.topic = argv[++i] || "";
    else if (arg === "--length") args.lengthMode = argv[++i] || args.lengthMode;
    else if (arg === "--style") args.styleKey = argv[++i] || args.styleKey;
    else if (!arg.startsWith("--")) args.topic = [args.topic, arg].filter(Boolean).join(" ");
  }

  args.topic = args.topic.trim() || DEFAULT_TOPIC;
  args.styleKey = normalizeSexologistStyleKey(args.styleKey);
  return args;
}

function preview(text = "", maxChars = 4000) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trim()}...`;
}

function buildMessages({ topic, context, lengthMode, styleKey, authorVoice }) {
  const lengthConfig = getLengthConfig("sexologist", lengthMode);
  const systemPrompt = [
    buildSexologistPrompt(styleKey),
    buildAuthorVoicePrompt(authorVoice),
  ].filter(Boolean).join("\n\n");

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Тема: "${topic}"\n\nКонтекст:\n${context}\n\n${lengthConfig.instruction} С одной жирной фразой (*жирный*).`,
    },
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const simulatedTelegramMessage = {
    chat: { id: 123456789 },
    text: args.topic,
  };

  const topK = Number(process.env.KB_TOP_K || 5);
  const maxContextTokens = Number(process.env.KB_MAX_CONTEXT_TOKENS || 2500);

  console.log("Full sexologist response prompt test");
  console.log(`Simulated chat_id: ${simulatedTelegramMessage.chat.id}`);
  console.log(`Topic: ${simulatedTelegramMessage.text}`);
  console.log(`Feature flag for this script run: ENABLE_KB_RETRIEVAL=${process.env.ENABLE_KB_RETRIEVAL}`);
  console.log(`KB_TOP_K=${topK}`);
  console.log(`KB_MAX_CONTEXT_TOKENS=${maxContextTokens}`);
  console.log("");

  const retrieval = await retrieveGroundingContext(simulatedTelegramMessage.text, "sexologist", {
    topK,
    maxContextTokens,
  });

  const context = retrieval?.context || `Тема запроса: "${simulatedTelegramMessage.text}". Отвечай на основе общих знаний психолога-сексолога, строго в рамках профессиональной этики. Не выдумывай исследования и статистику.`;
  const authorVoice = await loadAuthorVoiceProfile();
  logAuthorVoiceStatus(authorVoice);
  const messages = buildMessages({
    topic: simulatedTelegramMessage.text,
    context,
    lengthMode: args.lengthMode,
    styleKey: args.styleKey,
    authorVoice,
  });
  const promptPreview = messages
    .map((message) => `--- ${message.role.toUpperCase()} ---\n${message.content}`)
    .join("\n\n");
  const promptTokenEstimate = estimateKbTokens(promptPreview);

  console.log("Retrieved sources:");
  for (const source of retrieval?.sources || []) console.log(`- ${source}`);
  if (!retrieval?.sources?.length) console.log("- none");
  console.log("");
  console.log(`Retrieved chunks: ${retrieval?.chunks?.length || 0}`);
  console.log(`Retrieval context token estimate: ${retrieval?.estimatedTokens || 0}`);
  console.log(`Final prompt token estimate: ${promptTokenEstimate}`);
  console.log("");
  console.log("Final injected prompt preview:");
  console.log(preview(promptPreview));

  if (!args.callOpenAi) return;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.82,
    max_tokens: getLengthConfig("sexologist", args.lengthMode).maxTokens,
  });

  console.log("");
  console.log("OpenAI completion:");
  console.log(completion.choices[0]?.message?.content || "");
}

main().catch((err) => {
  console.error(`Full sexologist response prompt test failed: ${err.message}`);
  process.exit(1);
});
