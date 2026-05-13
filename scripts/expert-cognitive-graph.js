const TOPIC_SEED_LIBRARY = {
  dinara: [
    {
      topic: "relationship anxiety",
      cluster: "attachment",
      emotions: ["fear", "hope", "relief"],
      authorityDomains: ["attachment psychology", "relationship repair"],
      trustDomains: ["emotional recognition", "normalization"],
      conversionDomains: ["consultation readiness"],
    },
    {
      topic: "emotional dependency",
      cluster: "attachment",
      emotions: ["fear", "shame", "relief"],
      authorityDomains: ["dependency patterns", "boundaries"],
      trustDomains: ["nonjudgment", "practical clarity"],
      conversionDomains: ["therapy motivation"],
    },
    {
      topic: "boundaries in intimacy",
      cluster: "boundaries",
      emotions: ["safety", "courage", "doubt"],
      authorityDomains: ["communication", "relationship safety"],
      trustDomains: ["agency", "self-respect"],
      conversionDomains: ["consultation readiness"],
    },
    {
      topic: "shame and desire",
      cluster: "sexuality",
      emotions: ["shame", "curiosity", "relief"],
      authorityDomains: ["sexology", "body awareness"],
      trustDomains: ["permission", "vulnerability"],
      conversionDomains: ["private consultation"],
    },
    {
      topic: "female sexuality myths",
      cluster: "sexuality",
      emotions: ["curiosity", "relief", "confidence"],
      authorityDomains: ["sex education", "myth correction"],
      trustDomains: ["educational trust", "clarity"],
      conversionDomains: ["educational lead"],
    },
    {
      topic: "trust after conflict",
      cluster: "repair",
      emotions: ["hurt", "hope", "stability"],
      authorityDomains: ["conflict repair", "communication"],
      trustDomains: ["consistency", "repair"],
      conversionDomains: ["couples consultation"],
    },
    {
      topic: "self-worth in relationships",
      cluster: "identity",
      emotions: ["sadness", "recognition", "strength"],
      authorityDomains: ["self-worth", "attachment"],
      trustDomains: ["emotional trust", "recognition"],
      conversionDomains: ["therapy motivation"],
    },
    {
      topic: "adult attachment",
      cluster: "attachment",
      emotions: ["curiosity", "recognition", "relief"],
      authorityDomains: ["attachment psychology", "psychoeducation"],
      trustDomains: ["educational trust", "continuity"],
      conversionDomains: ["consultation readiness"],
    },
    {
      topic: "soft communication",
      cluster: "communication",
      emotions: ["calm", "hope", "safety"],
      authorityDomains: ["communication", "conflict prevention"],
      trustDomains: ["practical clarity", "consistency"],
      conversionDomains: ["low pressure dm"],
    },
    {
      topic: "body sensitivity",
      cluster: "sexuality",
      emotions: ["curiosity", "shame", "confidence"],
      authorityDomains: ["body awareness", "sexology"],
      trustDomains: ["permission", "educational trust"],
      conversionDomains: ["private consultation"],
    },
  ],
};

const DEFAULT_SEEDS = TOPIC_SEED_LIBRARY.dinara;

const CTA_WEIGHTS = {
  none: 0,
  save_share_cta: 0.1,
  educational_cta: 0.18,
  emotional_cta: 0.2,
  low_pressure_cta: 0.22,
  trust_cta: 0.28,
  soft_cta: 0.35,
  dm_cta: 0.55,
  consultation_cta: 0.72,
};

const EMOTIONAL_INTENSITY = {
  calm: 0.24,
  curiosity: 0.32,
  hope: 0.4,
  safety: 0.36,
  relief: 0.46,
  confidence: 0.44,
  stability: 0.38,
  courage: 0.5,
  recognition: 0.52,
  sadness: 0.62,
  doubt: 0.58,
  hurt: 0.68,
  fear: 0.72,
  shame: 0.78,
};

const STORY_TEMPLATES = [
  "client mirror",
  "quiet realization",
  "myth correction",
  "body signal",
  "relationship loop",
  "therapeutic reframe",
  "small step",
];

