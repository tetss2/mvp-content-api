# Current Project Status

*Актуально на: май 2026*

---

## ✅ Работает стабильно

| Компонент | Детали |
|----------|--------|
| Telegram бот @mvpdi1_bot | Принимает сообщения, polling на Railway |
| HTTP keepalive | Express/http сервер на PORT — Railway не убивает |
| Text generation | GPT-4o-mini + semantic search по articles.production.json |
| Voice generation | Fish Audio — клон голоса Динары ~11 сек |
| Photo generation | fal.ai FLUX LoRA (dinara_psych) — 3 режима |
| Video generation | fal-ai/creatify/aurora (Kling LipSync) |
| Inline keyboard UI | Сценарий → Длина → Редактирование → Голос → Фото → Видео |
| Публикация в канал | Кнопка "Опубликовать" → TG_CHANNEL |
| Audio+music mixing | ffmpeg (через Dockerfile) + Freesound preview URLs |
| Demo access system | Лимиты по фото/видео/времени, привязка к телефону |
| Admin bypass | chatId === ADMIN_TG_ID → полный доступ |
| TetssTelegramClickUp_bot | Парсинг чатов → ClickUp задачи (webhook, Railway) |
| ClickUp структура | Папка + списки для Контент-завода и KNS |
| Whisper transcription | Голосовые и видео-заметки → текст |
| Duplicate detection | В TetssTelegramClickUp_bot |
| Author attribution | В TetssTelegramClickUp_bot |
| Multi-chat mapping | CHAT_LIST_MAP: Dinara + KNS чаты |

---

## ⚠️ Нестабильно / Требует внимания

| Компонент | Проблема |
|----------|---------|
| Freesound URLs | Захардкожены — если CDN изменит структуру, сломается |
| Demo-users.json | Хранится локально в Railway — сбрасывается при redeploy |
| In-memory state | userState Map сбрасывается при перезапуске бота |
| Music volume | Настраивался вручную (0.12 → 0.35) — может не подходить для всех треков |
| Сексолог сценарий | База знаний не загружена / не подключена (UNCERTAINTY) |

---

## 🧪 Экспериментальное

| Компонент | Статус |
|----------|-------|
| Память диалога | Код предложен, реализация под вопросом |
| TF-IDF search | Предложен как замена includes() — статус реализации неизвестен |
| Embeddings | Запланированы (text-embedding-3-small), не реализованы |
| n8n автопостинг | Обсуждался, не реализован |
| Instagram генерация | В планах, не начата |
| Di1leads_bot | Создан концептуально — реализация неизвестна |

---

## 🚫 Текущие блокеры

| Блокер | Описание |
|-------|---------|
| Сброс состояния | demo-users.json и userState в памяти → потеря данных при redeploy |
| Качество ответов | Ответы всё ещё "ChatGPT-like", Динара ещё не оценила |
| Freesound userID | Нельзя динамически искать треки без ручного захвата URL |

---

## 📋 Приоритеты (что делать дальше)

### Высокий приоритет
1. **Стиль Динары** — собрать фидбек от Динары по качеству ответов, доработать промпт
2. **Persistence** — перенести demo-users.json в Supabase или Railway Volume
3. **Сексолог сценарий** — подключить реальную knowledge base

### Средний приоритет
4. **Embeddings** — заменить TF-IDF на text-embedding-3-small + cosine similarity
5. **Память диалога** — реализовать memory.js и подключить к генерации
6. **Di1leads_bot** — реализовать лид-воронку

### Низкий приоритет / On the horizon
7. **Instagram** — генерация и публикация постов
8. **n8n автопостинг** — расписание без участия пользователя
9. **Масштабирование** — другие ниши (диетолог, юрист, коуч)

---

## Monetization Status

| Модель | Статус |
|-------|-------|
| One-time project sale | Концепция разработана, нет клиентов кроме Динары |
| Monthly maintenance | Концепция разработана |
| Content-as-a-service agency | Концепция разработана |
| Demo-боты для других ниш | Запланированы, не созданы |
| Sales landing page | Не создана |
| Case study (Динара) | Не оформлен |

---

## Файловая структура проекта

```
mvp-content-api/
├── index.js                    # Основной файл бота (БОЛЬШОЙ — весь код здесь)
├── start.js                    # Точка входа с HTTP keepalive
├── articles.production.json    # Knowledge base (~8 КБ)
├── demo-users.json             # Демо-пользователи (локальный, не в git)
├── CLAUDE.md                   # Контекст для Claude Code
├── .claudeignore               # Исключения для Claude Code
├── .gitignore                  # node_modules, .env, PDF, DOCX, package-lock
├── Dockerfile                  # node:22-slim + ffmpeg
├── package.json
└── sources/
    ├── psychologist/           # (в .claudeignore)
    └── sexologist/             # (в .claudeignore)
```
