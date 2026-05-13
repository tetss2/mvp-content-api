const SUPPORTED_PLATFORMS = ["instagram", "telegram", "generic"];
const SUPPORTED_LENGTHS = ["short", "medium", "long"];
const SUPPORTED_FORMATS = ["post", "carousel_script", "reel_script", "answer", "hook_list"];
const SUPPORTED_CTA_STYLES = ["none", "soft", "direct", "consultative"];
const SUPPORTED_TONES = ["expert_warm", "direct", "empathetic", "provocative", "calm"];

const DEFAULT_OUTPUT_CONSTRAINTS = {
  platform: "generic",
  length: "medium",
  format: "post",
  cta_style: "soft",
  tone: "expert_warm",
};

const INTENT_STRATEGIES = {
  educational_post: {
    goal: "Create a useful expert explanation that helps the reader understand a psychological or sexological topic without overclaiming.",
    recommended_structure: ["hook", "problem framing", "expert explanation", "example", "soft CTA"],
    voice_priorities: ["clarity", "authority", "empathy"],
    context_usage_rules: [
      "Prefer educational and therapeutic-case context as grounding.",
      "Use FAQ context for nuance and likely objections.",
      "Translate source ideas into synthesized expert language rather than close paraphrase.",
    ],
    cta_strategy: "Soft invitation to reflect, save, comment, or book a consultation when appropriate.",
    forbidden_patterns: ["excessive jargon", "diagnosis", "fearmongering", "guaranteed outcomes", "copying long source fragments"],
    quality_checklist: ["clear main thesis", "reader feels respected", "expert nuance is visible", "practical example included", "no unsafe clinical claims"],
  },
  storytelling: {
    goal: "Create emotional identification and trust through a human narrative that leads to expert meaning.",
    recommended_structure: ["situation", "inner conflict", "insight", "expert meaning", "CTA"],
    voice_priorities: ["human tone", "empathy", "narrative flow"],
    context_usage_rules: [
      "Use storytelling and therapeutic-case context for emotional texture.",
      "Keep details generalized unless the source is explicitly public and safe.",
      "Extract patterns and emotional logic rather than reproducing source scenes.",
    ],
    cta_strategy: "Invite recognition, reflection, or a gentle next step without pressure.",
    forbidden_patterns: ["identifiable private details", "melodrama", "shaming", "false intimacy", "unearned certainty"],
    quality_checklist: ["narrative arc is coherent", "insight feels earned", "case details are anonymized", "expert framing is present", "CTA stays ethical"],
  },
  faq_answer: {
    goal: "Answer a concrete reader question directly while preserving safety, nuance, and expert precision.",
    recommended_structure: ["short answer", "nuance", "practical recommendation", "when to seek specialist"],
    voice_priorities: ["clarity", "safety", "precision"],
    context_usage_rules: [
      "Prefer FAQ and educational context.",
      "Use therapeutic context only to explain patterns, not to diagnose the reader.",
      "Highlight uncertainty and specialist referral criteria when the topic is sensitive.",
    ],
    cta_strategy: "Consultative CTA when professional support may be useful; otherwise answer-first with minimal CTA.",
    forbidden_patterns: ["medical diagnosis", "one-size-fits-all prescriptions", "panic framing", "moralizing", "overly broad claims"],
    quality_checklist: ["question is answered early", "limits are explicit", "recommendation is practical", "referral threshold is clear", "tone is calm"],
  },
  sales_post: {
    goal: "Support ethical conversion by connecting a real pain point to an expert solution without aggressive pressure.",
    recommended_structure: ["pain point", "consequence", "expert solution", "trust proof", "CTA"],
    voice_priorities: ["trust", "specificity", "ethical persuasion"],
    context_usage_rules: [
      "Prefer sales context when available, supported by educational or story context.",
      "Use proof points only when the context actually supports them.",
      "Avoid turning therapeutic material into manipulative scarcity or fear.",
    ],
    cta_strategy: "Direct or consultative CTA depending on constraints, with clear next step and no coercion.",
    forbidden_patterns: ["aggressive pressure", "scarcity without basis", "shaming", "guaranteed transformation", "fabricated proof"],
    quality_checklist: ["offer is specific", "reader autonomy is preserved", "benefit is concrete", "trust proof is grounded", "CTA is clear"],
  },
  short_hook: {
    goal: "Capture attention quickly with a compact idea that can lead into a post, reel, carousel, or hook list.",
    recommended_structure: ["punchy statement", "contrast", "myth", "question"],
    voice_priorities: ["brevity", "emotional trigger", "clarity"],
    context_usage_rules: [
      "Use short-hook, storytelling, and sales context for phrasing patterns.",
      "Keep source influence conceptual and brief.",
      "Avoid compressing nuanced clinical material into a misleading claim.",
    ],
    cta_strategy: "Usually none or very soft; the hook should earn attention before asking for action.",
    forbidden_patterns: ["clickbait that distorts meaning", "diagnostic labels as bait", "fear bait", "vague aphorisms", "overlong setup"],
    quality_checklist: ["understandable in one read", "emotionally alive", "not misleading", "ready for platform format", "keeps expert dignity"],
  },
  therapeutic_case: {
    goal: "Explain a pattern through anonymized case logic while protecting confidentiality and generalizing responsibly.",
    recommended_structure: ["case setup", "pattern", "interpretation", "general lesson", "CTA"],
    voice_priorities: ["confidentiality", "ethics", "generalization"],
    context_usage_rules: [
      "Prefer therapeutic-case context and use educational context to explain the pattern.",
      "Remove identifying details and avoid presenting a case as a direct transcript.",
      "Make the lesson general enough for social content and clear enough to be useful.",
    ],
    cta_strategy: "Consultative or soft CTA that encourages reflection and specialist support when needed.",
    forbidden_patterns: ["identifiable details", "voyeuristic case narration", "diagnosis from a post", "client-blaming", "clinical certainty beyond context"],
    quality_checklist: ["case is anonymized", "pattern is clear", "lesson is generalized", "safety boundary is present", "expert tone remains warm"],
  },
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pickAllowed(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function getSupportedIntents() {
  return Object.keys(INTENT_STRATEGIES);
}

function getIntentStrategy(intent) {
  return INTENT_STRATEGIES[intent] || INTENT_STRATEGIES.educational_post;
}

function normalizeOutputPolicy(outputConstraints = {}, strategy = INTENT_STRATEGIES.educational_post) {
  const constraints = {
    ...DEFAULT_OUTPUT_CONSTRAINTS,
    ...outputConstraints,
  };

  const ctaFallback = constraints.cta_style || constraints.cta || DEFAULT_OUTPUT_CONSTRAINTS.cta_style;
  return {
    platform: pickAllowed(constraints.platform, SUPPORTED_PLATFORMS, DEFAULT_OUTPUT_CONSTRAINTS.platform),
    length: pickAllowed(constraints.length, SUPPORTED_LENGTHS, DEFAULT_OUTPUT_CONSTRAINTS.length),
    format: pickAllowed(constraints.format, SUPPORTED_FORMATS, DEFAULT_OUTPUT_CONSTRAINTS.format),
    cta_style: pickAllowed(ctaFallback, SUPPORTED_CTA_STYLES, DEFAULT_OUTPUT_CONSTRAINTS.cta_style),
    tone: pickAllowed(constraints.tone, SUPPORTED_TONES, DEFAULT_OUTPUT_CONSTRAINTS.tone),
    language: constraints.language || "ru",
    final_text_generation: false,
    constraints_summary: {
      platform_rule: "Adapt future text to platform norms without changing source meaning.",
      length_rule: "Treat length as a planning constraint only; no final post is generated here.",
      format_rule: "Use the format to choose section intent and content density.",
      cta_rule: strategy.cta_strategy,
      tone_rule: `Use ${constraints.tone || DEFAULT_OUTPUT_CONSTRAINTS.tone} as a future voice constraint.`,
    },
  };
}

function itemRank(item) {
  return Number(item.selection_rank || item.retrieval_trace?.final_score || 0);
}

function safeSelectedItems(contextPack = {}) {
  return asArray(contextPack.selected_items)
    .filter((item) => item && item.is_generation_safe !== false)
    .sort((a, b) => itemRank(a) - itemRank(b));
}

function selectContextBuckets(contextPack = {}, strategy = INTENT_STRATEGIES.educational_post) {
  const selectedItems = safeSelectedItems(contextPack);
  const primaryContext = selectedItems.slice(0, 2);
  const supportingContext = selectedItems.slice(2, 5);
  const toneStyleContext = selectedItems.filter((item) => (
    item.content_kind === "storytelling"
    || item.content_kind === "short_hook"
    || item.source_type === "telegram_channel"
    || item.source_type === "raw_sample"
  )).slice(0, 2);

  const selectedIds = new Set([...primaryContext, ...supportingContext, ...toneStyleContext].map((item) => item.id));
  const remainingContext = selectedItems.filter((item) => !selectedIds.has(item.id));

  return {
    primary_context: primaryContext.map((item) => summarizeContextItem(item, "primary")),
    supporting_context: supportingContext.map((item) => summarizeContextItem(item, "supporting")),
    tone_style_context: toneStyleContext.map((item) => summarizeContextItem(item, "tone_style")),
    background_context: remainingContext.map((item) => summarizeContextItem(item, "background")),
    suppressed_context: asArray(contextPack.suppressed_items).map((item) => ({
      id: item.id,
      title: item.title,
      source_type: item.source_type,
      content_kind: item.content_kind,
      suppressed_because: item.suppressed_because,
    })),
    preferred_structure: strategy.recommended_structure,
  };
}

function summarizeContextItem(item, role) {
  return {
    id: item.id,
    role,
    title: item.title,
    source_path: item.source_path,
    source_type: item.source_type,
    content_kind: item.content_kind,
    confidence_level: item.confidence_level,
    expert_signal_score: item.expert_signal_score,
    retrieval_trace: item.retrieval_trace,
    selected_because: item.selected_because,
  };
}

function buildContextInjectionPlan(contextPack = {}, strategy = INTENT_STRATEGIES.educational_post) {
  const buckets = selectContextBuckets(contextPack, strategy);
  return {
    ...buckets,
    max_quoted_content_chars_per_item: 280,
    max_total_quoted_content_chars: 900,
    injection_rules: [
      "Use primary context for factual grounding and main expert position.",
      "Use supporting context for nuance, objections, examples, or secondary angles.",
      "Use tone/style context only to influence rhythm, warmth, and framing.",
      "Do not copy long source fragments; quote only short fragments when attribution or wording matters.",
      "Do not use unsafe, suppressed, questionnaire, noisy, or low-score items as generation grounding.",
      "Prefer synthesized output over paraphrase.",
      "Keep retrieval_trace and assembly_trace available for debugging, not for reader-facing text.",
    ],
    safety_exclusions: buckets.suppressed_context.map((item) => ({
      id: item.id,
      title: item.title,
      reasons: item.suppressed_because,
    })),
  };
}

function buildPromptBlueprint({
  expertId,
  generationIntent,
  userRequest,
  strategy,
  contextInjectionPlan,
  outputPolicy,
}) {
  return {
    system_instruction: `You are preparing future Russian expert content for expert_id=${expertId}. Follow the generation plan exactly, but do not invent unsupported expert claims.`,
    expert_voice_instruction: `Use the expert voice constraints: tone=${outputPolicy.tone}; priorities=${strategy.voice_priorities.join(", ")}. Preserve warmth, precision, and ethical boundaries.`,
    generation_strategy_instruction: `Intent=${generationIntent}. Goal: ${strategy.goal}. Recommended structure: ${strategy.recommended_structure.join(" -> ")}. CTA strategy: ${strategy.cta_strategy}.`,
    context_pack_instruction: `Use primary context ids: ${contextInjectionPlan.primary_context.map((item) => item.id).join(", ") || "none"}. Use supporting context ids: ${contextInjectionPlan.supporting_context.map((item) => item.id).join(", ") || "none"}. Tone/style context ids: ${contextInjectionPlan.tone_style_context.map((item) => item.id).join(", ") || "none"}. Avoid suppressed context.`,
    output_constraints_instruction: `Platform=${outputPolicy.platform}; length=${outputPolicy.length}; format=${outputPolicy.format}; CTA=${outputPolicy.cta_style}; language=${outputPolicy.language}. This is a planning blueprint, not final generated text.`,
    safety_instruction: `Avoid: ${strategy.forbidden_patterns.join(", ")}. Do not diagnose, shame, fearmonger, copy long fragments, or use unsafe/suppressed material. Refer to a specialist when appropriate.`,
    final_user_request: userRequest || "",
  };
}

function traceEntry(step, detail = {}) {
  return {
    step,
    at: new Date().toISOString(),
    ...detail,
  };
}

function createGenerationPlan(input = {}) {
  const expertId = input.expert_id || "unknown";
  const generationIntent = INTENT_STRATEGIES[input.generation_intent]
    ? input.generation_intent
    : "educational_post";
  const contextPack = input.context_pack || {};
  const strategy = getIntentStrategy(generationIntent);
  const orchestrationTrace = [];

  orchestrationTrace.push(traceEntry("intent_strategy_selected", {
    generation_intent: generationIntent,
    fallback_used: generationIntent !== input.generation_intent,
  }));

  orchestrationTrace.push(traceEntry("context_pack_received", {
    selected_count: asArray(contextPack.selected_items).length,
    suppressed_count: asArray(contextPack.suppressed_items).length,
    warnings: asArray(contextPack.context_summary?.warnings),
  }));

  const contextInjectionPlan = buildContextInjectionPlan(contextPack, strategy);
  orchestrationTrace.push(traceEntry("primary_context_selected", {
    primary_count: contextInjectionPlan.primary_context.length,
    supporting_count: contextInjectionPlan.supporting_context.length,
    tone_style_count: contextInjectionPlan.tone_style_context.length,
  }));

  orchestrationTrace.push(traceEntry("safety_rules_applied", {
    forbidden_patterns: strategy.forbidden_patterns,
    excluded_context_count: contextInjectionPlan.safety_exclusions.length,
    max_quoted_content_chars_per_item: contextInjectionPlan.max_quoted_content_chars_per_item,
  }));

  const outputPolicy = normalizeOutputPolicy(input.output_constraints, strategy);
  orchestrationTrace.push(traceEntry("output_policy_applied", {
    platform: outputPolicy.platform,
    length: outputPolicy.length,
    format: outputPolicy.format,
    cta_style: outputPolicy.cta_style,
    tone: outputPolicy.tone,
  }));

  const promptBlueprint = buildPromptBlueprint({
    expertId,
    generationIntent,
    userRequest: input.user_request,
    strategy,
    contextInjectionPlan,
    outputPolicy,
  });
  orchestrationTrace.push(traceEntry("prompt_blueprint_created", {
    sections: Object.keys(promptBlueprint),
  }));

  return {
    expert_id: expertId,
    generation_intent: generationIntent,
    generation_strategy: strategy,
    prompt_blueprint: promptBlueprint,
    context_injection_plan: contextInjectionPlan,
    output_policy: outputPolicy,
    orchestration_trace: orchestrationTrace,
  };
}

export {
  DEFAULT_OUTPUT_CONSTRAINTS,
  INTENT_STRATEGIES,
  SUPPORTED_CTA_STYLES,
  SUPPORTED_FORMATS,
  SUPPORTED_LENGTHS,
  SUPPORTED_PLATFORMS,
  SUPPORTED_TONES,
  buildContextInjectionPlan,
  buildPromptBlueprint,
  createGenerationPlan,
  getIntentStrategy,
  getSupportedIntents,
  normalizeOutputPolicy,
};
