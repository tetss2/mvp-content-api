# Claude Code / PowerShell Execution History

> Инженерная выжимка из работы через Claude Code (PowerShell, Windows).
> Хронологический порядок. Только факты: команды, файлы, ошибки, итоги.

---

## ФАЗА 0 — Установка инструментов (апрель 2026)

### Контекст
Проект: `psycholog-landing` (сайт Динары). Первый запуск Claude Code на Windows.

---

### 0.1 — Попытка нативного установщика Claude Code
**Команда:** скачать `.exe` установщик с сайта Anthropic  
**Результат:** ❌ Показал "Installation complete" без реального файла. Команда `claude` не найдена.

---

### 0.2 — Блокировка PowerShell Execution Policy
**Симптом:** `npm` не запускается — PowerShell блокирует скрипты  
**Команда:**
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
# Подтвердить: Y
```
**Результат:** ✅ Политика снята для текущего пользователя  
**Риск:** Минимальный (разрешает только подписанные скрипты, не все подряд)

---

### 0.3 — Установка Node.js
**Действие:** Скачан и установлен Node.js v24.15.0 вручную (installer .msi)  
**Проверка:**
```powershell
node --version   # → v24.15.0
npm --version    # → работает после 0.2
```
**Результат:** ✅

---

### 0.4 — Установка Git for Windows
**Причина:** Claude Code требует git  
**Действие:** Скачан и установлен Git for Windows  
**Настройка:** Выбрана опция "Git from the command line and also from 3rd-party software" (Recommended)  
**Результат:** ✅

---

### 0.5 — Установка Claude Code
```powershell
npm install -g @anthropic-ai/claude-code
```
**Ошибка:** После установки команда `claude` не найдена  
**Причина:** PATH не обновился  
**Диагностика:**
```powershell
Test-Path "$env:USERPROFILE\.local\bin\claude.exe"   # → True
```
**Фикс:**
```powershell
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";$env:USERPROFILE\.local\bin", "User")
# Перезапустить PowerShell
claude --version   # → 2.1.114 (Claude Code)
```
**Результат:** ✅  
**Затронутые настройки:** User PATH environment variable

---

### 0.6 — Первый запуск и авторизация
```powershell
cd $HOME\Documents\psycholog-landing
claude
```
**Действие:** Открылся браузер → вошёл через аккаунт tetss1986@gmail.com (Claude Pro)  
**Результат:** ✅ Claude Code запущен в интерактивном режиме

---

## ФАЗА 1 — Проект psycholog-landing (апрель 2026)

**Рабочая папка:** `C:\Users\Дмитрий\Documents\psycholog-landing`  
**Репо:** `tetss2/psycholog-landing` → Vercel → `dinara-kachaeva.vercel.app`

### Реализовано через Claude Code:

| Задача | Результат |
|--------|----------|
| Создание Next.js проекта (v16, TypeScript, Tailwind v4, Framer Motion) | ✅ |
| Парсинг b17.ru/dinakachaeva/ через cheerio (encoding Windows-1251) | ✅ |
| Сохранение 16 статей в `lib/articles-content.json` (~62 КБ) | ✅ |
| Форма записи → Telegram Bot API | ✅ |
| Cloudflare Turnstile интеграция | ✅ |
| Страницы /publications/[slug] с drop cap типографикой | ✅ |
| `git push origin master` → автодеплой на Vercel | ✅ |

**Найденная ошибка (вручную Дмитрием):** В `.env.local` стоял плейсхолдер вместо реального `TURNSTILE_SECRET_KEY` — найдено и исправлено самостоятельно.

**Статус:** ✅ Задеплоен, НЕ ТРОГАТЬ

---

## ФАЗА 2 — Оптимизация рабочего процесса (май 2026)

**Рабочая папка:** `C:\Users\Дмитрий\Documents\mvp-content-api`  
**Репо:** `tetss2/mvp-content-api`

### 2.1 — Клонирование репо на локальный компьютер
**Проблема:** Репо `mvp-content-api` не было склонировано локально.  
**Действие:** GitHub Desktop → Add → Clone repository → `tetss2/mvp-content-api`  
**Результат:** ✅ Клонировано в `C:\Users\Дмитрий\Documents\GitHub\mvp-content-api` или аналог

---

### 2.2 — Создание CLAUDE.md (паспорт проекта)
**Команда в Claude Code:**
```
Создай файл CLAUDE.md с контекстом проекта: стек, переменные окружения, архитектура, правила работы
```
**Файлы созданы:** `CLAUDE.md`  
**Результат:** ✅ Коммит `fa77cd7` "add CLAUDE.md and gitignore"

---

### 2.3 — Настройка .gitignore
**Команда в Claude Code:**
```
добавь в .gitignore строки: *.pdf, *.docx, .env, .env.local — 
затем закоммить .gitignore и CLAUDE.md в git с сообщением "add CLAUDE.md and gitignore"
```
**Файлы изменены:** `.gitignore`  
**Содержимое:**
```
node_modules/
*.pdf
*.docx
.env
.env.local
package-lock.json
```
**Результат:** ✅

---

### 2.4 — Push с разрешением конфликта
**Команда:**
```
git push origin main
```
**Проблема:** Конфликт с remote  
**Решение Claude Code:** Автоматически выполнил `git pull --rebase` и запушил  
**Результат:** ✅ "Запушено успешно"

---

### 2.5 — Создание .claudeignore
**Команда в Claude Code:**
```
создай файл .claudeignore с содержимым:
node_modules/
sources/sexologist/
sources/psychologist/
*.pdf
*.docx
package-lock.json
```
**Затем:**
```
git add .claudeignore && git commit -m "add claudeignore" && git push origin main
```
**Результат:** ✅ Коммит `031ff83`

---

### 2.6 — Установка паттерна cmd.txt для длинных команд
**Проблема:** Длинные команды не влезают в интерфейс Claude Code  
**Решение:**
```
Путь файла: C:\CLAUDE CODE files\cmd.txt
Команда в Claude Code: Выполни инструкции из файла "C:\CLAUDE CODE files\cmd.txt"
```
**Статус:** ✅ Используется постоянно для batch-правок

---

## ФАЗА 3 — Правки бота MVP-DI-1 через Claude Code (май 2026)

### 3.1 — Batch-правка: 5 фиксов одним запуском
**Файл:** `C:\CLAUDE CODE files\cmd.txt`  
**Содержимое инструкций:**
```
ПРАВКА 1 — замена музыкальных URLs (mixkit.co → pixabay CDN)
ПРАВКА 2 — порядок кнопок после генерации текста
ПРАВКА 3 — "Без музыки" первой кнопкой в одной строке
ПРАВКА 4 — сексолог: убран фолбек на общие знания, только vectorSearch
ПРАВКА 5 — публикация: caption до 1021+"...", полный текст отдельным сообщением
git push origin main
```

**Результат коммитов:**
| Хэш | Описание |
|-----|---------|
| `bdbe8af` | URLs музыки: mixkit → pixabay CDN |
| `276dbba` | Порядок кнопок после генерации текста |
| `d9f4b5c` | "Без музыки" первой кнопкой |
| `e76118b` | Сексолог: убран GPT-фолбек |
| `a691e12` | Публикация: обрезка caption |

**Статус деплоя:** ❌ FAILED — синтаксическая ошибка в `publishToChannel`

---

### 3.2 — Диагностика синтаксиса
**Команда:**
```
node --check index.js
```
**Результат:** Пусто (No output) → синтаксис чистый  
**Вывод:** Ошибка деплоя была не в JS-синтаксисе, а в конфигурации Railway

---

### 3.3 — Борьба с ffmpeg (самая долгая отладка)

**Хронология попыток:**

| № | Действие | Результат |
|---|---------|----------|
| 1 | Добавить `nixPkgs = ["ffmpeg"]` в nixpacks.toml → пустой коммит | ❌ Railway не пересобрал |
| 2 | Заменить `ffmpeg-full` на `ffmpeg` в nixpacks.toml | ❌ Та же ошибка |
| 3 | Добавить Custom Build Command `npm install` в Railway | ❌ `exit code: 127` (npm не найден при build) |
| 4 | Убрать Custom Build Command → деплой | ❌ Та же ошибка |
| 5 | Переключить Railway Builder: Nixpacks → Dockerfile | — |
| 6 | Создать Dockerfile с `node:20-slim + ffmpeg` | ❌ `Error: Node.js 20 detected without native WebSocket support` |
| 7 | Сменить `node:20-slim` → `node:22-slim` в Dockerfile | ✅ ffmpeg заработал |

**Команда в Claude Code (шаг 5-6):**
```
1. Удали файл nixpacks.toml
2. Создай файл Dockerfile с содержимым:
FROM node:20-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
CMD ["node", "start.js"]
3. Закоммить: "fix: Dockerfile с ffmpeg вместо nixpacks"
4. Запушить
```

**Финальный Dockerfile (рабочий):**
```dockerfile
FROM node:22-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
CMD ["node", "start.js"]
```

**Файлы изменены:** `Dockerfile` (создан), `nixpacks.toml` (удалён)  
**Статус:** ✅ ffmpeg работает на Railway

---

### 3.4 — Проблема с музыкой: Freesound 401
**Ошибка в логах Railway:** `Freesound error: 401 {"detail":"Invalid token"}`  
**Причина:** В Railway переменной `FREESOUND_API_KEY` был неправильный ключ (Client ID вместо Client secret/Api key)  
**Решение:** Обновить ключ в Railway Variables вручную  
**Статус:** ✅ После правки токена заработало

---

### 3.5 — Проблема: два MUSIC_LIBRARY в коде
**Симптом:** Бот падал сразу после старта на Railway  
**Диагностика:**
```
node --check index.js   # → чисто
node index.js 2>&1 | head -20   # → Cannot find package 'node-telegram-bot-api'
```
**Реальная причина:** Claude Code добавил новый массив `MUSIC_LIBRARY` не удалив старый → дублирование переменной → runtime crash  
**Команда фикса:**
```
В index.js найди все вхождения "const MUSIC_LIBRARY" - их должно быть два.
Удали первый (старый) массив, оставь только второй. 
Закоммить: "fix: убран дублирующий MUSIC_LIBRARY"
Запушить.
```
**Статус:** ✅ Решено

---

### 3.6 — Проблема: /START vs /start
**Обнаружено Дмитрием самостоятельно**  
**Симптом:** Бот не отвечал на `/START`  
**Причина:** Telegram команды case-sensitive в `node-telegram-bot-api`  
**Решение:** Использовать строго `/start` (lowercase)  
**Статус:** ✅ Задокументировано

---

### 3.7 — 409 Telegram Polling Conflict
**Симптом:** `ETELEGRAM: terminated by other getUpdates request` → бот не отвечает  
**Причина:** Railway запускал несколько инстанций при redeploy  
**Решение:** Railway → Redeploy (принудительный перезапуск)  
**Долгосрочное решение:** Для TetssTelegramClickUp_bot — webhook mode  
**Статус:** ✅ Решено

---

### 3.8 — Фикс кнопки публикации видео
**Коммит:** `2cd1665`  
**Описание:** "fix: прямая кнопка публикации видео в канал + сохранение lastVideoUrl"  
**Что изменено в index.js:**
```javascript
// ДО: lastVideoUrl сохранялся только при нажатии "✅ Выбрать"
// ПОСЛЕ: сохраняется сразу в sendVideoWithButtons
state.lastVideoUrl = videoUrl;
userState.set(chatId, state);
// ДО: кнопка роутила на "pub_menu"
// ПОСЛЕ: кнопка роутит на "pub:text_video"
```
**Статус:** ✅ Работает

---

## Итоговая карта коммитов (известные хэши)

| Хэш | Описание | Статус |
|-----|---------|--------|
| `fa77cd7` | add CLAUDE.md and gitignore | ✅ |
| `031ff83` | add claudeignore | ✅ |
| `bdbe8af` | URLs музыки: mixkit → pixabay CDN | ✅ (потом заменено) |
| `276dbba` | Порядок кнопок после текста | ✅ |
| `d9f4b5c` | Без музыки первой кнопкой | ✅ |
| `e76118b` | Сексолог: убран GPT-фолбек | ✅ |
| `a691e12` | Публикация: обрезка caption | ✅ |
| `874a6b1` | Freesound URLSearchParams + аудио лимиты | ✅ |
| `841ab21` | (предположительно) music URLs, audio duration, publish TG channel | ✅ |
| `2cd1665` | Кнопка публикации видео + lastVideoUrl | ✅ |

---

## Нерешённые проблемы / Риски

| Проблема | Риск | Приоритет |
|---------|------|----------|
| Freesound preview URLs hardcoded | CDN может изменить структуру → музыка сломается | Средний |
| `demo-users.json` в памяти Railway | Сбрасывается при каждом redeploy → потеря демо-пользователей | Высокий |
| `userState` Map in-memory | То же — все сессии сбрасываются при перезапуске | Средний |
| Большой index.js (монолит) | GitHub MCP не может его обновлять → только Claude Code | Низкий |
| Двойное использование Claude Code / Claude.ai | Путаница — часть работы в чате, часть локально, нет единого лога | Средний |

---

## Установленные npm-пакеты (известные)

| Пакет | Где | Назначение |
|-------|-----|-----------|
| `@anthropic-ai/claude-code` | global | Claude Code CLI |
| `node-telegram-bot-api` | mvp-content-api | Telegram Bot |
| `openai` | mvp-content-api | GPT-4o-mini, Whisper |
| `@fal-ai/client` | mvp-content-api | fal.ai API |
| `next` | psycholog-landing | Фреймворк |
| `tailwindcss` v4 | psycholog-landing | Стили |
| `framer-motion` | psycholog-landing | Анимации |
| `lucide-react` | psycholog-landing | Иконки |
| `cheerio` | psycholog-landing (скрипт) | Парсинг b17.ru |

---

## Environment Variables — история изменений

| Переменная | Где | Проблема |
|-----------|-----|---------|
| `FREESOUND_API_KEY` | Railway | Был неправильный ключ (Client ID вместо secret) → 401 |
| `TG_CHANNEL` | Railway | Добавлен вручную после реализации публикации |
| `TURNSTILE_SECRET_KEY` | Vercel .env.local | Был плейсхолдер — найдено Дмитрием самостоятельно |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Vercel Dashboard | Добавлен после обнаружения ошибки |

---

## Паттерны работы (что зафиксировалось как рабочий процесс)

```
СТРАТЕГИЯ / АРХИТЕКТУРА → Claude.ai (этот чат)
КОД / ПРАВКИ → Claude Code
ДЛИННЫЕ КОМАНДЫ → C:\CLAUDE CODE files\cmd.txt
ДЕПЛОЙ → git push origin main → Railway автодеплой
ДИАГНОСТИКА → node --check index.js / Railway logs
```

**Запуск Claude Code:**
```powershell
cd "C:\Users\Дмитрий\Documents\mvp-content-api"
claude
```

**Передача длинных команд:**
```
# В Claude Code:
Выполни инструкции из файла "C:\CLAUDE CODE files\cmd.txt"
```

---

## Next Actions

1. **Переместить demo-users.json в Railway Volume** — иначе данные теряются при redeploy
2. **Зафиксировать рабочие Freesound URLs** в отдельном конфиге (не хардкод в index.js)
3. **Обновить CLAUDE.md** — текущий устарел после всех изменений Dockerfile/ffmpeg
4. **Протестировать цепочку после последних деплоев** — text → voice → music → photo → video → publish