const HOOK_FRAMES = [
  "If you notice this pattern",
  "Sometimes the problem is not what it seems",
  "A gentle reminder about",
  "The hidden cost of",
  "What changes when you understand",
  "You are not broken if",
];

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function round(value, digits = 3) {
  return Number(clamp(value, -999, 999).toFixed(digits));
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function overlapScore(left, right) {
  const a = new Set(left || []);
  const b = new Set(right || []);
  if (!a.size && !b.size) return 0;
  let overlap = 0;
  for (const item of a) {
    if (b.has(item)) overlap += 1;
  }
  return overlap / Math.max(a.size, b.size);
}

function semanticTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё ]/gi, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3);
}

function tokenSimilarity(left, right) {
  return overlapScore(semanticTokens(left), semanticTokens(right));
}

function relationshipWeight(a, b) {
  const cluster = a.cluster === b.cluster ? 0.36 : 0;
  const emotion = overlapScore(a.emotionalAssociations, b.emotionalAssociations) * 0.22;
  const authority = overlapScore(a.authorityDomains, b.authorityDomains) * 0.18;
  const trust = overlapScore(a.trustBuildingDomains, b.trustBuildingDomains) * 0.14;
  const conversion = overlapScore(a.conversionDrivingDomains, b.conversionDrivingDomains) * 0.06;
  const name = tokenSimilarity(a.label, b.label) * 0.04;
  return round(cluster + emotion + authority + trust + conversion + name);
}

function createTopicNode(seed, index) {
  return {
    id: `topic_${index + 1}`,
    label: seed.topic,
    cluster: seed.cluster || "general",
    semanticCluster: seed.cluster || "general",
    emotionalAssociations: unique(seed.emotions),
    authorityDomains: unique(seed.authorityDomains),
    trustBuildingDomains: unique(seed.trustDomains),
    conversionDrivingDomains: unique(seed.conversionDomains),
    occurrenceCount: 0,
    lastSeenDay: null,
    saturation: 0,
    noveltyScore: 1,
    memoryStrength: 0,
  };
}

function buildRelationships(nodes) {
  const relationships = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const source = nodes[i];
      const target = nodes[j];
      const weight = relationshipWeight(source, target);
      if (weight >= 0.12) {
        relationships.push({
          id: `rel_${source.id}_${target.id}`,
          source: source.id,
          target: target.id,
          relationshipType: source.cluster === target.cluster ? "cluster_affinity" : "adjacent_memory",
          weight,
          topicDistance: round(1 - weight),
          narrativeProximity: round((source.cluster === target.cluster ? 0.35 : 0.08) + weight * 0.55),
          emotionalOverlap: round(overlapScore(source.emotionalAssociations, target.emotionalAssociations)),
          trustOverlap: round(overlapScore(source.trustBuildingDomains, target.trustBuildingDomains)),
        });
      }
    }
  }
  return relationships.sort((a, b) => b.weight - a.weight);
}

