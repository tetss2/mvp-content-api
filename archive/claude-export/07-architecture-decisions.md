# Architecture Decisions

## ADR-001: Railway вместо Render

**Проблема:** Render free tier засыпает через 15 минут без запросов. Бот перестаёт отвечать.

**Рассматривалось:**
- Render free tier + uptime ping (костыль)
- Vercel serverless (не подходит для polling)
- Hetzner VPS (избыточно для MVP)
- Railway

**Выбрано:** Railway

**Почему:** Контейнер не засыпает, auto-deploy из GitHub, поддержка Dockerfile, простые env variables, доступная цена.

**Трейдоффы:** Платный (нет вечного free tier как у Render), Railway может менять условия.

---

## ADR-002: Polling вместо Webhook для @mvpdi1_bot

**Проблема:** Выбор режима работы бота.

**Рассматривалось:**
- Webhook (нужен публичный HTTPS URL, сложнее дебажить)
- Polling (проще, работает из коробки)

**Выбрано:** Polling для @mvpdi1_bot

**Почему:** Проще развернуть на Railway, не нужен специальный URL, подходит для одного бота.

**Трейдоффы:** Нельзя запустить два инстанса (409 conflict). Webhook выбран для TetssTelegramClickUp_bot — там нужна надёжность и webhook обязательна для Railway multi-instance.

**Критическое знание:**
```javascript
// Для webhook — всегда сначала удалять старый
await bot.deleteWebHook();
await bot.setWebHook(`${WEBHOOK_URL}/webhook`);
// WEBHOOK_URL = https://domain.up.railway.app (без trailing slash!)
```

---

## ADR-003: Fish Audio вместо ElevenLabs / Cartesia как основной TTS

**Проблема:** Нужен качественный клон голоса Динары.

**Рассматривалось:**
- ElevenLabs — не работает из России даже с VPN
- Cartesia — хорошее качество, но Fish Audio лучше справился с клоном
- Fish Audio — подошёл

**Выбрано:** Fish Audio (основной) + Cartesia (резерв)

**Почему:** Fish Audio дал лучший результат клонирования по двум диктофонным записям Динары.

**Ограничения записей для клонирования:**
- Без фонового шума и эха
- MP3, до 4MB
- Несколько минут чистого голоса

---

## ADR-004: fal.ai для фото и видео

**Проблема:** Генерация реалистичного аватара Динары.

**Рассматривалось:**
- Midjourney (нет API)
- Stable Diffusion local (нет ресурсов)
- fal.ai FLUX + LoRA обучение

**Выбрано:** fal.ai

**Почему:** Есть LoRA обучение на фотографиях реального человека, хороший API, разумная цена ($1-2 на обучение).

**Ключевой инсайт:** Без обученной LoRA промпт даёт "похожего человека", но не Динару. LoRA с trigger word `dinara_psych` решает это.

---

## ADR-005: Один большой index.js вместо модулей

**Проблема:** Весь код в одном файле ~800-1000 строк.

**Рассматривалось:**
- Разбить на модули (bot.js, voice.js, image.js, video.js, search.js)
- Оставить монолит

**Выбрано:** Монолит пока (pragmatic для MVP)

**Почему:** Быстрее итерировать, GitHub MCP может обновить один файл (пусть и с трудом), проще для Claude Code.

**Трейдоффы:** GitHub MCP не справляется с файлом >800KB base64. Решение — Claude Code локально.

**Будущий рефакторинг:** Когда функционал стабилизируется, разбить на:
```
src/
  bot/handlers.js
  generation/text.js
  generation/voice.js
  generation/image.js
  generation/video.js
  search/semantic.js
  publish/channel.js
  demo/access.js
```

---

## ADR-006: In-memory state vs БД

**Проблема:** Хранение состояния пользователя (сценарий, последний текст, фото, аудио).

**Рассматривалось:**
- Supabase (нужна регистрация, усложнение, требует Node 22)
- SQLite (локальный файл, нет распределённости)
- In-memory Map (просто, быстро)
- JSON файлы (demo-users.json)

**Выбрано:** In-memory Map для сессионного состояния, JSON файл для demo-users

**Почему:** MVP не требует persistence сессий. Перезапуск = новая сессия, это приемлемо.

**Известная проблема:** demo-users.json сбрасывается при redeploy.

**Планируемое решение:** Railway Volume или Supabase для demo-users.

---

## ADR-007: Dockerfile вместо Nixpacks

**Проблема:** ffmpeg не устанавливался через nixpacks.toml.

**Рассматривалось:**
- nixpacks.toml с `pkgs = ["ffmpeg"]`
- Dockerfile

**Выбрано:** Dockerfile

```dockerfile
FROM node:22-slim
RUN apt-get update && apt-get install -y ffmpeg
```

**Почему:** Nixpacks не всегда пересобирает образ при изменении toml. Dockerfile — детерминированный.

**Важное знание:** Railway приоритизирует Dockerfile над nixpacks. Чтобы вернуться на nixpacks — нужно убрать Dockerfile или указать несуществующий путь в Settings → Build → Dockerfile Path.

---

## ADR-008: Freesound hardcoded URLs для музыки

**Проблема:** Нужна фоновая музыка для аудио. Динамический поиск не работает.

**Рассматривалось:**
- mixkit.co — 403 на Railway
- Pixabay CDN — блокировки
- Freesound API с динамическим поиском — userID в URL нельзя предсказать
- Hardcoded Freesound preview URLs

**Выбрано:** Hardcoded URLs

**Почему:** Единственный вариант, который работает стабильно.

**Как получить URL:**
1. Найти трек на freesound.org
2. Нажать Play
3. В браузере открыть DevTools → Network tab
4. Найти запрос к cdn.freesound.org
5. Скопировать полный URL вида `https://cdn.freesound.org/previews/XXX/SOUNDID_USERID-lq.mp3`

**Трейдоффы:** Негибко, URLs могут устареть. Но работает сейчас.

---

## ADR-009: Сценарии Психолог / Сексолог — разделение

**Проблема:** Нужно добавить сценарий Сексолога с отдельной базой знаний.

**Рассматривалось:**
- Один промпт с условием
- Два полностью изолированных сценария

**Выбрано:** Изолированные сценарии с раздельными knowledge bases

**Почему:** Юридическая безопасность (сексология = чувствительная тема), чистота ответов, возможность разного стиля.

**Требования:**
- Disclaimer при первом входе в сценарий сексолога
- Базовая фильтрация запросов
- Строгая изоляция: знания из одного сценария не попадают в другой

---

## ADR-010: Claude Code как основной инструмент правок кода

**Проблема:** Обновление большого index.js через GitHub MCP невозможно (таймаут).

**Рассматривалось:**
- GitHub MCP direct commit — не работает для больших файлов
- GitHub web editor — ручной, медленный
- Claude Code локально

**Выбрано:** Claude Code (локально в папке проекта)

**Workflow:**
```
Стратегия/архитектура → Claude.ai (этот чат)
Код/правки → Claude Code (C:\Users\Дмитрий\Documents\mvp-content-api)
```

**Для длинных инструкций:**
```
1. Сохранить в: C:\CLAUDE CODE files\cmd.txt
2. Claude Code: "Выполни инструкции из файла C:\CLAUDE CODE files\cmd.txt"
```
