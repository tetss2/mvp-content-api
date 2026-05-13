const PRODUCTION_STAGES = [
  "strategy_selection",
  "context_assembly",
  "retrieval_selection",
  "voice_injection",
  "emotional_alignment",
  "CTA_injection",
  "hook_generation",
  "structure_generation",
  "platform_adaptation",
  "anti_repetition_validation",
  "hallucination_risk_validation",
  "output_evaluation",
  "packaging",
];

const OUTPUT_FORMATS = [
  "instagram_post",
  "telegram_longread",
  "reels_script",
  "carousel_script",
  "story_sequence",
  "faq_answer",
  "authority_post",
  "emotional_story",
  "sales_post",
  "educational_post",
  "consultation_cta_post",
];

const HOOK_TYPES = [
  "emotional_hook",
  "curiosity_hook",
  "authority_hook",
  "therapeutic_hook",
  "pain_point_hook",
  "controversial_hook",
  "story_hook",
  "short_form_hook",
  "reels_hook",
];

const STRUCTURES = {
  simple_insight: ["hook", "insight", "CTA"],
  story_resolution: ["story", "conflict", "resolution"],
  authority_trust: ["authority", "education", "trust CTA"],
  myth_reframe: ["myth", "explanation", "expert framing"],
  therapeutic_validation: ["emotional validation", "therapeutic insight"],
  faq_clarification: ["FAQ", "expert clarification"],
  objection_reframe: ["objection", "reframe", "low-pressure CTA"],
};

const PLATFORM_ADAPTATION_RULES = {
  instagram_post: {
    ideal_length: "900-1300 chars",
    pacing: "compact emotional opening, clear body, visible CTA",
    paragraph_density: "medium",
    emotional_rhythm: "warm -> insight -> saveable idea",
    cta_placement: "final paragraph",
    readability: "short paragraphs",
  },
  telegram_longread: {
    ideal_length: "1800-3200 chars",
    pacing: "slow build, deeper explanation, reflective CTA",
    paragraph_density: "high",
    emotional_rhythm: "recognition -> teaching -> integration",
    cta_placement: "soft ending",
    readability: "sectioned longread",
  },
  reels_script: {
    ideal_length: "35-55 seconds",
    pacing: "fast hook, one idea, spoken beats",
    paragraph_density: "low",
    emotional_rhythm: "pattern interrupt -> insight -> action",
    cta_placement: "last 4 seconds",
    readability: "spoken script",
  },
  carousel_script: {
    ideal_length: "6-8 slides",
    pacing: "slide-by-slide reveal",
    paragraph_density: "very low per slide",
    emotional_rhythm: "hook -> steps -> expert reframe",
    cta_placement: "last slide",
    readability: "scannable slides",
  },
  story_sequence: {
    ideal_length: "4-6 story frames",
    pacing: "micro beats with interaction",
    paragraph_density: "very low",
    emotional_rhythm: "question -> reflection -> response prompt",
    cta_placement: "final frame",
    readability: "tap-through friendly",
  },
};

const GENERIC_AI_PATTERNS = [
  "it is important to understand",
  "in today's world",
  "unlock your potential",
  "take your life to the next level",
  "as an ai",
  "delve into",
  "journey of self-discovery",
  "it should be noted",
  "в современном мире",
  "важно понимать",
  "следует отметить",
  "раскройте свой потенциал",
];

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

function pick(items, index) {
  return items[index % items.length];
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "_")
    .replace(/^_+|_+$/g, "");
}

function inferOutputFormat(node) {
  if (node.platform === "telegram_longread") return "telegram_longread";
  if (node.platform === "reels_script") return "reels_script";
  if (node.platform === "carousel_concept" || node.intent === "carousel") return "carousel_script";
  if (node.platform === "story_sequence") return "story_sequence";
  if (node.intent === "FAQ") return "faq_answer";
  if (node.intent === "authority") return "authority_post";
  if (node.intent === "storytelling") return "emotional_story";
  if (node.intent === "sales" || node.intent === "soft_sales") return "sales_post";
  if (node.cta_type === "consultation_cta") return "consultation_cta_post";
  return "educational_post";
}

