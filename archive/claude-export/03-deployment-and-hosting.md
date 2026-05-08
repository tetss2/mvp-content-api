# Deployment & Hosting

## Платформы

| Платформа | Что хостит | Статус |
|----------|-----------|-------|
| **Railway** | @mvpdi1_bot, TetssTelegramClickUp_bot | ✅ Основная |
| **Vercel** | Landing pages только | ✅ |
| **Render** | (устаревшее) бот был здесь | ❌ Мигрировано, Render приостановлен |
| **GitHub** | Исходный код | ✅ |

---

## Railway

### Проект
- Имя: `zestful-respect`
- Repo: `tetss2/mvp-content-api`
- Auto-deploy: из ветки `main`

### Критические требования Railway

**1. Открытый HTTP-порт (ОБЯЗАТЕЛЬНО)**
```javascript
// start.js или index.js
import http from 'http';
http.createServer((req, res) => res.end("OK")).listen(process.env.PORT || 3000);
```
Без этого Railway убивает контейнер через ~15 секунд.

**2. Версия Node.js**
Node 22 (НЕ 20) — из-за Supabase WebSocket native support.
Ошибка на Node 20: `Error: Node.js 20 detected without native WebSocket support`

**3. Builder: Dockerfile (НЕ Nixpacks) если нужен ffmpeg**
```dockerfile
FROM node:22-slim
RUN apt-get update && apt-get install -y ffmpeg
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "index.js"]
```
Nixpacks не всегда подхватывает системные пакеты из `nixpacks.toml`.

**4. Дублирование инстанций**
Railway может запускать несколько инстанций → 409 polling conflict.
Решение: один процесс + webhook mode, или явно ограничить instances=1.

### Environment Variables (Railway)

```
# @mvpdi1_bot
TELEGRAM_TOKEN=8397973688:AAGftC...
OPENAI_API_KEY=sk-...
FISH_AUDIO_API_KEY=5847fba74cf64e04a0fb79988e92c897
FISH_AUDIO_VOICE_ID=e2b7cf9e15ce45fbb1352270fde43647
CARTESIA_API_KEY=...
CARTESIA_VOICE_ID=c23f663b-832b-4361-8187-dab45568a01c
FALAI_KEY=...
TG_CHANNEL=-1003990844834
ADMIN_TG_ID=109664871
FREESOUND_TOKEN=...

# TetssTelegramClickUp_bot
TELEGRAM_TOKEN=...
OPENAI_API_KEY=...
CLICKUP_API_KEY=...
WEBHOOK_URL=https://[railway-domain].up.railway.app
CHAT_LIST_MAP={"<chatId1>": "<listId1>", "<chatId2>": "<listId2>"}
```

### Webhook Setup (TetssTelegramClickUp_bot)
```javascript
// Всегда сначала удалять старый webhook
await bot.deleteWebHook();
// Затем устанавливать новый
await bot.setWebHook(`${process.env.WEBHOOK_URL}/webhook`);
// WEBHOOK_URL должен быть с https:// и БЕЗ trailing slash
```

### CHAT_LIST_MAP (Telegram → ClickUp mapping)
```json
{
  "-5100501373": "901217685475",   // Dinara chat → Бэклог
  "-5143205191": "901217638282"    // KNS chat → KNS.COM.UA
}
```

---

## Vercel

Используется **только для landing pages**:
- `dinara-kachaeva.vercel.app` (репо: `tetss2/psycholog-landing`) — **НЕ ТРОГАТЬ**
- `ai-landing` — лендинг сервиса

**Боты на Vercel НЕ деплоятся** — serverless не подходит для polling.

---

## GitHub

Репо: `github.com/tetss2/mvp-content-api`
Ветка: `main`

### Workflow с GitHub MCP
```
⚠️ ВАЖНО: push_files с несколькими файлами → timeout
✅ Работает: create_or_update_file — по одному файлу последовательно
✅ Всегда: получать SHA через get_file_contents перед update
```

```javascript
// Правильный порядок:
const { data } = await github.get_file_contents({ path: 'index.js', ... });
const sha = data.sha;
await github.create_or_update_file({ ..., sha, content: base64content });
```

### Claude Code Workflow
Для больших файлов (index.js > 800KB base64) GitHub MCP не справляется.
Решение — Claude Code локально:

```
Путь проекта: C:\Users\Дмитрий\Documents\mvp-content-api\

Запуск:
cd "C:\Users\Дмитрий\Documents\mvp-content-api"
claude

Для длинных команд:
1. Сохранить в: C:\CLAUDE CODE files\cmd.txt
2. Сказать Claude Code: "Выполни инструкции из файла C:\CLAUDE CODE files\cmd.txt"
```

### .gitignore
```
node_modules/
*.pdf
*.docx
.env
.env.local
package-lock.json
```

### .claudeignore
```
node_modules/
sources/sexologist/
sources/psychologist/
*.pdf
*.docx
package-lock.json
```

### CLAUDE.md
Файл в корне репо — Claude Code читает автоматически при запуске.
Содержит: контекст проекта, стек, переменные, паттерны работы.

---

## Проблемы деплоя и решения

| Проблема | Причина | Решение |
|---------|---------|---------|
| Контейнер убивается через 15 сек | Нет открытого HTTP-порта | `http.createServer().listen(PORT)` |
| 409 Telegram polling conflict | Два процесса с одним токеном | Один инстанс или webhook mode |
| ffmpeg not found | Nixpacks не устанавливает | Переключить на Dockerfile builder |
| Node 20 WebSocket error | Supabase требует Node 22 | Указать `node: 22` в Railway |
| nixpacks.toml игнорируется | Railway приоритизирует Dockerfile | Убрать Dockerfile или настроить явно |
| GitHub MCP timeout | Файл слишком большой (>800KB base64) | Использовать Claude Code локально |

---

## Render (устаревшее, НЕ использовать)

Был основной хостинг до Railway.
Проблема: free tier засыпает через 15 минут без активности.
Решение того времени: uptime ping каждые 10 минут.
Статус: **приостановлен** (чтобы не получать уведомления).
