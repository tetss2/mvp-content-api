const METRIC_NAMES = [
  "views",
  "saves",
  "shares",
  "comments",
  "likes",
  "retention",
  "watch_time",
  "profile_clicks",
  "DM_conversion",
  "CTA_conversion",
  "consultation_interest",
  "carousel_completion",
  "reels_completion",
];

const HOOK_TYPE_WEIGHTS = {
  emotional_hook: { retention: 0.74, saves: 0.64, shares: 0.58 },
  curiosity_hook: { retention: 0.8, saves: 0.58, shares: 0.62 },
  authority_hook: { retention: 0.76, saves: 0.72, shares: 0.54 },
  therapeutic_hook: { retention: 0.78, saves: 0.7, shares: 0.56 },
  pain_point_hook: { retention: 0.82, saves: 0.68, shares: 0.6 },
  controversial_hook: { retention: 0.84, saves: 0.52, shares: 0.7 },
  story_hook: { retention: 0.79, saves: 0.66, shares: 0.62 },
  short_form_hook: { retention: 0.73, saves: 0.5, shares: 0.58 },
  reels_hook: { retention: 0.81, saves: 0.54, shares: 0.66 },
};

const CTA_TYPE_WEIGHTS = {
  low_pressure_cta: { conversion: 0.06, fatigue: 0.12 },
  save_share_cta: { conversion: 0.09, fatigue: 0.18 },
  educational_cta: { conversion: 0.11, fatigue: 0.2 },
  emotional_cta: { conversion: 0.12, fatigue: 0.22 },
  trust_cta: { conversion: 0.15, fatigue: 0.25 },
  soft_cta: { conversion: 0.16, fatigue: 0.28 },
  dm_cta: { conversion: 0.22, fatigue: 0.36 },
  consultation_cta: { conversion: 0.28, fatigue: 0.48 },
};

const PLATFORM_BASELINES = {
  instagram_post: { views: 1800, completion: 0.66, density: 0.72 },
  telegram_longread: { views: 950, completion: 0.72, density: 0.58 },
  reels_script: { views: 4200, completion: 0.61, density: 0.8 },
  carousel_script: { views: 2100, completion: 0.69, density: 0.76 },
  story_sequence: { views: 1300, completion: 0.63, density: 0.7 },
  emotional_story: { views: 1700, completion: 0.68, density: 0.74 },
  authority_post: { views: 1500, completion: 0.7, density: 0.68 },
  faq_answer: { views: 1450, completion: 0.71, density: 0.66 },
  educational_post: { views: 1600, completion: 0.7, density: 0.7 },
  sales_post: { views: 1250, completion: 0.58, density: 0.62 },
  consultation_cta_post: { views: 1150, completion: 0.56, density: 0.6 },
};

function round(value) {
  return Number(Number(value || 0).toFixed(3));
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = typeof key === "function" ? key(item) : item[key];
    acc[value] = acc[value] || [];
    acc[value].push(item);
    return acc;
  }, {});
}

function average(items, selector) {
  return round(items.reduce((sum, item) => sum + Number(selector(item) || 0), 0) / Math.max(1, items.length));
}

function selectedHookType(pack) {
  return pack.hook_intelligence?.selected_hook?.hook_type || "emotional_hook";
}

function selectedCtaType(pack) {
  return pack.cta_variants?.selected_cta?.cta_type || "low_pressure_cta";
}

function outputFormat(pack) {
  return pack.primary_output?.output_format || pack.strategy_selection?.selected_output_format || "instagram_post";
}