function chooseStructure(node) {
  if (node.intent === "storytelling") return "story_resolution";
  if (node.intent === "authority") return "authority_trust";
  if (node.intent === "FAQ") return "faq_clarification";
  if (node.intent === "objection_handling") return "objection_reframe";
  if (node.emotional_frame === "recognition" || node.intent === "therapeutic") return "therapeutic_validation";
  if (node.hook_pattern === "myth_reframe") return "myth_reframe";
  return "simple_insight";
}

function generateHookVariants(node, priorHooks = []) {
  const base = node.topic;
  const variants = HOOK_TYPES.map((type, index) => {
    const templates = {
      emotional_hook: `Когда тема "${base}" задевает сильнее, чем кажется`,
      curiosity_hook: `Почему "${base}" часто начинается не там, где мы ищем причину`,
      authority_hook: `Как специалист смотрит на "${base}" без стыда и давления`,
      therapeutic_hook: `Если в "${base}" много напряжения, начните с этого наблюдения`,
      pain_point_hook: `Что делать, когда "${base}" снова возвращает тревогу`,
      controversial_hook: `Непопулярная мысль про "${base}": дело не только в силе воли`,
      story_hook: `Одна ситуация про "${base}", в которой многие узнают себя`,
      short_form_hook: `"${base}" — это не всегда про проблему в отношениях`,
      reels_hook: `3 признака, что "${base}" требует мягкого внимания`,
    };
    const text = templates[type];
    return {
      hook_id: `${node.node_id}_hook_${index + 1}`,
      hook_type: type,
      text,
      fatigue_risk: priorHooks.includes(text) ? "high" : "low",
      predicted_effectiveness: round(0.72 + ((index % 4) * 0.045) - (priorHooks.includes(text) ? 0.24 : 0)),
    };
  });

  return {
    selected_hook: variants.find((hook) => hook.fatigue_risk === "low") || variants[0],
    variants,
    hook_repetition_warnings: variants
      .filter((hook) => hook.fatigue_risk !== "low")
      .map((hook) => ({
        warning: "hook_repetition",
        hook_type: hook.hook_type,
        text: hook.text,
      })),
  };
}

function generateCtaVariants(node) {
  const topic = node.topic;
  const variants = {
    soft_cta: `Сохраните это как мягкое напоминание, если тема "${topic}" вам близка.`,
    educational_cta: `Отметьте, какой пункт про "${topic}" хочется разобрать глубже.`,
    emotional_cta: `Если откликнулось, можно просто заметить это без спешки и давления.`,
    consultation_cta: `Если хочется разобрать вашу ситуацию бережно и точнее, можно прийти на консультацию.`,
    dm_cta: `Можно написать в личные сообщения слово "разбор", если нужен следующий шаг.`,
    save_share_cta: `Сохраните или отправьте тому, кому сейчас важно услышать это спокойно.`,
    trust_cta: `Вернитесь к этому тексту позже и посмотрите, что изменится в ощущениях.`,
    low_pressure_cta: `Пока достаточно просто понаблюдать, где эта тема проявляется у вас.`,
  };
  const selected = variants[node.cta_type] || variants.low_pressure_cta;
  return {
    selected_cta: {
      cta_type: node.cta_type,
      text: selected,
      escalation_level: escalationLevel(node.cta_type),
    },
    variants: Object.entries(variants).map(([cta_type, text]) => ({
      cta_type,
      text,
      escalation_level: escalationLevel(cta_type),
    })),
  };
}

function escalationLevel(ctaType) {
  const levels = {
    low_pressure_cta: 1,
    save_share_cta: 1,
    educational_cta: 2,
    emotional_cta: 2,
    trust_cta: 3,
    soft_cta: 3,
    dm_cta: 4,
    consultation_cta: 5,
  };
  return levels[ctaType] || 1;
}

function assembleContext(node) {
  return {
    context_pack_id: `${node.node_id}_simulated_context`,
    retrieval_namespace: `${node.expert_id}_main`,
    selected_context: [
      {
        role: "strategic_topic_anchor",
        topic: node.topic,
        source: "campaign_plan_node",
      },
      {
        role: "audience_state_anchor",
        audience_state: node.audience_state,
        source: "audience_progression_plan",
      },
    ],
    suppressed_context: [],
    local_only: true,
  };
}

