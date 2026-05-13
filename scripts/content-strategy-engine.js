const CONTENT_INTENTS = [
  "educational",
  "authority",
  "therapeutic",
  "engagement",
  "sales",
  "soft_sales",
  "storytelling",
  "FAQ",
  "objection_handling",
  "audience_warming",
  "lead_magnet",
  "reels_hook",
  "carousel",
  "longform_article",
];

const AUDIENCE_STATES = [
  "cold",
  "warming",
  "engaged",
  "trusting",
  "considering_purchase",
  "resistant",
  "overwhelmed",
  "returning_reader",
];

const CTA_TYPES = [
  "soft_cta",
  "educational_cta",
  "emotional_cta",
  "consultation_cta",
  "dm_cta",
  "save_share_cta",
  "trust_cta",
  "low_pressure_cta",
];

const PLATFORMS = [
  "instagram_post",
  "telegram_longread",
  "reels_script",
  "story_sequence",
  "carousel_concept",
  "mini_series",
  "faq_thread",
];

const CAMPAIGN_TYPES = {
  warming_sequence: {
    label: "Audience Warming Sequence",
    default_duration_days: 7,
    intent_pattern: ["audience_warming", "educational", "storytelling", "engagement", "authority"],
    cta_pattern: ["low_pressure_cta", "save_share_cta", "emotional_cta", "soft_cta", "trust_cta"],
  },
  authority_building: {
    label: "Authority-Building Sequence",
    default_duration_days: 10,
    intent_pattern: ["educational", "authority", "FAQ", "carousel", "longform_article"],
    cta_pattern: ["educational_cta", "trust_cta", "save_share_cta", "soft_cta"],
  },
  launch_campaign: {
    label: "Launch Campaign",
    default_duration_days: 14,
    intent_pattern: ["audience_warming", "authority", "objection_handling", "soft_sales", "sales"],
    cta_pattern: ["low_pressure_cta", "trust_cta", "dm_cta", "consultation_cta"],
  },
  educational_series: {
    label: "Educational Series",
    default_duration_days: 30,
    intent_pattern: ["educational", "FAQ", "carousel", "longform_article", "engagement"],
    cta_pattern: ["educational_cta", "save_share_cta", "soft_cta"],
  },
  emotional_storytelling_arc: {
    label: "Emotional Storytelling Arc",
    default_duration_days: 14,
    intent_pattern: ["storytelling", "therapeutic", "audience_warming", "engagement", "soft_sales"],
    cta_pattern: ["emotional_cta", "low_pressure_cta", "soft_cta", "dm_cta"],
  },
  conversion_sequence: {
    label: "Conversion Sequence",
    default_duration_days: 10,
    intent_pattern: ["authority", "objection_handling", "soft_sales", "sales", "FAQ"],
    cta_pattern: ["trust_cta", "dm_cta", "consultation_cta", "consultation_cta"],
  },
  faq_cluster: {
    label: "FAQ Cluster",
    default_duration_days: 7,
    intent_pattern: ["FAQ", "educational", "objection_handling", "engagement"],
    cta_pattern: ["educational_cta", "save_share_cta", "low_pressure_cta"],
  },
  trust_building_flow: {
    label: "Trust-Building Flow",
    default_duration_days: 14,
    intent_pattern: ["storytelling", "authority", "therapeutic", "FAQ", "soft_sales"],
    cta_pattern: ["emotional_cta", "trust_cta", "low_pressure_cta", "soft_cta"],
  },
};