function createInitialCognitiveState({ expertId = "dinara", generatedAt = new Date().toISOString(), topics } = {}) {
  const topicNodes = (topics || TOPIC_SEED_LIBRARY[expertId] || DEFAULT_SEEDS).map(createTopicNode);
  return {
    expertId,
    generatedAt,
    day: 0,
    topicGraph: {
      nodes: topicNodes,
      relationships: buildRelationships(topicNodes),
    },
    narrativeMemory: {
      arcs: [],
      recurringMotifs: {},
      unresolvedThreads: [],
      emotionalCallbacks: [],
      authorityProgression: [],
      audienceJourneyContinuity: [],
    },
    audienceMemory: {
      heardTopics: {},
      topicSaturation: {},
      repetitionProbability: {},
      emotionalFatigue: {},
      trustFamiliarity: {},
      noveltyScores: {},
      reinforcementOpportunities: [],
    },
    repetitionIntelligence: {
      conceptHistory: {},
      hookHistory: {},
      framingHistory: {},
      ctaStructureHistory: {},
      emotionalPacingHistory: [],
      storytellingTemplateHistory: {},
      warnings: [],
    },
    trustState: {
      authorityGrowth: 0.12,
      emotionalTrustGrowth: 0.14,
      educationalTrust: 0.16,
      vulnerabilityTrust: 0.1,
      consistencyTrust: 0.13,
      audienceFamiliarity: 0.08,
      trustTrajectory: [],
      authorityTrajectory: [],
    },
    ctaMemory: {
      history: [],
      escalationPacing: [],
      consultationPressureAccumulation: 0,
      ctaDesensitizationRisk: 0,
      conversionSequenceMemory: [],
    },
    emotionalProgression: {
      cycles: [],
      emotionalOverloadRisk: 0,
      pacingBalance: 1,
      therapeuticDepthProgression: [],
      audienceEmotionalSaturation: {},
    },
    identityEvolution: {
      positioning: "warm expert guide in psychology and sexology",
      dominantIdentityTraits: ["warm", "precise", "nonjudgmental", "therapeutic"],
      authorityArchetypeEvolution: [],
      communicationDrift: 0,
      voiceConsistency: 1,
    },
    conceptReinforcement: {
      conceptsRequiringReinforcement: [],
      weakAudienceMemoryZones: [],
      forgottenEducationalConcepts: [],
      idealCallbackTiming: [],
      trustReinforcementOpportunities: [],
    },
    recommendations: [],
  };
}

function findTopic(state, topicLabel) {
  const normalized = String(topicLabel || "").toLowerCase();
  return state.topicGraph.nodes.find((node) => node.label.toLowerCase() === normalized)
    || state.topicGraph.nodes[0];
}

function recentEntries(history, day, window = 14) {
  return (history || []).filter((entry) => day - entry.day <= window);
}

function incrementMap(map, key, amount = 1) {
  map[key] = round((map[key] || 0) + amount);
}

function updateTopicMemory(state, node, event) {
  node.occurrenceCount += 1;
  node.lastSeenDay = event.day;
  node.saturation = round(clamp(node.saturation * 0.9 + 0.12 + node.occurrenceCount * 0.012));
  node.memoryStrength = round(clamp(node.memoryStrength * 0.92 + 0.22));
  node.noveltyScore = round(clamp(1 - node.saturation));

  state.audienceMemory.heardTopics[node.label] = {
    count: node.occurrenceCount,
    lastHeardDay: event.day,
    memoryStrength: node.memoryStrength,
  };
  state.audienceMemory.topicSaturation[node.label] = node.saturation;
  state.audienceMemory.repetitionProbability[node.label] = round(clamp(node.saturation + node.occurrenceCount * 0.025));
  state.audienceMemory.trustFamiliarity[node.label] = round(clamp((state.audienceMemory.trustFamiliarity[node.label] || 0) + 0.08));
  state.audienceMemory.noveltyScores[node.label] = node.noveltyScore;
}

function updateNarrativeMemory(state, node, event) {
  const arcId = `${node.cluster}_arc`;
  let arc = state.narrativeMemory.arcs.find((item) => item.id === arcId);
  if (!arc) {
    arc = {
      id: arcId,
      cluster: node.cluster,
      title: `${node.cluster} continuity arc`,
      startedDay: event.day,
      lastUpdatedDay: event.day,
      stage: "opening",
      contentDays: [],
      primaryTopics: [],
      emotionalPath: [],
      openThreads: [],
    };
    state.narrativeMemory.arcs.push(arc);
  }

  arc.lastUpdatedDay = event.day;
  arc.contentDays.push(event.day);
  arc.primaryTopics = unique([...arc.primaryTopics, node.label]);
  arc.emotionalPath.push(event.emotionalTone);
  arc.stage = arc.contentDays.length >= 7 ? "deepening" : arc.contentDays.length >= 3 ? "building" : "opening";

  incrementMap(state.narrativeMemory.recurringMotifs, event.storyTemplate, 1);
  if (event.intent === "storytelling" || event.intent === "therapeutic") {
    const thread = {
      id: `thread_${event.day}_${node.id}`,
      day: event.day,
      topic: node.label,
      question: `Continue the ${node.cluster} arc with a grounded next step.`,
      status: event.day % 4 === 0 ? "unresolved" : "softly_resolved",
    };
    arc.openThreads.push(thread.id);
    if (thread.status === "unresolved") state.narrativeMemory.unresolvedThreads.push(thread);
  }

  state.narrativeMemory.emotionalCallbacks.push({
    day: event.day,
    topic: node.label,
    emotion: event.emotionalTone,
    callbackAfterDays: event.emotionalTone === "shame" || event.emotionalTone === "fear" ? 10 : 16,
  });
  state.narrativeMemory.authorityProgression.push({
    day: event.day,
    domain: node.authorityDomains[0],
    authorityScore: state.trustState.authorityGrowth,
  });
  state.narrativeMemory.audienceJourneyContinuity.push({
    day: event.day,
    topic: node.label,
    journeyState: event.audienceState,
    continuityNote: `${node.cluster} thread expanded through ${event.intent}.`,
  });
}