function simulateEngagement(pack, index = 0, priorPacks = []) {
  const hookType = selectedHookType(pack);
  const ctaType = selectedCtaType(pack);
  const format = outputFormat(pack);
  const hookWeight = HOOK_TYPE_WEIGHTS[hookType] || HOOK_TYPE_WEIGHTS.emotional_hook;
  const ctaWeight = CTA_TYPE_WEIGHTS[ctaType] || CTA_TYPE_WEIGHTS.low_pressure_cta;
  const platform = PLATFORM_BASELINES[format] || PLATFORM_BASELINES.instagram_post;
  const repeatedTopicCount = priorPacks.filter((item) => item.strategy_node?.theme === pack.strategy_node?.theme).length;
  const fatiguePenalty = Math.min(0.24, repeatedTopicCount * 0.06);
  const qualityBoost = Number(pack.quality_score?.overall_score || 0.8) - 0.75;
  const stageBoost = pack.strategy_node?.campaign_stage === "trust_building" ? 0.08 : pack.strategy_node?.campaign_stage === "conversion_support" ? 0.04 : 0;
  const views = Math.round(platform.views * (1 + qualityBoost + stageBoost - fatiguePenalty + ((index % 5) * 0.025)));
  const retention = round(Math.max(0.35, Math.min(0.92, hookWeight.retention + qualityBoost - fatiguePenalty)));
  const completion = round(Math.max(0.3, Math.min(0.9, platform.completion + qualityBoost - fatiguePenalty / 2)));
  const saves = Math.round(views * (0.035 + hookWeight.saves * 0.045 + qualityBoost * 0.03));
  const shares = Math.round(views * (0.018 + hookWeight.shares * 0.03));
  const comments = Math.round(views * (0.01 + platform.density * 0.012));
  const likes = Math.round(views * (0.06 + platform.density * 0.055));
  const profileClicks = Math.round(views * (0.012 + ctaWeight.conversion * 0.08));
  const ctaConversion = round(Math.max(0.01, ctaWeight.conversion - fatiguePenalty / 3 + qualityBoost / 2));
  const dmConversion = round(ctaType === "dm_cta" ? ctaConversion : ctaConversion * 0.35);
  const consultationInterest = round(ctaType === "consultation_cta" ? ctaConversion : ctaConversion * 0.25);
  return {
    pack_id: pack.pack_id,
    day: pack.strategy_node?.day,
    topic: pack.strategy_node?.topic,
    theme: pack.strategy_node?.theme,
    platform: format,
    hook_type: hookType,
    cta_type: ctaType,
    audience_state: pack.strategy_node?.audience_state,
    campaign_stage: pack.strategy_node?.campaign_stage,
    metrics: {
      views,
      saves,
      shares,
      comments,
      likes,
      retention,
      watch_time: round(retention * (format === "reels_script" ? 48 : 90)),
      profile_clicks: profileClicks,
      DM_conversion: dmConversion,
      CTA_conversion: ctaConversion,
      consultation_interest: consultationInterest,
      carousel_completion: format === "carousel_script" ? completion : null,
      reels_completion: format === "reels_script" ? completion : null,
    },
    fatigue: {
      repeated_topic_count: repeatedTopicCount,
      fatigue_penalty: round(fatiguePenalty),
      cta_fatigue_estimate: CTA_TYPE_WEIGHTS[ctaType]?.fatigue || 0.2,
    },
  };
}

function simulateEngagementSeries(packs = []) {
  return packs.map((pack, index) => simulateEngagement(pack, index, packs.slice(0, index)));
}

function analyzeHookPerformance(engagement) {
  return Object.entries(groupBy(engagement, "hook_type")).map(([hookType, items]) => ({
    hook_type: hookType,
    posts: items.length,
    average_retention: average(items, (item) => item.metrics.retention),
    average_saves: average(items, (item) => item.metrics.saves),
    average_shares: average(items, (item) => item.metrics.shares),
    hook_fatigue: average(items, (item) => item.fatigue.fatigue_penalty),
    insight: average(items, (item) => item.metrics.retention) >= 0.78
      ? "high_retention_hook"
      : "needs_more_variation_or_stronger_opening",
  }));
}

