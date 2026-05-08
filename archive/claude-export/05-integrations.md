# Integrations & Services

## APIs и провайдеры

### OpenAI
| Параметр | Значение |
|---------|---------|
| Использование | Text generation, voice transcription |
| Models | `gpt-4o-mini` (text), `whisper-1` (transcription) |
| Env var | `OPENAI_API_KEY` |
| Endpoint | api.openai.com |
| SDK | `openai` npm package |

---

### Fish Audio
| Параметр | Значение |
|---------|---------|
| Использование | TTS — клон голоса Динары (основной) |
| Voice ID | `e2b7cf9e15ce45fbb1352270fde43647` |
| Env vars | `FISH_AUDIO_API_KEY`, `FISH_AUDIO_VOICE_ID` |
| Endpoint | `https://api.fish.audio/v1/tts` |
| SDK | native fetch |
| Стоимость | ~$0.000008/символ ($0.008/1000 символов) |

---

### Cartesia
| Параметр | Значение |
|---------|---------|
| Использование | TTS резервный |
| Voice ID | `c23f663b-832b-4361-8187-dab45568a01c` |
| Env vars | `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID` |
| Endpoint | `https://api.cartesia.ai/tts/bytes` |
| Model | `sonic-multilingual` |
| SDK | native fetch |

> ⚠️ **ЗАПРЕТ**: никогда не использовать **ElevenLabs** — не работает из России даже с VPN.

---

### fal.ai
| Параметр | Значение |
|---------|---------|
| Использование | Генерация фото (LoRA) и видео |
| Env var | `FALAI_KEY` |
| Dashboard | https://fal.ai/dashboard/keys |
| SDK | `@fal-ai/client` npm package |
| Баланс (на момент разработки) | ~$16.61 |

**Модели:**
| Модель | Использование | Стоимость |
|-------|-------------|---------|
| `flux-lora-fast-training` | Обучение LoRA | ~$1-2 разово |
| `fal-ai/flux/dev` + LoRA | Генерация фото | $0.021/фото |
| `fal-ai/creatify/aurora` | LipSync видео (Kling) | $0.014/сек |

**LoRA параметры:**
- Scale: `0.85`
- Steps: `35`
- Size: `1024x1024`
- Trigger word: `dinara_psych`

---

### Freesound API
| Параметр | Значение |
|---------|---------|
| Использование | Фоновая музыка для аудио |
| Env var | `FREESOUND_TOKEN` |
| URL формат | `https://cdn.freesound.org/previews/[prefix]/[soundID]_[userID]-lq.mp3` |
| Auth | query param `?token=...` (НЕ Bearer header) |

> ⚠️ `userID` в URL нельзя вычислить — нужно поймать из Network tab браузера при воспроизведении.
> Hardcoded preview URLs более надёжны чем динамический поиск.

**Почему не другие:**
- mixkit.co → 403 на Railway
- Pixabay CDN → блокирует
- Freesound preview URLs → работают стабильно

---

### Telegram Bot API
| Параметр | Значение |
|---------|---------|
| Library | `node-telegram-bot-api` |
| Mode @mvpdi1_bot | polling |
| Mode TetssTelegramClickUp_bot | webhook |
| Env var | `TELEGRAM_TOKEN` |
| Admin ID | `109664871` |
| Channel ID | `-1003990844834` |
| Env var channel | `TG_CHANNEL` |

---

### ClickUp
| Параметр | Значение |
|---------|---------|
| Использование | Управление задачами проекта |
| Integration | MCP сервер (Claude connectors) |
| Workspace | Team Space |
| Folder | 🧠 Контент-завод — Динара (ID: 901210869335) |
| Lists | Бэклог (901217685475), В работе, Готово |
| KNS list | KNS.COM.UA (901217638282) |

**ClickUp → TG Bot mapping:**
```
Dinara chat (-5100501373) → Бэклог (901217685475)
KNS chat (-5143205191) → KNS.COM.UA (901217638282)
```

---

### GitHub
| Параметр | Значение |
|---------|---------|
| Account | tetss2 |
| Main repo | `tetss2/mvp-content-api` |
| Integration | GitHub MCP (Claude connectors) |
| Branch | `main` |

**Известные ограничения GitHub MCP:**
- `push_files` с несколькими файлами → timeout
- `create_or_update_file` для больших файлов (>800KB base64) → ошибка
- Решение: Claude Code локально

---

## npm пакеты

```json
{
  "dependencies": {
    "node-telegram-bot-api": "latest",
    "openai": "latest",
    "@fal-ai/client": "latest"
  }
}
```

> `ffmpeg` — системная зависимость (через Dockerfile apt-get), не npm.

---

## Сервисы которые рассматривались и отклонены

| Сервис | Почему отклонён |
|-------|---------------|
| ElevenLabs | Не работает из России даже с VPN |
| Render | Free tier засыпает через 15 мин |
| n8n | Избыточен пока бот нестабилен; stateless — не подходит для диалогового бота |
| Supabase | Рассматривался для хранения статей и демо-пользователей; требует Node 22 |
| MiniMax video | Дорого ($0.50), среднее качество |
| Seedance 2.0 | Блокирует реальных людей |
| Kling v3 Pro | Хорошее качество, но дороже Aurora |
| Hetzner | Рассматривался как VPS, не использован |
| Vercel (для бота) | Serverless — не держит polling соединение |
| Cloudflare Turnstile | Используется на landing page Динары |

---

## Инструменты разработки

| Инструмент | Назначение |
|-----------|-----------|
| Claude Code | Локальные правки кода (Windows) |
| Claude.ai Project | Стратегия, архитектура, планирование |
| CLAUDE.md | Автоконтекст для Claude Code |
| .claudeignore | Исключения для Claude Code (экономия токенов) |
| Railway Dashboard | Деплой, переменные, логи |
| GitHub | Хранение кода, CI/CD hook для Railway |
