# Problems & Solutions — Troubleshooting Log

## Инфраструктура

### P001: Railway убивает контейнер через 15 секунд
**Симптом:** Бот запускается, но Railway останавливает процесс.
**Причина:** Нет открытого HTTP-порта — Railway считает процесс зависшим.
**Решение:**
```javascript
import http from 'http';
http.createServer((req, res) => res.end("OK")).listen(process.env.PORT || 3000);
```
**Статус:** ✅ Решено

---

### P002: 409 Telegram polling conflict
**Симптом:** `ETELEGRAM: terminated by other getUpdates request`
**Причина:** Два инстанса бота запущены одновременно (Railway + локальный, или два Railway инстанса).
**Решение для TetssTelegramClickUp_bot:** Переключиться на webhook mode.
```javascript
await bot.deleteWebHook();  // Всегда первым!
await bot.setWebHook(`${process.env.WEBHOOK_URL}/webhook`);
```
**Решение для @mvpdi1_bot:** Убедиться что только одна копия запущена.
**Статус:** ✅ Решено

---

### P003: ffmpeg not found
**Симптом:** `spawn ffmpeg ENOENT` при попытке миксировать аудио.
**Причина:** Nixpacks не устанавливал ffmpeg из nixpacks.toml при некоторых условиях.
**Решение:** Переключиться на Dockerfile builder:
```dockerfile
FROM node:22-slim
RUN apt-get update && apt-get install -y ffmpeg
```
**Статус:** ✅ Решено

---

### P004: Node.js версия — Supabase WebSocket error
**Симптом:** `Error: Node.js 20 detected without native WebSocket support`
**Причина:** Supabase требует Node 22+ для нативного WebSocket.
**Решение:** Указать `node: 22` в Railway или `FROM node:22-slim` в Dockerfile.
**Статус:** ✅ Решено

---

### P005: GitHub MCP таймаут при обновлении больших файлов
**Симптом:** `create_or_update_file` зависает или возвращает ошибку для index.js.
**Причина:** Файл слишком большой для base64 в одном API вызове (~800KB+).
**Решение:** Использовать Claude Code локально для правок кода.
**Статус:** ✅ Workaround найден

---

### P006: Railway дублирует инстанции бота
**Симптом:** Два бота отвечают на одно сообщение, 409 errors.
**Причина:** Railway может запустить несколько инстанций при redeploy.
**Решение:** Webhook mode + явное ограничение instances, или deleteWebHook() при старте.
**Статус:** ✅ Решено для TetssTelegramClickUp_bot

---

## Аудио / Музыка

### P007: Музыка не загружается — 403 ошибка
**Симптом:** Треки с mixkit.co и Pixabay CDN возвращают 403 на Railway.
**Причина:** CDN блокирует запросы без правильного User-Agent или с Railway IP.
**Решение:** Перейти на Freesound CDN preview URLs (hardcoded).
**Статус:** ✅ Решено

---

### P008: Freesound API — пустые результаты поиска
**Симптом:** API возвращает `results: []` при поиске треков.
**Причина:** Слишком длинный query или неподдерживаемый синтаксис фильтров.
**Решение:** Использовать hardcoded URLs вместо динамического поиска.
**Статус:** ✅ Обойдено

---

### P009: Freesound userID в URL нельзя угадать
**Симптом:** Нет способа построить URL без знания userID автора трека.
**Причина:** URL формат: `https://cdn.freesound.org/previews/PREFIX/SOUNDID_USERID-lq.mp3`
**Решение:** Захватить URL из Network tab браузера при воспроизведении трека.
**Статус:** ✅ Обойдено (ручной процесс)

---

### P010: Длина аудио не совпадает с ожидаемой
**Симптом:** Короткое аудио ~20 сек вместо 8-9 сек, длинное не соответствует.
**Причина:** Промпт не ограничивал количество слов — GPT генерировал больше текста.
**Решение:** Жёстко ограничить количество слов:
```
Короткий: 18-20 слов (~8-9 сек)
Длинный: 30-35 слов (~13-14 сек)
max_tokens снизить до 200 (было 500)
```
**Статус:** ✅ Решено

---

