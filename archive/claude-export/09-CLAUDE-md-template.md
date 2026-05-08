# CLAUDE.md — Контент-завод / mvp-content-api

> Этот файл читается автоматически при запуске Claude Code в папке проекта.
> Обновлять при изменении архитектуры или ключевых решений.

## Проект

**Название:** Контент-завод (@mvpdi1_bot)
**Назначение:** AI-бот для генерации контента от лица психолога Динары Качаевой
**Репо:** github.com/tetss2/mvp-content-api
**Хостинг:** Railway (проект zestful-respect)
**Владелец:** Дмитрий Качаев (@tetss2, TG ID: 109664871)

## Stack

- Node.js ESM (import/export, НЕ require)
- node-telegram-bot-api (polling mode)
- OpenAI GPT-4o-mini + Whisper
- Fish Audio (TTS, primary)
- Cartesia (TTS, backup)
- fal.ai FLUX LoRA + Aurora video
- ffmpeg (системная зависимость — через Dockerfile)

## Ключевые файлы

- `index.js` — всё в одном файле (handlers, generation, state)
- `articles.production.json` — knowledge base (~8 КБ)
- `demo-users.json` — демо-доступы (НЕ в git)
- `Dockerfile` — node:22-slim + ffmpeg

## Переменные окружения (Railway)

```
TELEGRAM_TOKEN
OPENAI_API_KEY
FISH_AUDIO_API_KEY
FISH_AUDIO_VOICE_ID=e2b7cf9e15ce45fbb1352270fde43647
CARTESIA_API_KEY
CARTESIA_VOICE_ID=c23f663b-832b-4361-8187-dab45568a01c
FALAI_KEY
TG_CHANNEL=-1003990844834
ADMIN_TG_ID=109664871
FREESOUND_TOKEN
```

## Правила при работе с кодом

1. **ВСЕГДА присылать полный файл** — никогда не фрагменты с "замените строку X"
2. **Не ломать рабочую архитектуру** без явной причины
3. **Не предлагать ElevenLabs** — не работает из России даже с VPN
4. **Голос** — только Fish Audio или Cartesia
5. **Хостинг бота** — только Railway
6. **Не трогать** репо tetss2/psycholog-landing (сайт Динары — отдельный проект)

## Критические знания

- HTTP keepalive ОБЯЗАТЕЛЕН: `http.createServer().listen(PORT)`
- Node.js 22 (не 20) из-за Supabase WebSocket
- Group Privacy = DISABLED в BotFather для получения сообщений в группах
- Webhook: `deleteWebHook()` перед `setWebHook()`
- GitHub MCP: `create_or_update_file` по одному файлу, всегда с SHA

## ClickUp (via MCP)

- Folder: 901210869335 (Контент-завод — Динара)
- Бэклог list: 901217685475
- KNS.COM.UA list: 901217638282
- Dinara TG chat → Бэклог
- KNS TG chat → KNS.COM.UA