function analyzeCtaPerformance(engagement) {
  return Object.entries(groupBy(engagement, "cta_type")).map(([ctaType, items]) => ({
    cta_type: ctaType,
    uses: items.length,
    average_CTA_conversion: average(items, (item) => item.metrics.CTA_conversion),
    average_DM_conversion: average(items, (item) => item.metrics.DM_conversion),
    average_consultation_interest: average(items, (item) => item.metrics.consultation_interest),
    fatigue_risk: average(items, (item) => item.fatigue.cta_fatigue_estimate),
    recommendation: average(items, (item) => item.fatigue.cta_fatigue_estimate) > 0.34
      ? "space_out_high_intent_ctas"
      : "cta_pacing_acceptable",
  }));
}

function analyzeStorytelling(packs, engagement) {
  return packs.map((pack) => {
    const item = engagement.find((entry) => entry.pack_id === pack.pack_id);
    return {
      pack_id: pack.pack_id,
      structure: pack.structure_generation?.structure_id,
      emotional_frame: pack.strategy_node?.emotional_frame,
      storytelling_structure: pack.strategy_node?.storytelling_structure,
      emotional_engagement: round((item.metrics.comments / Math.max(1, item.metrics.views)) + item.metrics.retention),
      narrative_retention: item.metrics.retention,
      therapeutic_storytelling_impact: pack.strategy_node?.intent === "therapeutic" ? "high_relevance" : "supporting_signal",
      vulnerability_resonance: ["recognition", "relief"].includes(pack.strategy_node?.emotional_frame) ? "strong" : "moderate",
      authority_storytelling_performance: pack.strategy_node?.intent === "authority" ? item.metrics.saves : null,
    };
  });
}

function analyzeAudienceTransitions(engagement) {
  const transitions = [];
  for (let index = 1; index < engagement.length; index += 1) {
    const from = engagement[index - 1];
    const to = engagement[index];
    transitions.push({
      from_state: from.audience_state,
      to_state: to.audience_state,
      days: [from.day, to.day],
      retention_delta: round(to.metrics.retention - from.metrics.retention),
      conversion_delta: round(to.metrics.CTA_conversion - from.metrics.CTA_conversion),
      friction: to.metrics.retention < from.metrics.retention - 0.08 ? "drop_off_zone" : "normal",
      emotional_overload_risk: to.fatigue.fatigue_penalty > 0.12 ? "elevated" : "low",
    });
  }
  return {
    transitions,
    strongest_path: transitions
      .filter((transition) => transition.retention_delta >= 0)
      .slice(0, 3),
    friction_points: transitions.filter((transition) => transition.friction !== "normal" || transition.emotional_overload_risk !== "low"),
  };
}

function analyzeTopicClusters(engagement) {
  return Object.entries(groupBy(engagement, "theme")).map(([theme, items]) => {
    const retention = average(items, (item) => item.metrics.retention);
    const conversion = average(items, (item) => item.metrics.CTA_conversion);
    const saves = average(items, (item) => item.metrics.saves);
    return {
      theme,
      posts: items.length,
      average_retention: retention,
      average_saves: saves,
      average_conversion: conversion,
      classification: conversion >= 0.16 ? "conversion_driving_theme" : retention >= 0.78 ? "high_retention_theme" : saves >= 110 ? "trust_building_theme" : "needs_iteration",
      saturation: items.length >= 4 ? "oversaturated" : items.length >= 2 ? "watch" : "healthy",
    };
  });
}

function analyzePlatformPerformance(engagement) {
  return Object.entries(groupBy(engagement, "platform")).map(([platform, items]) => ({
    platform,
    posts: items.length,
    average_views: average(items, (item) => item.metrics.views),
    average_retention: average(items, (item) => item.metrics.retention),
    average_completion: average(items, (item) => item.metrics.carousel_completion || item.metrics.reels_completion || item.metrics.retention),
    engagement_density: average(items, (item) => (item.metrics.likes + item.metrics.comments + item.metrics.saves + item.metrics.shares) / Math.max(1, item.metrics.views)),
    recommendation: average(items, (item) => item.metrics.retention) >= 0.76 ? "scale_format" : "adjust_pacing_or_opening",
  }));
}