function buildStructure(node) {
  const structureId = chooseStructure(node);
  return {
    structure_id: structureId,
    beats: STRUCTURES[structureId],
    structure_notes: [
      `Intent: ${node.intent}`,
      `Audience state: ${node.audience_state}`,
      `Campaign stage: ${node.campaign_stage}`,
    ],
  };
}

function makeBodyBlocks(node, structure, hook, cta) {
  const topic = node.topic;
  const bodyByBeat = structure.beats.map((beat, index) => ({
    block_type: "structure_beat",
    beat,
    text: `${beat}: ${beat === "authority" ? "Важно понимать: " : ""}связать "${topic}" с ${node.emotional_frame}, уровнем аудитории ${node.audience_state} и позицией эксперта "${node.expert_positioning}".`,
    order: index + 1,
  }));

  return [
    { block_type: "hook", text: hook.text },
    ...bodyByBeat,
    { block_type: "cta", text: cta.text },
  ];
}

function adaptPlatformOutput({ node, outputFormat, hook, cta, structure }) {
  const platform = node.platform === "carousel_concept" ? "carousel_script" : node.platform;
  const rules = PLATFORM_ADAPTATION_RULES[platform] || PLATFORM_ADAPTATION_RULES.instagram_post;
  const blocks = makeBodyBlocks(node, structure, hook, cta);
  const title = `${node.topic}: ${node.intent}`;

  return {
    output_id: `${node.node_id}_${outputFormat}`,
    output_format: outputFormat,
    source_platform: node.platform,
    title,
    ideal_length: rules.ideal_length,
    pacing: rules.pacing,
    paragraph_density: rules.paragraph_density,
    emotional_rhythm: rules.emotional_rhythm,
    cta_placement: rules.cta_placement,
    readability: rules.readability,
    content_blocks: blocks,
    production_status: "simulation_artifact",
  };
}

function createSecondaryAdaptations(node, primaryOutput, hookVariants, ctaVariants) {
  const formats = ["instagram_post", "telegram_longread", "reels_script", "carousel_script", "story_sequence"]
    .filter((format) => format !== primaryOutput.output_format)
    .slice(0, 4);

  return formats.map((format, index) => {
    const platformKey = format === "carousel_script" ? "carousel_script" : format;
    const rules = PLATFORM_ADAPTATION_RULES[platformKey] || PLATFORM_ADAPTATION_RULES.instagram_post;
    return {
      output_format: format,
      adaptation_note: `Adapt ${primaryOutput.title} into ${format} using ${rules.pacing}.`,
      hook: hookVariants[index + 1]?.text || hookVariants[0].text,
      cta: ctaVariants[index + 1]?.text || ctaVariants[0].text,
      ideal_length: rules.ideal_length,
      readability: rules.readability,
    };
  });
}

function suppressGenericAI(output) {
  const warnings = [];
  const sanitizedBlocks = output.content_blocks.map((block) => {
    let text = block.text;
    for (const pattern of GENERIC_AI_PATTERNS) {
      const regex = new RegExp(pattern, "gi");
      if (regex.test(text)) {
        warnings.push({
          warning: "generic_ai_phrase_detected",
          pattern,
          block_type: block.block_type,
        });
        text = text.replace(regex, "").replace(/\s{2,}/g, " ").trim();
      }
    }
    return { ...block, text };
  });

  return {
    sanitized_output: {
      ...output,
      content_blocks: sanitizedBlocks,
    },
    warnings,
  };
}

function validateAntiRepetition(pack, previousPacks = []) {
  const previousHooks = previousPacks.map((item) => item.hook_intelligence.selected_hook.text);
  const previousCtas = previousPacks.slice(-3).map((item) => item.cta_variants.selected_cta.cta_type);
  const warnings = [];
  if (previousHooks.includes(pack.hook_intelligence.selected_hook.text)) {
    warnings.push({
      warning: "selected_hook_repeated",
      text: pack.hook_intelligence.selected_hook.text,
    });
  }
  if (previousCtas.length >= 2 && previousCtas.every((cta) => cta === pack.cta_variants.selected_cta.cta_type)) {
    warnings.push({
      warning: "cta_escalation_repetition",
      cta_type: pack.cta_variants.selected_cta.cta_type,
    });
  }
  return warnings;
}

