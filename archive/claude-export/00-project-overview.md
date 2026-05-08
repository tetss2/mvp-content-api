# Контент-завод — Project Overview & System Map

## Что это

AI-система генерации контента для психолога Динары Качаевой (@dinara_psych).
Пользователь пишет запрос → система генерирует текст, голос, фото, видео от лица Динары.

## Репозитории

| Репо | Назначение | Хостинг |
|------|-----------|---------|
| `tetss2/mvp-content-api` | Основной бот @mvpdi1_bot | Railway |
| `tetss2/psycholog-landing` | Сайт Динары | Vercel → НЕ ТРОГАТЬ |
| `ai-landing` | Лендинг сервиса | Vercel |

## Telegram боты

| Бот | Назначение |
|-----|-----------|
| @mvpdi1_bot | Основной контент-бот |
| @di1leads_bot | Лид-бот (сбор телефонов демо-пользователей) |
| TetssTelegramClickUp_bot | Парсинг чатов в задачи ClickUp |

## Карта подсистем

```
┌─────────────────────────────────────────────────────────────────┐
│                    КОНТЕНТ-ЗАВОД (mvp-content-api)              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TELEGRAM UI LAYER                                              │
│  ├── Inline keyboard (сценарий, длина, редакт, публикация)      │
│  ├── Reply keyboard (кнопка Старт)                              │
│  └── Force reply (редактирование текста)                         │
│                                                                  │
│  STATE MACHINE (userState Map)                                  │
│  ├── scenario: 'psychologist' | 'sexologist'                    │
│  ├── textLength: 'short' | 'normal' | 'long'                    │
│  ├── lastFullAnswer, lastTopic, lastImageUrl, lastVideoUrl       │
│  ├── lastAudioBuffer, pendingVoices                             │
│  ├── suggestedTracks (музыка)                                   │
│  └── awaitingTextEdit, awaitingCustomScene                       │
│                                                                  │
│  GENERATION PIPELINE                                            │
│  ├── Text: OpenAI GPT-4o-mini + semantic search                 │
│  ├── Voice: Fish Audio (основной) / Cartesia (резерв)           │
│  ├── Photo: fal.ai FLUX LoRA (dinara_psych LoRA)               │
│  ├── Video: fal-ai/creatify/aurora (Kling LipSync)              │
│  └── Music: Freesound CDN (hardcoded preview URLs)              │
│                                                                  │
│  PUBLISHING                                                     │
│  ├── TG_CHANNEL = -1003990844834                               │
│  └── Кнопка "Опубликовать" → sendMessage/sendVideo в канал     │
│                                                                  │
│  DEMO ACCESS SYSTEM                                             │
│  ├── demo-users.json (локальный файл)                           │
│  ├── Лимиты: фото ≤15, видео ≤1, срок ≤7 дней                 │
│  ├── Привязка к телефону через Telegram OAuth                   │
│  └── Admin bypass: chatId === ADMIN_TG_ID (109664871)          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              TELEGRAM → CLICKUP BOT (отдельный проект)          │
├─────────────────────────────────────────────────────────────────┤
│  TetssTelegramClickUp_bot                                       │
│  ├── Webhook mode на Railway                                    │
│  ├── Парсит все сообщения + голосовые (Whisper)                 │
│  ├── GPT извлекает задачи                                       │
│  ├── Inline keyboard: выбор/снятие задач, редактирование        │
│  ├── Автоматический выбор списка через CHAT_LIST_MAP            │
│  └── Deduplicate + author attribution                           │
└─────────────────────────────────────────────────────────────────┘
```

## Технический стек

- **Runtime**: Node.js (ESM, `import/export`)
- **Telegram**: `node-telegram-bot-api` 
- **AI text**: OpenAI GPT-4o-mini
- **AI voice**: Fish Audio API (primary), Cartesia (secondary)
- **AI image**: fal.ai (FLUX LoRA — обученная LoRA `dinara_psych`)
- **AI video**: fal-ai/creatify/aurora (Kling LipSync)
- **Audio mixing**: ffmpeg (системная зависимость)
- **Transcription**: OpenAI Whisper
- **Knowledge base**: `articles.production.json` (локальный JSON)
- **Hosting**: Railway (bot), Vercel (landing pages)
- **Version control**: GitHub (tetss2)
- **Task management**: ClickUp (MCP-интеграция)

## Ключевые люди

| Человек | Роль |
|---------|------|
| Дмитрий Качаев (@tetss2, 109664871) | Разработчик/владелец |
| Динара Качаева | Клиент (психолог), контент-персона |

## Канал публикации

`https://t.me/+fAQZ52F0GD9kODQy` → chat_id: `-1003990844834`
