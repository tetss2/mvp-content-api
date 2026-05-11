# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What This Project Does

AI-powered Telegram bot that generates psychological/sexological social media content for a specific Russian psychologist (Dinara Kachayeva). The bot produces text posts, AI voice synthesis, background music mixing, AI-generated images, and talking-head videos — all in Russian, in the psychologist's authentic voice.

## Commands

```bash
npm start           # Start bot in Telegram polling mode
npm run index       # Index knowledge base files into Supabase pgvector
node scripts/indexer.js --force --scenario psychologist  # Re-index specific scenario
node scripts/whisper.js <file>  # Transcribe audio/video via OpenAI Whisper
```

No test or lint scripts are configured.

## Required Environment Variables

```
TELEGRAM_TOKEN
OPENAI_API_KEY
FISH_AUDIO_API_KEY, FISH_AUDIO_VOICE_ID
FALAI_KEY
CLOUDINARY_CLOUD, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
```

Supabase requires a custom RPC: `match_chunks(query_embedding, match_scenario, match_count)`.

## Architecture

All bot logic lives in **`index.js`** (~1260 lines). There is no separation into modules — state, UI, API calls, and content generation are all inline.

**Content generation pipeline per user request:**
1. User sends topic via Telegram → stored in `userState` Map (keyed by `chatId`, in-memory only)
2. RAG: vector search via Supabase `match_chunks()` → fallback to keyword search on `articles.production.json` (psychologist only) → fallback to generic knowledge
3. OpenAI GPT-4o-mini generates post using scenario-specific system prompt + retrieved context
4. Optional: Fish Audio generates Russian TTS voice
5. Optional: ffmpeg mixes voice with mood-matched background music (10-track static library)
6. Optional: FAL.ai Flux LoRA generates image of Dinara; FAL.ai Aurora creates talking-head video
7. Optional: Cloudinary hosts audio for video generation pipeline
8. User picks delivery format: text only / text + photo / text + video

**Two scenarios with distinct system prompts:**
- `psychologist`: `PSYCHOLOGIST_SYSTEM_PROMPT` constant — warm, introspective, metaphors
- `sexologist`: `buildSexologistPrompt(style)` function — 5 style modes: `scientific`, `friendly`, `girlfriends`, `educational`, `auto`

**Supporting files:**
- `scripts/indexer.js` — scans `sources/{psychologist,sexologist}/`, parses PDF/DOCX/TXT, creates OpenAI embeddings, upserts to Supabase
- `scripts/whisper.js` — splits files >25MB, transcribes with Whisper API
- `articles.production.json` — static fallback knowledge base (~50 psychology articles)
- `api/webhook.js` — unused webhook handler (bot runs in polling mode)

## Key Patterns

**Telegram callback data 64-byte limit:** Quick topic buttons use numeric indexes (`qt:0`, `qt:1`) instead of Cyrillic text. Composite callbacks like `music_next:1`, `confirm_voice:2`, `make_video:photo_123`.

**User state:** `userState = new Map()` — no persistence, resets on restart. Fields include `pendingTopic`, `pendingScenario`, `pendingLengthMode`, `lastFullAnswer`, `onboardingDisabled`, etc.

**Post length modes:** short (~600 chars / 2 paragraphs), normal (~1200 / 3-4), long (~1800 / 5-6) — controlled via `max_tokens` + system prompt instructions.

**Video generation:** FAL.ai async queue polled every 5s, max 48 iterations (4 min timeout), user notified every 30s.

**Markdown stripping:** `*text*` and `_text_` removed before sending to Telegram photo/video captions to avoid parse errors.

**Music mixing:** ffmpeg `amix` filter, music at -13dB (13% volume), voice at 0dB.