function estimateHallucinationRisk(pack) {
  const hasContext = pack.context_assembly.selected_context.length > 0;
  const riskyIntent = ["sales", "authority"].includes(pack.strategy_node.intent);
  const risk = !hasContext ? "medium" : riskyIntent ? "low_medium" : "low";
  return {
    risk,
    checks: [
      "No external factual claims generated.",
      "Context is simulated from campaign node only.",
      "Output remains a structured artifact, not a final expert claim.",
    ],
  };
}

function scoreProductionPack(pack) {
  const warnings = [
    ...pack.ai_suppression.warnings,
    ...pack.anti_repetition_warnings,
  ];
  const hallucinationPenalty = pack.hallucination_risk.risk === "low" ? 0 : 0.06;
  const genericPenalty = Math.min(0.18, pack.ai_suppression.warnings.length * 0.04);
  const repetitionPenalty = Math.min(0.16, pack.anti_repetition_warnings.length * 0.05);
  const ctaQuality = pack.cta_variants.selected_cta.escalation_level <= 5 ? 0.86 : 0.7;
  const engagement = pack.hook_intelligence.selected_hook.predicted_effectiveness;

  const score = {
    style_similarity: round(0.82 - genericPenalty),
    emotional_match: round(0.84 - repetitionPenalty / 2),
    clarity: round(0.88 - hallucinationPenalty),
    readability: round(0.86),
    expert_authenticity: round(0.83 - genericPenalty),
    ai_generic_risk: round(genericPenalty + (warnings.length ? 0.08 : 0.02)),
    hallucination_risk: pack.hallucination_risk.risk,
    cta_quality: round(ctaQuality),
    engagement_potential: round(engagement - repetitionPenalty),
  };
  score.overall_score = round((
    score.style_similarity
    + score.emotional_match
    + score.clarity
    + score.readability
    + score.expert_authenticity
    + score.cta_quality
    + score.engagement_potential
    - score.ai_generic_risk
  ) / 7);
  return score;
}

function buildNarrativeSync(node, previousPack = null) {
  return {
    cross_format_continuity: true,
    emotional_tone: node.emotional_frame,
    cta_escalation_level: escalationLevel(node.cta_type),
    audience_state: node.audience_state,
    storytelling_continuity: {
      current_structure: node.storytelling_structure,
      depends_on: node.depends_on,
      previous_pack_id: previousPack?.pack_id || null,
    },
    sync_notes: [
      `Keep ${node.emotional_frame} consistent across all adaptations.`,
      `Preserve audience state ${node.audience_state} across pack variants.`,
      `CTA escalation must stay at level ${escalationLevel(node.cta_type)} for this node.`,
    ],
  };
}