function updateRepetitionIntelligence(state, event) {
  const conceptKey = event.topic;
  incrementMap(state.repetitionIntelligence.conceptHistory, conceptKey, 1);
  incrementMap(state.repetitionIntelligence.hookHistory, event.hookFrame, 1);
  incrementMap(state.repetitionIntelligence.framingHistory, event.framing, 1);
  incrementMap(state.repetitionIntelligence.ctaStructureHistory, event.ctaType, 1);
  incrementMap(state.repetitionIntelligence.storytellingTemplateHistory, event.storyTemplate, 1);
  state.repetitionIntelligence.emotionalPacingHistory.push({
    day: event.day,
    emotion: event.emotionalTone,
    intensity: event.emotionalIntensity,
  });

  const warnings = [];
  if (state.repetitionIntelligence.conceptHistory[conceptKey] >= 5) {
    warnings.push({
      day: event.day,
      type: "repeated_concept",
      severity: state.repetitionIntelligence.conceptHistory[conceptKey] >= 8 ? "high" : "medium",
      value: conceptKey,
      score: round(clamp(state.repetitionIntelligence.conceptHistory[conceptKey] / 10)),
      message: `Concept "${conceptKey}" is becoming semantically familiar; revisit through a new adjacent topic.`,
    });
  }
  if (state.repetitionIntelligence.hookHistory[event.hookFrame] >= 4) {
    warnings.push({
      day: event.day,
      type: "repeated_hook",
      severity: "medium",
      value: event.hookFrame,
      score: round(clamp(state.repetitionIntelligence.hookHistory[event.hookFrame] / 8)),
      message: `Hook frame "${event.hookFrame}" is recurring often enough to create pattern recognition.`,
    });
  }
  if (state.repetitionIntelligence.ctaStructureHistory[event.ctaType] >= 7 && CTA_WEIGHTS[event.ctaType] > 0.3) {
    warnings.push({
      day: event.day,
      type: "repeated_cta_structure",
      severity: "high",
      value: event.ctaType,
      score: round(clamp(state.repetitionIntelligence.ctaStructureHistory[event.ctaType] / 10)),
      message: `${event.ctaType} is overrepresented; cool down conversion pressure.`,
    });
  }
  state.repetitionIntelligence.warnings.push(...warnings);
}

function updateTrustState(state, node, event) {
  const authorityDelta = event.intent === "authority" || event.intent === "educational" ? 0.025 : 0.012;
  const emotionalDelta = ["recognition", "relief", "safety", "hope"].includes(event.emotionalTone) ? 0.02 : 0.01;
  const vulnerabilityDelta = ["shame", "fear", "hurt", "sadness"].includes(event.emotionalTone) ? 0.018 : 0.006;
  const consistencyDelta = 0.008 + Math.min(node.occurrenceCount, 5) * 0.002;

  state.trustState.authorityGrowth = round(clamp(state.trustState.authorityGrowth + authorityDelta));
  state.trustState.emotionalTrustGrowth = round(clamp(state.trustState.emotionalTrustGrowth + emotionalDelta));
  state.trustState.educationalTrust = round(clamp(state.trustState.educationalTrust + (event.intent === "educational" ? 0.026 : 0.008)));
  state.trustState.vulnerabilityTrust = round(clamp(state.trustState.vulnerabilityTrust + vulnerabilityDelta));
  state.trustState.consistencyTrust = round(clamp(state.trustState.consistencyTrust + consistencyDelta));
  state.trustState.audienceFamiliarity = round(clamp(state.trustState.audienceFamiliarity + 0.01 + node.memoryStrength * 0.006));

  const trustScore = round((
    state.trustState.authorityGrowth
    + state.trustState.emotionalTrustGrowth
    + state.trustState.educationalTrust
    + state.trustState.vulnerabilityTrust
    + state.trustState.consistencyTrust
    + state.trustState.audienceFamiliarity
  ) / 6);
  state.trustState.trustTrajectory.push({ day: event.day, score: trustScore, topic: node.label });
  state.trustState.authorityTrajectory.push({
    day: event.day,
    score: state.trustState.authorityGrowth,
    domain: node.authorityDomains[0],
  });
}