const AUDIENCE_STATE_RULES = {
  cold: {
    preferred_intents: ["audience_warming", "educational", "reels_hook", "storytelling"],
    preferred_ctas: ["low_pressure_cta", "save_share_cta"],
    next_state: "warming",
    planning_note: "Reduce pressure; create recognition and basic clarity.",
  },
  warming: {
    preferred_intents: ["educational", "storytelling", "engagement", "FAQ"],
    preferred_ctas: ["save_share_cta", "emotional_cta", "educational_cta"],
    next_state: "engaged",
    planning_note: "Build usefulness, rhythm, and topic familiarity.",
  },
  engaged: {
    preferred_intents: ["authority", "therapeutic", "carousel", "FAQ"],
    preferred_ctas: ["trust_cta", "soft_cta", "educational_cta"],
    next_state: "trusting",
    planning_note: "Show expertise, nuance, and repeatable value.",
  },
  trusting: {
    preferred_intents: ["soft_sales", "objection_handling", "lead_magnet", "authority"],
    preferred_ctas: ["dm_cta", "trust_cta", "soft_cta"],
    next_state: "considering_purchase",
    planning_note: "Invite a next step without breaking trust.",
  },
  considering_purchase: {
    preferred_intents: ["objection_handling", "sales", "FAQ", "soft_sales"],
    preferred_ctas: ["consultation_cta", "dm_cta", "trust_cta"],
    next_state: "returning_reader",
    planning_note: "Clarify fit, boundaries, and action path.",
  },
  resistant: {
    preferred_intents: ["FAQ", "objection_handling", "educational", "storytelling"],
    preferred_ctas: ["low_pressure_cta", "educational_cta"],
    next_state: "warming",
    planning_note: "Lower defensiveness; answer concerns respectfully.",
  },
  overwhelmed: {
    preferred_intents: ["therapeutic", "educational", "storytelling"],
    preferred_ctas: ["low_pressure_cta", "save_share_cta"],
    next_state: "engaged",
    planning_note: "Simplify and stabilize; avoid high-pressure conversion.",
  },
  returning_reader: {
    preferred_intents: ["authority", "longform_article", "lead_magnet", "soft_sales"],
    preferred_ctas: ["trust_cta", "dm_cta", "soft_cta"],
    next_state: "trusting",
    planning_note: "Reward continuity and deepen positioning.",
  },
};

const TOPIC_LIBRARY = {
  dinara: [
    "relationship anxiety",
    "emotional dependency",
    "female sexuality myths",
    "boundaries in intimacy",
    "shame and desire",
    "trust after conflict",
    "body sensitivity",
    "self-worth in relationships",
    "adult attachment",
    "soft communication",
  ],
  relationship_coach_demo: [
    "conflict repair",
    "healthy boundaries",
    "communication loops",
    "dating expectations",
    "trust rebuilding",
  ],
  medical_educator_demo: [
    "health literacy basics",
    "when to see a specialist",
    "myths about symptoms",
    "prevention basics",
    "safe information habits",
  ],
  finance_creator_demo: [
    "budgeting basics",
    "emergency fund",
    "debt habits",
    "risk awareness",
    "money mindset",
  ],
};

const PLATFORM_ROTATION = [
  "instagram_post",
  "reels_script",
  "telegram_longread",
  "carousel_concept",
  "story_sequence",
  "faq_thread",
  "mini_series",
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pick(items, index) {
  if (!items.length) return null;
  return items[index % items.length];
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "_")
    .replace(/^_+|_+$/g, "");
}

function weekNumber(day) {
  return Math.floor((day - 1) / 7) + 1;
}

function createContentNode({
  expertId,
  day,
  topic,
  intent,
  platform,
  audienceState,
  ctaType,
  campaignId,
  campaignStage,
  priorNode = null,
}) {
  const theme = topic.split(" ").slice(0, 2).join(" ");
  const emotionalFrame = pick(["recognition", "relief", "clarity", "trust", "agency"], day - 1);
  const hookPattern = pick([
    "myth_reframe",
    "quiet_truth",
    "reader_question",
    "contrast_hook",
    "expert_observation",
  ], day - 1);
  const storyStructure = pick([
    "situation_to_insight",
    "tension_to_reframe",
    "question_to_explanation",
    "mistake_to_boundary",
  ], Math.floor((day - 1) / 2));

  return {
    node_id: `${expertId}_day_${String(day).padStart(2, "0")}_${slug(intent)}`,
    expert_id: expertId,
    day,
    week: weekNumber(day),
    campaign_id: campaignId,
    campaign_stage: campaignStage,
    topic,
    theme,
    intent,
    platform,
    audience_state: audienceState,
    cta_type: ctaType,
    hook_pattern: hookPattern,
    emotional_frame: emotionalFrame,
    storytelling_structure: storyStructure,
    sophistication_level: Math.min(5, Math.ceil(day / 7)),
    expert_positioning: day < 10 ? "warm guide" : day < 21 ? "trusted specialist" : "clear next-step advisor",
    depends_on: priorNode ? [priorNode.node_id] : [],
    planning_notes: [
      AUDIENCE_STATE_RULES[audienceState]?.planning_note || "Use expert-safe default planning.",
      `Continue theme: ${theme}.`,
    ],
  };
}

