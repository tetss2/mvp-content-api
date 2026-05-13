async function generateWithOpenAIAdapter({
  systemPrompt,
  finalPrompt,
  model = process.env.GENERATION_SANDBOX_OPENAI_MODEL || "gpt-4o-mini",
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not available for local sandbox generation.");
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: finalPrompt },
    ],
    temperature: 0.7,
  });

  return {
    provider: "openai",
    model,
    output: response.choices?.[0]?.message?.content || "",
    usage: response.usage || null,
    warnings: [],
  };
}

export {
  generateWithOpenAIAdapter,
};
