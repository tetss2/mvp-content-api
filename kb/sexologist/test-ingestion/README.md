# Safe OCR-Cleaned KB Mini Test

Изолированный тестовый контур для 2-3 файлов из `kb/sexologist/cleaned`.

## Что безопасно

- Supabase не используется.
- `knowledge_chunks` и `match_chunks` не вызываются.
- Production embeddings/indexes не читаются, не удаляются и не перезаписываются.
- Эмбеддинги пишутся только в локальный JSONL:
  `kb/sexologist/test-ingestion/sexologist-cleaned-mini.embeddings.jsonl`.
- JSONL с эмбеддингами игнорируется git.

## Dry-run без OpenAI

```bash
npm run kb:test:ingest:dry
```

Проверяет выбранные файлы, chunking и диагностику:

- OCR garbage leakage
- bad chunking
- duplicated chunks
- encoding/mojibake issues

## Создать локальный тестовый кэш эмбеддингов

```bash
npm run kb:test:ingest
```

Нужен только `OPENAI_API_KEY`. Supabase-переменные не нужны и не используются.

По умолчанию берутся 3 файла:

- `Sexopatologia_Spravochnik_1990.cleaned.txt`
- `Опросник_социосексуальной_ориентации_SOI.cleaned.txt`
- `Сочетанное_использование_эриксоновского_гипноза_и_ДПДГ_в_клинической.cleaned.txt`

Можно явно выбрать 2-3 файла:

```bash
node scripts/safe-cleaned-kb-ingest-test.js --files=file1.cleaned.txt,file2.cleaned.txt
```

## Retrieval smoke test

```bash
npm run kb:test:retrieve
```

Скрипт задаёт несколько русских вопросов, печатает top chunks и грубую оценку качества по cosine similarity и диагностическим флагам.

Свои вопросы можно передать через `|`:

```bash
node scripts/safe-cleaned-kb-retrieval-test.js --questions="Что такое либидо?|Как говорить о сексуальной норме?"
```
