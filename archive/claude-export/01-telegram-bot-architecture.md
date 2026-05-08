# Telegram Bot Architecture — @mvpdi1_bot

## Основные параметры

| Параметр | Значение |
|---------|---------|
| Bot username | @mvpdi1_bot |
| Bot token env | `TELEGRAM_TOKEN` |
| Library | `node-telegram-bot-api` |
| Mode | **polling** (НЕ webhook) |
| Entry point | `index.js` |
| Admin TG ID | `109664871` (@tetss2) |
| TG Channel ID | `-1003990844834` |

> ⚠️ Примечание: TetssTelegramClickUp_bot работает в **webhook** режиме. @mvpdi1_bot — в polling.

## Message Flow

```
User message
    │
    ▼
bot.on('message')
    │
    ├─ Voice/Video Note → Whisper transcription → treat as text
    │
    ├─ Text in awaitingTextEdit mode → save as lastFullAnswer
    │
    ├─ Text in awaitingCustomScene mode → save as customScene → generate photo
    │
    └─ Regular text → set lastTopic → show [Психолог | Сексолог] keyboard
                                              │
                              ┌───────────────┴──────────────┐
                              ▼                              ▼
                      scenario='psychologist'        scenario='sexologist'
                              │                              │
                              └──────────┬───────────────────┘
                                         ▼
                               Show length keyboard:
                               [Короткий | Обычный | Длинный]
                                         │
                                         ▼
                               generateAnswer(chatId, topic, scenario, length)
                                         │
                                         ▼
                               sendGeneratedText(chatId, text, scenario)
                                         │
                                         ▼
                               generateVoice → sendVoice
                                         │
                                         ▼
                               Show photo keyboard:
                               [📸 По теме | 🏢 В кабинете | ✏️ Свой вариант]
```

## Callback Query Flow (Inline Keyboard)

```
bot.on('callback_query', data)
    │
    ├─ "psych" / "sex"          → set scenario → show length keyboard
    ├─ "len_short/normal/long"  → set textLength → generateAnswer()
    ├─ "text_edit"              → send text as message + force_reply
    ├─ "text_ready"             → generateVoice() → show photo keyboard
    ├─ "photo_topic"            → buildTopicScenePrompt() → generateImage()
    ├─ "photo_office"           → hardcoded office prompt → generateImage()
    ├─ "photo_custom"           → set awaitingCustomScene=true
    ├─ "photo_regen"            → regenerate with same prompt
    ├─ "video_gen"              → generateVideo(imageUrl, audioBuffer)
    ├─ "pub_menu"               → show publish keyboard
    ├─ "pub:text"               → send text to TG_CHANNEL
    ├─ "pub:audio"              → send audio to TG_CHANNEL
    ├─ "pub:photo"              → send photo to TG_CHANNEL
    ├─ "pub:text_video"         → send video+caption to TG_CHANNEL
    └─ "music:N"                → mix selected track with audio
```

## State Machine (userState Map)

```javascript
// userState: Map<chatId, StateObject>
{
  scenario: 'psychologist' | 'sexologist',
  textLength: 'short' | 'normal' | 'long',
  lastTopic: string,
  lastFullAnswer: string,
  lastImageUrl: string,
  lastVideoUrl: string,
  lastAudioBuffer: Buffer,
  lastScenePrompt: string,
  pendingVoices: [],
  awaitingVoiceRecord: false,
  pendingVoiceBuffer: null,
  suggestedTracks: null | Track[],
  awaitingTextEdit: false,
  awaitingCustomScene: false,
}
```

> ⚠️ Состояние хранится **in-memory** (Map). Сбрасывается при перезапуске Railway.

## Keyboard Layouts

### Сценарий (после ввода темы)
```
[🧠 Психолог Динара] [🔥 Сексолог Динара]
```

### Длина текста
```
[📝 Короткий] [📄 Обычный] [📃 Длинный]
```

### После текста
```
[✏️ Отредактировать] [✅ Текст готов]
```

### После голоса (выбор фото)
```
[📸 По теме] [🏢 В кабинете] [✏️ Свой вариант]
```

### После фото
```
[🔄 Ещё раз] [🎬 Сделать видео] [📢 Опубликовать]
```

### После видео
```
[📢 Опубликовать видео+текст в канал]
```

### Публикация
```
[📝 Текст] [🎵 Аудио] [📸 Фото] [🎥 Видео+текст]
```

## Важные технические детали

### Polling vs Webhook
- @mvpdi1_bot использует **polling** — проще для Railway
- TetssTelegramClickUp_bot использует **webhook** (обязательно `deleteWebHook()` перед `setWebHook()`)
- Две инстанции одного бота в polling → 409 conflict

### Group Privacy
- Для получения всех сообщений в группе (не только команд): BotFather → Bot Settings → Group Privacy → **DISABLED**

### Force Reply для редактирования
```javascript
// Отправляем текст как обычное сообщение
const textMsg = await bot.sendMessage(chatId, cleanText);
// Force reply прикреплён к нему — Telegram показывает как цитату над полем ввода
await bot.sendMessage(chatId, "✏️ Отредактируйте:", {
  reply_to_message_id: textMsg.message_id,
  reply_markup: { force_reply: true, selective: true }
});
```

### Публикация в канал
- Бот должен быть **администратором канала** с правом публикации
- `TG_CHANNEL` = числовой ID (не инвайт-ссылка): `-1003990844834`
- Для video: `bot.sendVideo(TG_CHANNEL, videoUrl, { caption: text })`

### HTTP keepalive (Railway обязательно)
```javascript
import http from 'http';
http.createServer((req, res) => res.end("OK")).listen(process.env.PORT || 3000);
```
Без открытого HTTP-порта Railway убивает контейнер через ~15 сек.

## Demo Access System

```javascript
// Флоу получения демо-доступа:
// 1. Человек идёт в @di1leads_bot
// 2. Проходит анкету, делится телефоном (Telegram OAuth — верифицированный номер)
// 3. Бот генерирует инвайт-код и deep link: t.me/mvpdi1_bot?start=DEMO-XXXXX
// 4. Основной бот при /start?=DEMO-XXXXX привязывает телефон к коду
// 5. Счётчики привязаны к номеру телефона (нельзя передать)

// Лимиты:
const DEMO_LIMITS = {
  photos: 15,
  videos: 1,
  days: 7
};

// Admin bypass:
if (chatId === ADMIN_TG_ID) return { allowed: true };
```

Данные хранятся в `demo-users.json` (локальный файл).