function updateCtaMemory(state, event) {
  const pressure = CTA_WEIGHTS[event.ctaType] ?? 0.2;
  const recentCtas = recentEntries(state.ctaMemory.history, event.day, 14);
  const recentPressure = recentCtas.reduce((sum, item) => sum + item.pressure, 0);
  state.ctaMemory.history.push({
    day: event.day,
    ctaType: event.ctaType,
    pressure,
    topic: event.topic,
    audienceState: event.audienceState,
  });
  state.ctaMemory.escalationPacing.push({
    day: event.day,
    ctaType: event.ctaType,
    pressure,
    escalationLevel: pressure >= 0.55 ? "high" : pressure >= 0.3 ? "medium" : "low",
  });
  state.ctaMemory.consultationPressureAccumulation = round(clamp(recentPressure / 6));
  state.ctaMemory.ctaDesensitizationRisk = round(clamp(
    state.ctaMemory.consultationPressureAccumulation
    + (recentCtas.filter((item) => item.ctaType === event.ctaType).length / 12),
  ));
  state.ctaMemory.conversionSequenceMemory.push({
    day: event.day,
    stage: pressure >= 0.55 ? "direct_conversion" : pressure >= 0.3 ? "soft_conversion" : "trust_or_education",
    ctaType: event.ctaType,
  });
}

function updateEmotionalProgression(state, event) {
  const recent = recentEntries(state.emotionalProgression.cycles, event.day, 10);
  const recentAverage = recent.length
    ? recent.reduce((sum, item) => sum + item.intensity, 0) / recent.length
    : event.emotionalIntensity;
  state.emotionalProgression.cycles.push({
    day: event.day,
    emotion: event.emotionalTone,
    intensity: event.emotionalIntensity,
    topic: event.topic,
  });
  incrementMap(state.emotionalProgression.audienceEmotionalSaturation, event.emotionalTone, event.emotionalIntensity * 0.12);
  state.emotionalProgression.emotionalOverloadRisk = round(clamp((recentAverage - 0.42) * 1.6));
  state.emotionalProgression.pacingBalance = round(clamp(1 - state.emotionalProgression.emotionalOverloadRisk));
  state.emotionalProgression.therapeuticDepthProgression.push({
    day: event.day,
    depth: round(clamp(event.emotionalIntensity * 0.55 + (event.intent === "therapeutic" ? 0.25 : 0.08))),
    note: event.intent === "therapeutic" ? "Therapeutic depth increased." : "Depth kept in content-safe range.",
  });
}

function updateIdentityEvolution(state, event) {
  const recent = recentEntries(state.narrativeMemory.audienceJourneyContinuity, event.day, 30);
  const authorityShare = recent.filter((item) => ["authority", "educational"].includes(event.intent)).length / Math.max(1, recent.length);
  state.identityEvolution.authorityArchetypeEvolution.push({
    day: event.day,
    archetype: event.intent === "authority" ? "expert educator" : event.intent === "storytelling" ? "therapeutic narrator" : "warm guide",
    topic: event.topic,
  });
  state.identityEvolution.communicationDrift = round(clamp(Math.abs(0.45 - authorityShare) * 0.35));
  state.identityEvolution.voiceConsistency = round(clamp(1 - state.identityEvolution.communicationDrift));
}