function chooseAudienceState(day, initialState = "cold") {
  if (day === 1) return initialState;
  if (day <= 6) return "warming";
  if (day <= 12) return "engaged";
  if (day <= 19) return "trusting";
  if (day <= 25) return "considering_purchase";
  return "returning_reader";
}

function chooseIntent(campaign, audienceState, day) {
  const campaignIntent = pick(campaign.intent_pattern, day - 1);
  const preferred = AUDIENCE_STATE_RULES[audienceState]?.preferred_intents || [];
  if (preferred.includes(campaignIntent)) return campaignIntent;
  return pick([...preferred, ...campaign.intent_pattern], day - 1) || campaignIntent;
}

function chooseCta(campaign, audienceState, day, previousNodes) {
  const preferred = AUDIENCE_STATE_RULES[audienceState]?.preferred_ctas || [];
  const candidate = pick([...preferred, ...campaign.cta_pattern], day - 1);
  const lastTwo = previousNodes.slice(-2).map((node) => node.cta_type);
  if (lastTwo.length === 2 && lastTwo.every((cta) => cta === candidate)) {
    return pick(CTA_TYPES.filter((cta) => cta !== candidate), day);
  }
  return candidate || "low_pressure_cta";
}

function createCampaignPlan({
  expertId = "dinara",
  campaignType = "trust_building_flow",
  durationDays = 30,
  initialAudienceState = "cold",
  topics = TOPIC_LIBRARY[expertId] || TOPIC_LIBRARY.dinara,
} = {}) {
  const campaign = CAMPAIGN_TYPES[campaignType] || CAMPAIGN_TYPES.trust_building_flow;
  const campaignId = `${expertId}_${campaignType}_${durationDays}d`;
  const nodes = [];

  for (let day = 1; day <= durationDays; day += 1) {
    const audienceState = chooseAudienceState(day, initialAudienceState);
    const intent = chooseIntent(campaign, audienceState, day);
    const ctaType = chooseCta(campaign, audienceState, day, nodes);
    const node = createContentNode({
      expertId,
      day,
      topic: pick(topics, day - 1),
      intent,
      platform: pick(PLATFORM_ROTATION, day - 1),
      audienceState,
      ctaType,
      campaignId,
      campaignStage: day <= 7 ? "warming" : day <= 17 ? "trust_building" : day <= 24 ? "conversion_support" : "continuity",
      priorNode: nodes[nodes.length - 1],
    });
    nodes.push(node);
  }

  return {
    campaign_id: campaignId,
    expert_id: expertId,
    campaign_type: campaignType,
    campaign_label: campaign.label,
    duration_days: durationDays,
    planning_only: true,
    nodes,
  };
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = typeof key === "function" ? key(item) : item[key];
    acc[value] = acc[value] || [];
    acc[value].push(item);
    return acc;
  }, {});
}

function buildWeeklyContentPlan(campaignPlan) {
  return Object.entries(groupBy(campaignPlan.nodes, "week")).map(([week, nodes]) => ({
    week: Number(week),
    primary_goal: pick(["warm recognition", "teach core ideas", "build trust", "support conversion", "maintain continuity"], Number(week) - 1),
    nodes: nodes.map((node) => ({
      day: node.day,
      topic: node.topic,
      intent: node.intent,
      platform: node.platform,
      audience_state: node.audience_state,
      cta_type: node.cta_type,
    })),
  }));
}