function detectContentDecay(engagement) {
  const warnings = [];
  const byTheme = groupBy(engagement, "theme");
  for (const [theme, items] of Object.entries(byTheme)) {
    if (items.length >= 2 && items[items.length - 1].metrics.retention < items[0].metrics.retention - 0.08) {
      warnings.push({
        warning: "declining_engagement_pattern",
        theme,
        first_retention: items[0].metrics.retention,
        latest_retention: items[items.length - 1].metrics.retention,
      });
    }
    if (items.length >= 4) {
      warnings.push({
        warning: "oversaturated_topic",
        theme,
        count: items.length,
      });
    }
  }
  const ctaCounts = groupBy(engagement, "cta_type");
  for (const [ctaType, items] of Object.entries(ctaCounts)) {
    if (items.length >= 4) {
      warnings.push({
        warning: "stale_cta_structure",
        cta_type: ctaType,
        count: items.length,
      });
    }
  }
  const frameCounts = groupBy(engagement, (item) => item.pack_emotional_frame || item.emotional_frame);
  if (Object.values(frameCounts).some((items) => items.length >= 5)) {
    warnings.push({
      warning: "overused_emotional_framing",
      note: "One emotional frame appears too often in the simulated sequence.",
    });
  }
  return warnings;
}

function detectGrowthPatterns(engagement, packs) {
  const patterns = [];
  for (const item of engagement) {
    if (item.metrics.shares / Math.max(1, item.metrics.views) > 0.035) {
      patterns.push({
        pattern: "high_share_pattern",
        pack_id: item.pack_id,
        driver: item.hook_type,
        signal: round(item.metrics.shares / item.metrics.views),
      });
    }
    if (item.metrics.retention >= 0.8) {
      patterns.push({
        pattern: "high_retention_structure",
        pack_id: item.pack_id,
        driver: packs.find((pack) => pack.pack_id === item.pack_id)?.structure_generation?.structure_id,
        signal: item.metrics.retention,
      });
    }
    if (item.metrics.saves / Math.max(1, item.metrics.views) > 0.06) {
      patterns.push({
        pattern: "high_save_pattern",
        pack_id: item.pack_id,
        driver: item.theme,
        signal: round(item.metrics.saves / item.metrics.views),
      });
    }
    if (item.metrics.CTA_conversion >= 0.18) {
      patterns.push({
        pattern: "conversion_pattern",
        pack_id: item.pack_id,
        driver: item.cta_type,
        signal: item.metrics.CTA_conversion,
      });
    }
  }
  return patterns;
}

function buildOptimizationRecommendations({ hookPerformance, ctaPerformance, audienceTransitions, topicClusters, platformPerformance, decayWarnings, growthPatterns }) {
  const recommendations = [];
  const bestHook = [...hookPerformance].sort((a, b) => b.average_retention - a.average_retention)[0];
  if (bestHook) {
    recommendations.push({
      area: "hooks",
      priority: "high",
      recommendation: `Use more ${bestHook.hook_type} openings for high-retention nodes.`,
      evidence: `Average retention ${bestHook.average_retention}.`,
    });
  }
  const tiredCta = ctaPerformance.find((item) => item.fatigue_risk > 0.34);
  if (tiredCta) {
    recommendations.push({
      area: "CTA pacing",
      priority: "medium",
      recommendation: `Space out ${tiredCta.cta_type} and alternate with low-pressure or educational CTAs.`,
      evidence: `Fatigue risk ${tiredCta.fatigue_risk}.`,
    });
  }
  const friction = audienceTransitions.friction_points[0];
  if (friction) {
    recommendations.push({
      area: "audience progression",
      priority: "medium",
      recommendation: `Add a stabilizing educational or therapeutic post between ${friction.from_state} and ${friction.to_state}.`,
      evidence: `Transition days ${friction.days.join(" -> ")} flagged ${friction.friction}/${friction.emotional_overload_risk}.`,
    });
  }
  const strongestTopic = [...topicClusters].sort((a, b) => b.average_retention + b.average_conversion - (a.average_retention + a.average_conversion))[0];
  if (strongestTopic) {
    recommendations.push({
      area: "topic prioritization",
      priority: "high",
      recommendation: `Prioritize ${strongestTopic.theme} as a recurring but spaced campaign pillar.`,
      evidence: `${strongestTopic.classification}; retention ${strongestTopic.average_retention}; conversion ${strongestTopic.average_conversion}.`,
    });
  }
  const weakPlatform = platformPerformance.find((item) => item.recommendation === "adjust_pacing_or_opening");
  if (weakPlatform) {
    recommendations.push({
      area: "platform adaptation",
      priority: "medium",
      recommendation: `Adjust opening speed and paragraph density for ${weakPlatform.platform}.`,
      evidence: `Average retention ${weakPlatform.average_retention}.`,
    });
  }
  if (decayWarnings.length) {
    recommendations.push({
      area: "content decay",
      priority: "high",
      recommendation: "Introduce theme spacing and new emotional frames before producing the next batch.",
      evidence: `${decayWarnings.length} decay warnings detected.`,
    });
  }
  if (growthPatterns.length) {
    recommendations.push({
      area: "growth patterns",
      priority: "high",
      recommendation: "Promote high-retention and high-save structures into the next strategy simulation.",
      evidence: `${growthPatterns.length} growth signals detected.`,
    });
  }
  return recommendations;
}