function updateConceptReinforcement(state, day) {
  const weakZones = state.topicGraph.nodes
    .filter((node) => node.occurrenceCount > 0 && node.memoryStrength < 0.45)
    .map((node) => ({ topic: node.label, memoryStrength: node.memoryStrength, reason: "early exposure not reinforced" }));
  const forgotten = state.topicGraph.nodes
    .filter((node) => node.lastSeenDay && day - node.lastSeenDay >= 21 && node.memoryStrength < 0.72)
    .map((node) => ({ topic: node.label, daysSinceSeen: day - node.lastSeenDay, memoryStrength: node.memoryStrength }));
  const saturation = Object.entries(state.audienceMemory.topicSaturation)
    .filter(([, score]) => score >= 0.62)
    .map(([topic, score]) => ({ topic, saturation: score, recommendation: "Use adjacent callback instead of direct repetition." }));

  state.conceptReinforcement.conceptsRequiringReinforcement = weakZones.slice(0, 8);
  state.conceptReinforcement.weakAudienceMemoryZones = weakZones.slice(0, 8);
  state.conceptReinforcement.forgottenEducationalConcepts = forgotten.slice(0, 8);
  state.conceptReinforcement.idealCallbackTiming = forgotten.slice(0, 8).map((item) => ({
    topic: item.topic,
    idealCallbackDay: day + 3,
    reason: "Memory decay window reached.",
  }));
  state.conceptReinforcement.trustReinforcementOpportunities = saturation.slice(0, 8);
  state.audienceMemory.reinforcementOpportunities = [
    ...state.conceptReinforcement.conceptsRequiringReinforcement,
    ...state.conceptReinforcement.forgottenEducationalConcepts,
  ].slice(0, 10);
}

function generateRecommendations(state) {
  const latestWarnings = state.repetitionIntelligence.warnings.slice(-8);
  const latestTrust = state.trustState.trustTrajectory.at(-1)?.score || 0;
  const ctaRisk = state.ctaMemory.ctaDesensitizationRisk;
  const overload = state.emotionalProgression.emotionalOverloadRisk;
  const unresolved = state.narrativeMemory.unresolvedThreads.filter((thread) => thread.status === "unresolved").slice(-3);
  const forgotten = state.conceptReinforcement.forgottenEducationalConcepts.slice(0, 3);

  const recommendations = [];
  for (const thread of unresolved) {
    recommendations.push({
      type: "narrative_continuation",
      priority: "high",
      target: thread.topic,
      recommendation: `Continue unresolved thread from day ${thread.day} with one concrete next-step post.`,
    });
  }
  if (!unresolved.length && state.narrativeMemory.arcs.length) {
    const latestArc = [...state.narrativeMemory.arcs].sort((a, b) => b.lastUpdatedDay - a.lastUpdatedDay)[0];
    recommendations.push({
      type: "narrative_continuation",
      priority: "medium",
      target: latestArc.primaryTopics.at(-1) || latestArc.cluster,
      recommendation: `Continue the ${latestArc.cluster} arc from day ${latestArc.lastUpdatedDay} with a fresh emotional callback.`,
    });
  }
  for (const item of forgotten) {
    recommendations.push({
      type: "topic_revisiting",
      priority: "medium",
      target: item.topic,
      recommendation: `Reinforce ${item.topic} through a callback or FAQ before memory decays further.`,
    });
  }
  if (overload > 0.42) {
    recommendations.push({
      type: "emotional_balancing",
      priority: "high",
      target: "emotional cadence",
      recommendation: "Insert calmer educational or stabilizing content before another high-vulnerability post.",
    });
  }
  if (latestTrust < 0.58) {
    recommendations.push({
      type: "trust_pacing",
      priority: "medium",
      target: "trust trajectory",
      recommendation: "Use practical psychoeducation and gentle recognition before escalating offers.",
    });
  }
  if (ctaRisk > 0.55) {
    recommendations.push({
      type: "cta_cooldown",
      priority: "high",
      target: "conversion pressure",
      recommendation: "Pause direct consultation CTAs for several posts and use save/share or reflective CTAs.",
    });
  }
  if (latestWarnings.some((warning) => warning.type === "repeated_hook")) {
    recommendations.push({
      type: "novelty_injection",
      priority: "medium",
      target: "hook framing",
      recommendation: "Rotate away from repeated hooks and open with a case contrast or myth correction.",
    });
  }
  recommendations.push({
    type: "authority_reinforcement",
    priority: "medium",
    target: state.narrativeMemory.authorityProgression.at(-1)?.domain || "core expertise",
    recommendation: "Tie the next educational post to a named domain so authority growth remains explicit.",
  });
  recommendations.push({
    type: "storytelling_evolution",
    priority: "low",
    target: "motif variety",
    recommendation: "Alternate client mirror stories with myth correction or body signal motifs.",
  });

  state.recommendations = recommendations;
  return recommendations;
}