function buildMonthlyStrategyMap(campaignPlan) {
  const byIntent = groupBy(campaignPlan.nodes, "intent");
  const byPlatform = groupBy(campaignPlan.nodes, "platform");
  return {
    campaign_id: campaignPlan.campaign_id,
    total_nodes: campaignPlan.nodes.length,
    intent_distribution: Object.fromEntries(Object.entries(byIntent).map(([intent, nodes]) => [intent, nodes.length])),
    platform_distribution: Object.fromEntries(Object.entries(byPlatform).map(([platform, nodes]) => [platform, nodes.length])),
    strategic_phases: [
      { phase: "warming", days: "1-7", objective: "recognition, safety, low-pressure usefulness" },
      { phase: "trust_building", days: "8-17", objective: "authority, nuance, expert positioning" },
      { phase: "conversion_support", days: "18-24", objective: "objections, fit, next step clarity" },
      { phase: "continuity", days: "25-30", objective: "returning reader value and sustained trust" },
    ],
  };
}

function buildNarrativeContinuity(campaignPlan) {
  const nodes = campaignPlan.nodes;
  const repeatedThemes = Object.entries(groupBy(nodes, "theme"))
    .filter(([, items]) => items.length > 1)
    .map(([theme, items]) => ({ theme, count: items.length, days: items.map((item) => item.day) }));
  const emotionalProgression = nodes.map((node) => ({
    day: node.day,
    emotional_frame: node.emotional_frame,
    audience_state: node.audience_state,
    sophistication_level: node.sophistication_level,
    expert_positioning: node.expert_positioning,
  }));
  return {
    repeated_themes: repeatedThemes,
    emotional_progression: emotionalProgression,
    cta_escalation: nodes.map((node) => ({ day: node.day, cta_type: node.cta_type, stage: node.campaign_stage })),
    storytelling_continuity: nodes.map((node) => ({ day: node.day, structure: node.storytelling_structure, depends_on: node.depends_on })),
    expert_positioning_continuity: Object.entries(groupBy(nodes, "expert_positioning")).map(([positioning, items]) => ({
      positioning,
      days: items.map((item) => item.day),
    })),
  };
}

function buildContentRelationshipGraph(campaignPlan) {
  const nodes = campaignPlan.nodes.map((node) => ({
    id: node.node_id,
    topic: node.topic,
    intent: node.intent,
    platform: node.platform,
    audience_state: node.audience_state,
  }));
  const edges = [];
  for (let index = 0; index < campaignPlan.nodes.length; index += 1) {
    const node = campaignPlan.nodes[index];
    const previous = campaignPlan.nodes[index - 1];
    const nextSimilarTheme = campaignPlan.nodes.slice(index + 1).find((candidate) => candidate.theme === node.theme);
    if (previous) {
      edges.push({
        from: previous.node_id,
        to: node.node_id,
        relationship: "narrative_dependency",
      });
    }
    if (nextSimilarTheme) {
      edges.push({
        from: node.node_id,
        to: nextSimilarTheme.node_id,
        relationship: "related_topic",
      });
    }
    if (node.cta_type === previous?.cta_type) {
      edges.push({
        from: previous.node_id,
        to: node.node_id,
        relationship: "cta_adjacency_repetition_risk",
      });
    }
  }
  return { nodes, edges };
}

function buildAudienceProgression(campaignPlan) {
  const states = campaignPlan.nodes.map((node) => node.audience_state);
  return {
    initial_state: states[0],
    final_state: states[states.length - 1],
    state_counts: Object.fromEntries(Object.entries(groupBy(campaignPlan.nodes, "audience_state")).map(([state, nodes]) => [state, nodes.length])),
    progression: campaignPlan.nodes.map((node) => ({
      day: node.day,
      audience_state: node.audience_state,
      adapted_intent: node.intent,
      adapted_cta: node.cta_type,
      planning_note: AUDIENCE_STATE_RULES[node.audience_state]?.planning_note,
    })),
  };
}

