import "dotenv/config";
import { retrieveGroundingContext } from "../retrieval_service.js";

const DEFAULT_QUERY = "Не хочу секса в отношениях, это нормально?";
const query = process.argv.slice(2).join(" ").trim() || DEFAULT_QUERY;

process.env.ENABLE_KB_RETRIEVAL = "true";

function estimateTokens(text = "") {
  return Math.ceil(text.length / 3.5);
}

function preview(text = "", maxChars = 1800) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trim()}...`;
}

async function main() {
  console.log("Live sexologist retrieval runtime test");
  console.log(`Feature flag: ENABLE_KB_RETRIEVAL=${process.env.ENABLE_KB_RETRIEVAL}`);
  console.log(`Scenario: sexologist`);
  console.log(`Query: ${query}`);
  console.log("");

  const retrieval = await retrieveGroundingContext(query, "sexologist", {
    topK: Number(process.env.KB_RETRIEVAL_TOP_K || 5),
  });

  if (!retrieval?.context) {
    console.log("No retrieval context returned. Runtime fallback would continue normal generation.");
    return;
  }

  console.log(`Retrieved chunks: ${retrieval.chunks.length}`);
  console.log(`Context chars: ${retrieval.context.length}`);
  console.log(`Token estimate: ~${estimateTokens(retrieval.context)}`);
  console.log(`Production version: ${retrieval.productionVersion || "unknown"}`);
  console.log("");

  retrieval.chunks.forEach((chunk) => {
    const source = chunk.source?.source_file
      || chunk.source?.cleaned_file
      || chunk.source?.source_id
      || "unknown";
    console.log(`#${chunk.rank} score=${chunk.score.toFixed(4)} source=${source}`);
    console.log(chunk.text);
    console.log("");
  });

  const injectedContext = [
    "Ниже релевантные фрагменты из production knowledge base. Используй их как grounding, не цитируй дословно без необходимости и не выдумывай факты за пределами контекста.",
    retrieval.context,
  ].join("\n\n");

  console.log("Final injected context preview:");
  console.log(preview(injectedContext));
}

main().catch((err) => {
  console.error(`Live sexologist retrieval runtime test failed: ${err.message}`);
  process.exit(1);
});