function observeContentEvent(state, eventInput) {
  const event = {
    day: eventInput.day || state.day + 1,
    topic: eventInput.topic,
    intent: eventInput.intent || "educational",
    ctaType: eventInput.ctaType || "low_pressure_cta",
    hookFrame: eventInput.hookFrame || "A gentle reminder about",
    framing: eventInput.framing || "recognition_to_reframe",
    storyTemplate: eventInput.storyTemplate || "therapeutic reframe",
    emotionalTone: eventInput.emotionalTone || "recognition",
    audienceState: eventInput.audienceState || "warming",
  };
  event.emotionalIntensity = round(EMOTIONAL_INTENSITY[event.emotionalTone] ?? 0.45);

  const node = findTopic(state, event.topic);
  event.topic = node.label;
  state.day = Math.max(state.day, event.day);

  updateTopicMemory(state, node, event);
  updateNarrativeMemory(state, node, event);
  updateRepetitionIntelligence(state, event);
  updateTrustState(state, node, event);
  updateCtaMemory(state, event);
  updateEmotionalProgression(state, event);
  updateIdentityEvolution(state, event);
  updateConceptReinforcement(state, event.day);
  generateRecommendations(state);
  return state;
}

function getTopRelationships(state, limit = 8) {
  return state.topicGraph.relationships.slice(0, limit).map((relationship) => {
    const source = state.topicGraph.nodes.find((node) => node.id === relationship.source);
    const target = state.topicGraph.nodes.find((node) => node.id === relationship.target);
    return {
      ...relationship,
      sourceLabel: source?.label,
      targetLabel: target?.label,
    };
  });
}

function scoreTopicDistance(state, leftTopic, rightTopic) {
  const left = findTopic(state, leftTopic);
  const right = findTopic(state, rightTopic);
  if (!left || !right || left.id === right.id) return 0;
  const direct = state.topicGraph.relationships.find((relationship) => (
    (relationship.source === left.id && relationship.target === right.id)
    || (relationship.source === right.id && relationship.target === left.id)
  ));
  return direct ? direct.topicDistance : round(1 - relationshipWeight(left, right));
}

function scoreNarrativeProximity(state, leftTopic, rightTopic) {
  const left = findTopic(state, leftTopic);
  const right = findTopic(state, rightTopic);
  if (!left || !right || left.id === right.id) return 1;
  const direct = state.topicGraph.relationships.find((relationship) => (
    (relationship.source === left.id && relationship.target === right.id)
    || (relationship.source === right.id && relationship.target === left.id)
  ));
  return direct ? direct.narrativeProximity : round(relationshipWeight(left, right) * 0.6);
}

function scoreEmotionalOverlap(state, leftTopic, rightTopic) {
  const left = findTopic(state, leftTopic);
  const right = findTopic(state, rightTopic);
  return round(overlapScore(left?.emotionalAssociations, right?.emotionalAssociations));
}

export {
  CTA_WEIGHTS,
  EMOTIONAL_INTENSITY,
  HOOK_FRAMES,
  STORY_TEMPLATES,
  TOPIC_SEED_LIBRARY,
  createInitialCognitiveState,
  generateRecommendations,
  getTopRelationships,
  observeContentEvent,
  scoreEmotionalOverlap,
  scoreNarrativeProximity,
  scoreTopicDistance,
};