function createProductionPack(node, previousPacks = []) {
  const priorHooks = previousPacks.map((pack) => pack.hook_intelligence.selected_hook.text);
  const context = assembleContext(node);
  const hookIntelligence = generateHookVariants(node, priorHooks);
  const ctaVariants = generateCtaVariants(node);
  const structure = buildStructure(node);
  const outputFormat = inferOutputFormat(node);
  const rawOutput = adaptPlatformOutput({
    node,
    outputFormat,
    hook: hookIntelligence.selected_hook,
    cta: ctaVariants.selected_cta,
    structure,
  });
  const aiSuppression = suppressGenericAI(rawOutput);
  const secondaryAdaptations = createSecondaryAdaptations(
    node,
    aiSuppression.sanitized_output,
    hookIntelligence.variants,
    ctaVariants.variants,
  );

  const pack = {
    pack_id: `${node.node_id}_production_pack`,
    expert_id: node.expert_id,
    campaign_id: node.campaign_id,
    planning_only: true,
    generated_at: new Date().toISOString(),
    pipeline_stages: PRODUCTION_STAGES.map((stage) => ({ stage, status: "simulated" })),
    strategy_node: node,
    strategy_selection: {
      selected_intent: node.intent,
      selected_platform: node.platform,
      selected_output_format: outputFormat,
    },
    context_assembly: context,
    retrieval_selection: {
      retrieval_namespace: context.retrieval_namespace,
      selected_count: context.selected_context.length,
      production_index_mutation: false,
    },
    voice_injection: {
      expert_id: node.expert_id,
      voice_scope: `expert_profiles/${node.expert_id}/voice`,
      injected_as_constraints_only: true,
    },
    emotional_alignment: {
      emotional_frame: node.emotional_frame,
      audience_state: node.audience_state,
      alignment_note: `Match ${node.emotional_frame} without artificial empathy.`,
    },
    hook_intelligence: hookIntelligence,
    structure_generation: structure,
    cta_variants: ctaVariants,
    primary_output: aiSuppression.sanitized_output,
    platform_adaptations: secondaryAdaptations,
    packaging: {
      main_post: aiSuppression.sanitized_output,
      title: aiSuppression.sanitized_output.title,
      hook_variants: hookIntelligence.variants,
      cta_variants: ctaVariants.variants,
      hashtag_ideas: [`#${slug(node.topic)}`, "#бережно", "#психологияотношений"],
      pinned_comment_ideas: [
        `Что в теме "${node.topic}" откликнулось сильнее всего?`,
        "Можно сохранить и вернуться позже.",
      ],
      story_followups: [
        `Опрос: знакома ли вам тема "${node.topic}"?`,
        "Стикер-вопрос: что хочется разобрать глубже?",
      ],
      carousel_slide_ideas: structure.beats.map((beat, index) => ({
        slide: index + 1,
        idea: `${beat}: ${node.topic}`,
      })),
      reels_adaptation: secondaryAdaptations.find((item) => item.output_format === "reels_script"),
      short_teaser_versions: hookIntelligence.variants.slice(0, 3).map((hook) => hook.text),
    },
    narrative_sync: buildNarrativeSync(node, previousPacks[previousPacks.length - 1]),
    ai_suppression: {
      checked_patterns: GENERIC_AI_PATTERNS,
      warnings: aiSuppression.warnings,
    },
  };

  pack.anti_repetition_warnings = validateAntiRepetition(pack, previousPacks);
  pack.hallucination_risk = estimateHallucinationRisk(pack);
  pack.quality_score = scoreProductionPack(pack);
  return pack;
}

function createProductionPipeline(campaignPlan, { limit = 10 } = {}) {
  const nodes = campaignPlan.nodes.slice(0, limit);
  const packs = [];
  for (const node of nodes) {
    packs.push(createProductionPack(node, packs));
  }
  return {
    schema_version: "2026-05-13.content_production.v1",
    generated_at: new Date().toISOString(),
    planning_only: true,
    campaign_id: campaignPlan.campaign_id,
    expert_id: campaignPlan.expert_id,
    constraints: {
      no_deploy: true,
      no_telegram_runtime_changes: true,
      no_auto_posting: true,
      no_faiss_or_index_mutation: true,
      no_ingest_or_promote: true,
      no_openai_fine_tuning: true,
      no_production_publishing: true,
    },
    production_stages: PRODUCTION_STAGES,
    packs,
    aggregate_quality: summarizeQuality(packs),
    aggregate_warnings: summarizeWarnings(packs),
  };
}

function summarizeQuality(packs) {
  const average = (field) => round(packs.reduce((sum, pack) => sum + Number(pack.quality_score[field] || 0), 0) / Math.max(1, packs.length));
  return {
    pack_count: packs.length,
    average_overall_score: average("overall_score"),
    average_style_similarity: average("style_similarity"),
    average_emotional_match: average("emotional_match"),
    average_cta_quality: average("cta_quality"),
    average_engagement_potential: average("engagement_potential"),
  };
}

function summarizeWarnings(packs) {
  const warnings = [];
  for (const pack of packs) {
    for (const warning of pack.ai_suppression.warnings) {
      warnings.push({ pack_id: pack.pack_id, type: "ai_suppression", ...warning });
    }
    for (const warning of pack.anti_repetition_warnings) {
      warnings.push({ pack_id: pack.pack_id, type: "anti_repetition", ...warning });
    }
    for (const warning of pack.hook_intelligence.hook_repetition_warnings) {
      warnings.push({ pack_id: pack.pack_id, type: "hook_intelligence", ...warning });
    }
  }
  return warnings;
}

export {
  GENERIC_AI_PATTERNS,
  HOOK_TYPES,
  OUTPUT_FORMATS,
  PLATFORM_ADAPTATION_RULES,
  PRODUCTION_STAGES,
  STRUCTURES,
  buildNarrativeSync,
  createProductionPack,
  createProductionPipeline,
  generateCtaVariants,
  generateHookVariants,
  scoreProductionPack,
  suppressGenericAI,
};