function buildCtaProgression(campaignPlan) {
  const nodes = campaignPlan.nodes;
  const ctaCounts = Object.fromEntries(Object.entries(groupBy(nodes, "cta_type")).map(([cta, items]) => [cta, items.length]));
  const warnings = [];
  const fatigueThreshold = Math.ceil(nodes.length * 0.24);
  for (const [cta, count] of Object.entries(ctaCounts)) {
    if (count > fatigueThreshold) {
      warnings.push({
        warning: "cta_fatigue_risk",
        cta_type: cta,
        count,
        threshold: fatigueThreshold,
      });
    }
  }
  for (let index = 2; index < nodes.length; index += 1) {
    const triple = nodes.slice(index - 2, index + 1);
    if (triple.every((node) => node.cta_type === triple[0].cta_type)) {
      warnings.push({
        warning: "cta_repetition_sequence",
        cta_type: triple[0].cta_type,
        days: triple.map((node) => node.day),
      });
    }
  }
  return {
    cta_counts: ctaCounts,
    escalation_pacing: nodes.map((node) => ({ day: node.day, stage: node.campaign_stage, cta_type: node.cta_type })),
    warnings,
  };
}

function detectRepetition(campaignPlan) {
  const fields = [
    ["hook_pattern", "repeated_hooks"],
    ["emotional_frame", "repeated_emotional_framing"],
    ["storytelling_structure", "repeated_storytelling_structures"],
    ["cta_type", "repeated_cta_patterns"],
    ["theme", "repeated_expert_theme"],
  ];
  const warnings = [];
  for (const [field, warningType] of fields) {
    const grouped = groupBy(campaignPlan.nodes, field);
    for (const [value, nodes] of Object.entries(grouped)) {
      if (nodes.length >= 4) {
        warnings.push({
          warning: warningType,
          value,
          count: nodes.length,
          days: nodes.map((node) => node.day),
          severity: nodes.length >= 6 ? "medium" : "low",
        });
      }
    }
  }
  for (let index = 1; index < campaignPlan.nodes.length; index += 1) {
    const current = campaignPlan.nodes[index];
    const previous = campaignPlan.nodes[index - 1];
    if (current.hook_pattern === previous.hook_pattern && current.emotional_frame === previous.emotional_frame) {
      warnings.push({
        warning: "repeated_opening_line_risk",
        value: `${current.hook_pattern}/${current.emotional_frame}`,
        days: [previous.day, current.day],
        severity: "low",
      });
    }
  }
  return {
    warnings,
    checked_fields: fields.map(([field]) => field),
    total_warnings: warnings.length,
  };
}

function createContentStrategy(input = {}) {
  const campaignPlan = createCampaignPlan(input);
  const weekly_plan = buildWeeklyContentPlan(campaignPlan);
  const monthly_strategy_map = buildMonthlyStrategyMap(campaignPlan);
  const campaign_progression_map = campaignPlan.nodes.map((node) => ({
    day: node.day,
    stage: node.campaign_stage,
    intent: node.intent,
    platform: node.platform,
    topic: node.topic,
    audience_state: node.audience_state,
    cta_type: node.cta_type,
  }));
  const topic_cluster_graph = buildContentRelationshipGraph(campaignPlan);
  const narrative_continuity = buildNarrativeContinuity(campaignPlan);
  const audience_state_progression = buildAudienceProgression(campaignPlan);
  const cta_distribution = buildCtaProgression(campaignPlan);
  const repetition_detection = detectRepetition(campaignPlan);

  return {
    schema_version: "2026-05-13.content_strategy.v1",
    generated_at: new Date().toISOString(),
    planning_only: true,
    constraints: {
      no_deploy: true,
      no_telegram_runtime_changes: true,
      no_auto_posting: true,
      no_faiss_or_index_mutation: true,
      no_ingest_or_promote: true,
      no_openai_fine_tuning: true,
      no_production_feed_generation: true,
    },
    campaign_plan: campaignPlan,
    weekly_plan,
    monthly_strategy_map,
    campaign_progression_map,
    topic_cluster_graph,
    narrative_continuity,
    audience_state_progression,
    cta_distribution,
    repetition_detection,
  };
}

export {
  AUDIENCE_STATES,
  AUDIENCE_STATE_RULES,
  CAMPAIGN_TYPES,
  CONTENT_INTENTS,
  CTA_TYPES,
  PLATFORMS,
  TOPIC_LIBRARY,
  buildAudienceProgression,
  buildContentRelationshipGraph,
  buildCtaProgression,
  buildMonthlyStrategyMap,
  buildNarrativeContinuity,
  buildWeeklyContentPlan,
  createCampaignPlan,
  createContentStrategy,
  detectRepetition,
};