function analyzeContentPerformance(pipeline) {
  const packs = pipeline.packs || [];
  const engagement = simulateEngagementSeries(packs);
  engagement.forEach((item) => {
    const pack = packs.find((candidate) => candidate.pack_id === item.pack_id);
    item.emotional_frame = pack?.strategy_node?.emotional_frame;
  });
  const hookPerformance = analyzeHookPerformance(engagement);
  const ctaPerformance = analyzeCtaPerformance(engagement);
  const storytelling = analyzeStorytelling(packs, engagement);
  const audienceTransitions = analyzeAudienceTransitions(engagement);
  const topicClusters = analyzeTopicClusters(engagement);
  const platformPerformance = analyzePlatformPerformance(engagement);
  const decayWarnings = detectContentDecay(engagement);
  const growthPatterns = detectGrowthPatterns(engagement, packs);
  const optimizationRecommendations = buildOptimizationRecommendations({
    hookPerformance,
    ctaPerformance,
    audienceTransitions,
    topicClusters,
    platformPerformance,
    decayWarnings,
    growthPatterns,
  });

  return {
    schema_version: "2026-05-13.content_analytics.v1",
    generated_at: new Date().toISOString(),
    planning_only: true,
    constraints: {
      no_deploy: true,
      no_telegram_runtime_changes: true,
      no_auto_posting: true,
      no_faiss_or_index_mutation: true,
      no_ingest_or_promote: true,
      no_openai_fine_tuning: true,
      no_real_social_api_integrations: true,
      no_production_publishing: true,
    },
    metrics_supported: METRIC_NAMES,
    engagement,
    hook_performance: hookPerformance,
    cta_analytics: ctaPerformance,
    storytelling_analytics: storytelling,
    audience_transition_analytics: audienceTransitions,
    topic_cluster_analytics: topicClusters,
    platform_analytics: platformPerformance,
    content_decay: decayWarnings,
    growth_patterns: growthPatterns,
    optimization_recommendations: optimizationRecommendations,
  };
}

export {
  CTA_TYPE_WEIGHTS,
  HOOK_TYPE_WEIGHTS,
  METRIC_NAMES,
  PLATFORM_BASELINES,
  analyzeAudienceTransitions,
  analyzeContentPerformance,
  analyzeCtaPerformance,
  analyzeHookPerformance,
  analyzePlatformPerformance,
  analyzeStorytelling,
  analyzeTopicClusters,
  buildOptimizationRecommendations,
  detectContentDecay,
  detectGrowthPatterns,
  simulateEngagement,
  simulateEngagementSeries,
};