### P011: Громкость музыки слишком тихая
**Симптом:** Фоновая музыка почти не слышна.
**Причина:** Коэффициент громкости 0.12 — слишком низкий.
**Решение:** Повысить до 0.35.
**Статус:** ✅ Решено

---

## Telegram Bot

### P012: Бот не получает сообщения в группе
**Симптом:** Бот получает только команды /command, но не обычные сообщения.
**Причина:** Telegram Group Privacy = ENABLED по умолчанию.
**Решение:** BotFather → выбрать бота → Bot Settings → Group Privacy → Disable
**Статус:** ✅ Решено

---

### P013: Force reply не вставляет текст в поле ввода
**Симптом:** При нажатии "Отредактировать" пользователь видит пустое поле.
**Причина:** force_reply без привязки к сообщению с текстом не показывает контент.
**Решение:** Отправить текст отдельным сообщением, force_reply прикрепить к нему:
```javascript
const textMsg = await bot.sendMessage(chatId, cleanText);
await bot.sendMessage(chatId, "✏️ Отредактируйте:", {
  reply_to_message_id: textMsg.message_id,
  reply_markup: { force_reply: true, selective: true }
});
```
**Статус:** ✅ Решено

---

### P014: Кнопка "Опубликовать видео" не появляется после видеогенерации
**Симптом:** После генерации видео кнопки публикации нет.
**Причина:** `lastVideoUrl` сохранялся только при нажатии "✅ Выбрать", а не при доставке видео. Кнопка роутила на `pub_menu` вместо `pub:text_video`.
**Решение:**
```javascript
// В sendVideoWithButtons — сохранять URL сразу
state.lastVideoUrl = videoUrl;
userState.set(chatId, state);
// Кнопку менять с "pub_menu" на "pub:text_video"
```
**Статус:** ✅ Решено (коммит 2cd1665)

---

### P015: Текст обрезается при публикации в канал
**Симптом:** Пост в канал публикуется с обрезанным текстом.
**Причина:** Telegram имеет лимит символов для caption.
**Решение:** Обрезать по последнему предложению (не по символу):
```javascript
// Обрезать text по последнему знаку препинания перед лимитом
const truncateAtSentence = (text, limit) => {
  if (text.length <= limit) return text;
  const truncated = text.substring(0, limit);
  const lastPunct = Math.max(
    truncated.lastIndexOf('.'), truncated.lastIndexOf('!'), truncated.lastIndexOf('?')
  );
  return lastPunct > 0 ? truncated.substring(0, lastPunct + 1) : truncated;
};
```
**Статус:** ✅ Решено

---

## ClickUp MCP

### P016: ClickUp MCP 502 ошибка при подключении
**Симптом:** OAuth экран ClickUp открывается, после логина → 502.
**Причина:** Проблема на стороне Anthropic MCP инфраструктуры.
**Решение:** Дождаться починки от Anthropic. Написать в support с error reference.
**Статус:** ✅ Было временным, сейчас ClickUp работает

---

### P017: ClickUp folder ID vs list ID путаница
**Симптом:** Задачи не создаются в нужном месте.
**Причина:** `clickup_get_workspace_hierarchy` возвращает и folder IDs и list IDs — легко перепутать.
**Решение:** Всегда проверять тип объекта. Verified IDs:
```
Folder: 901210869335 (🧠 Контент-завод — Динара)
List Бэклог: 901217685475
List KNS.COM.UA: 901217638282
```
**Статус:** ✅ Задокументировано

---

## Прочее

### P018: /start не срабатывает от /START
**Симптом:** Команда `/START` не запускает обработчик.
**Причина:** Telegram команды case-sensitive в некоторых библиотеках.
**Решение:** Использовать строго `/start` (lowercase).
**Статус:** ✅ Задокументировано

---

### P019: nixpacks.toml изменения не применяются
**Симптом:** После изменения nixpacks.toml Railway не пересобирает образ с новыми пакетами.
**Причина:** Railway кеширует build слои; иногда не триггерит полную пересборку.
**Решение:** Переключиться на Dockerfile builder — он детерминированный.
**Статус:** ✅ Решено переходом на Dockerfile
