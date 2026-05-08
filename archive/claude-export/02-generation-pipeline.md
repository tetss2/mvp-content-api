# Generation Pipeline — Контент-завод

## Общий пайплайн

```
User input (text/voice)
        │
        ▼
[1] Semantic Search → top-3 articles из articles.production.json
        │
        ▼
[2] Text Generation (OpenAI GPT-4o-mini)
        │
        ▼
[3] Voice Generation (Fish Audio)
        │
        ├──────────────────────────────┐
        ▼                              ▼
[4] Photo Generation (fal.ai)   [4b] Music (Freesound CDN)
        │
        ▼
[5] Video Generation (fal-ai/creatify/aurora)
        │
        ▼
[6] Publish to TG Channel
```

---

## [1] Semantic Search

### Текущая реализация (TF-IDF / word scoring)
```javascript
function findRelevantArticles(query, articles, topN = 3) {
  const queryWords = tokenize(query);
  const scored = articles.map(article => {
    const articleWords = tokenize(
      article.title + ' ' + article.tags.join(' ') + ' ' + article.content
    );
    const score = queryWords.reduce((acc, word) => {
      const freq = articleWords.filter(w => w === word).length;
      return acc + (freq > 0 ? 1 + Math.log(freq) : 0);
    }, 0);
    return { ...article, score };
  });
  return scored.filter(a => a.score > 0).sort((a, b) => b.score - a.score).slice(0, topN);
}

function tokenize(text) {
  return text.toLowerCase().replace(/[^а-яёa-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
}
```

### Knowledge base: articles.production.json
```json
[
  {
    "id": "...",
    "title": "...",
    "tags": ["тревога", "страх"],
    "content": "..."
  }
]
```
Размер файла: ~8 КБ (компактный, не нужно делить).

### Планируемое улучшение
Embeddings через `text-embedding-3-small` — предгенерировать векторы, сохранить в `articles.vectors.json`, при запросе cosine similarity.

---

## [2] Text Generation

### Модель
`gpt-4o-mini` (баланс цена/качество)

### Длина текста
| Режим | Параметры |
|-------|----------|
| Короткий | ~18-20 слов (~8-9 сек озвучки) |
| Обычный | эталон (2-4 абзаца) |
| Длинный | +50% к обычному |

### System Prompt (Психолог Динара)
```
Ты — Динара Качаева, практикующий психолог.
Пишешь живо, тепло, без клише.
Твой стиль: короткие абзацы, эмпатия без жалости, конкретные наблюдения,
иногда встречный вопрос. Никогда не пишешь списки.
Не используешь слова: "безусловно", "важно отметить", "данный", "следует", "осознать".

СТИЛЬ из реальных постов Динары:
- Метафоры: "смотримся в разные зеркала", "едим и перевариваем жизнь"
- Личный угол: "не знаю как у вас, а я...", "я сама долго с этим работала"
- Риторические паузы + вопрос в середине
- Эмодзи: 💙 🌿 🍀 🌟 💫 🧚‍♀️ 🙏 ❗️ 🟢 🤗 ✨ 🌞 🫶 (умеренно, в конце мысли)
- Без академизма, без списков, без заголовков

Опирайся на эти фрагменты из твоих статей:
---
{context}
---

Человек написал: "{userMessage}"
Ответь как будто это личная переписка — 2-3 абзаца, до 1000 символов.
Заканчивай либо наблюдением, либо вопросом — никогда советом в лоб.
```

### temperature
`0.78` — чуть выше чем стандартный 0.7 для живости.

### Сценарий "Сексолог Динара"
- Отдельная knowledge base (источники по сексологии)
- Тот же стиль Динары (эмодзи, форма обращения)
- Строгая изоляция: не смешивается с психологической базой

---

## [3] Voice Generation

### Основной провайдер: Fish Audio

| Параметр | Значение |
|---------|---------|
| API key env | `FISH_AUDIO_API_KEY` |
| Voice ID env | `FISH_AUDIO_VOICE_ID` |
| Voice ID | `e2b7cf9e15ce45fbb1352270fde43647` |
| Endpoint | `https://api.fish.audio/v1/tts` |
| Format | MP3 |
| Стиль | нейтральная медленная подача |

**Никогда не использовать ElevenLabs** — не работает даже с VPN.

### Резервный провайдер: Cartesia

| Параметр | Значение |
|---------|---------|
| API key env | `CARTESIA_API_KEY` |
| Voice ID env | `CARTESIA_VOICE_ID` |
| Voice ID | `c23f663b-832b-4361-8187-dab45568a01c` |
| Endpoint | `https://api.cartesia.ai/tts/bytes` |
| Format | MP3/WAV/PCM |

```javascript
// Cartesia: native fetch, no SDK needed
export async function synthesize(text, opts = {}) {
  const { outputFormat = 'mp3', language = 'ru', speed = 1.0 } = opts;
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'X-API-Key': CARTESIA_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: 'sonic-multilingual',
      transcript: text,
      voice: { mode: 'id', id: VOICE_ID },
      output_format: { container: outputFormat, sample_rate: 44100 },
      language,
    })
  });
  return Buffer.from(await response.arrayBuffer());
}
```

### Запись голоса Динары
- Записаны 2 диктофонные записи (5 мин и 3 мин)
- Загружены в Fish Audio и Cartesia для клонирования
- Требования: без фона/эха, MP3, до 4MB

---

## [4] Photo Generation — fal.ai

### LoRA модель
- Обучена на фотографиях Динары (~10-20 фото)
- Trigger word: `dinara_psych`
- Модель: `flux-lora-fast-training`
- Стоимость обучения: ~$1-2
- Стоимость генерации: ~$0.021/фото (с LoRA)

### Промпт (BASE)
```
portrait of dinara_psych woman, professional psychologist,
fair skin tone, dark straight hair, photorealistic, soft face,
chubby cheeks, no prominent cheekbones, round face shape,
full cheeks, asian features, thin lips, natural lips, no lip filler,
soft round chin, no pointy chin, small nose, almond eyes,
upturned eye corners, lifted eye corners, no drooping eyes, no sad eyes
```

### Сцены

**Сцена 1 — По теме текста (buildTopicScenePrompt)**
```
{BASE} + контекстуальный промпт по теме из GPT
```

**Сцена 2 — В кабинете (photo_office)**
```
{BASE}, very subtle smile, wearing elegant professional blouse,
warm neutral colors, sitting in cozy therapist office,
bookshelf background, soft warm lamp light, wooden furniture,
indoor plants, shallow depth of field, bokeh background
```

**Сцена 3 — Свой вариант (photo_custom)**
```
{BASE} + текст от пользователя (на русском → бот переводит в промпт)
```

### Настройки генерации
```javascript
{
  model: 'fal-ai/flux/dev/image-to-image',  // или flux-lora
  lora_scale: 0.85,
  num_inference_steps: 35,
  image_size: '1024x1024',
}
```

### Стоимость
```javascript
const PRICE = {
  photo: 0.004,  // $0.004 за изображение (FLUX LoRA)
};
const BALANCE = { photo: 16.61 }; // остаток на момент разработки
```

---

## [5] Video Generation — fal-ai/creatify/aurora

### Модель
`fal-ai/creatify/aurora` (Kling LipSync)

### Входные данные
- Изображение (URL от fal.ai) → `lastImageUrl`
- Аудио (Buffer) → `lastAudioBuffer`

### Стоимость
```javascript
const PRICE = {
  video: 0.014,  // $0.014 за секунду
};
// Примерно $0.42 за 30-секундное видео
```

### Тестировавшиеся модели

| Модель | Результат |
|-------|----------|
| MiniMax | $0.50, среднее качество |
| Seedance 2.0 | ❌ блокирует реальных людей |
| Kling v3 Pro | ✅ лучшее качество лица |
| Wan 2.7 | нет lip-sync |
| DaVinci-MagiHuman | слишком медленно |
| LatentSync | тестировали |
| Kling LipSync / Aurora | ✅ выбранный вариант |

---

## [6] Audio Mixing (ffmpeg)

### Зависимость
ffmpeg — системная. Требует Dockerfile (не Nixpacks):
```dockerfile
FROM node:22-slim
RUN apt-get update && apt-get install -y ffmpeg
```

### Музыка
Hardcoded Freesound preview URLs. Формат:
```
https://cdn.freesound.org/previews/[3-digit-prefix]/[soundID]_[userID]-lq.mp3
```
> ⚠️ `userID` нельзя угадать — нужно захватить из Network tab браузера при воспроизведении.

**Почему Freesound, а не другие:**
- mixkit.co → 403 на Railway
- Pixabay CDN → тоже блокирует
- Freesound preview URLs → работают

### Громкость музыки
`0.35` (было `0.12` — слишком тихо)

---

## Стоимости и балансы (на момент разработки)

```javascript
const PRICE = {
  audio: 0.000008,  // $0.008 за 1000 символов (Fish Audio)
  photo: 0.004,     // $0.004 за изображение
  video: 0.014,     // $0.014 за секунду
};
const BALANCE = {
  audio: 9.93,
  photo: 16.61,
};
```
