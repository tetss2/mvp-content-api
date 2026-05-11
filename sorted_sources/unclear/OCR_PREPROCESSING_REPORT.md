# OCR preprocessing report: sexologist

Дата: 2026-05-08

## Scope and safety

- Проверена папка `sources/sexologist` на problematic/scanned PDF.
- OCR выполнен локальным Tesseract `rus+eng`; страницы рендерились временным PyMuPDF из `%TEMP%`.
- Embeddings не запускались, Supabase не трогался, force reindex не запускался, production retrieval flow не изменялся.
- Созданы preprocessing-папки: `kb/sexologist/originals`, `kb/sexologist/ocr_raw`, `kb/sexologist/cleaned`, `kb/sexologist/reviewed`.
- Существующая папка `sources/sexologist/ocr` не удалялась и не перемещалась; старый raw OCR для одного файла был безопасно скопирован в `kb`.

## Scanned/problematic PDFs detected

| PDF | Pages | Size MB | Raw OCR | Cleaned TXT | OCR quality | Flags |
|---|---:|---:|---|---|---|---|
| `126920_4409ae397650cf3bad5ab99ba9787539.pdf` | 239 | 83.76 | `kb\sexologist\ocr_raw\126920_4409ae397650cf3bad5ab99ba9787539.ocr.raw.txt` | `kb\sexologist\cleaned\126920_4409ae397650cf3bad5ab99ba9787539.cleaned.txt` | good | - |
| `88435_df7b0137c2a7e0ee994a85bfa8f01c63.pdf` | 136 | 11.06 | `kb\sexologist\ocr_raw\88435_df7b0137c2a7e0ee994a85bfa8f01c63.ocr.raw.txt` | `kb\sexologist\cleaned\88435_df7b0137c2a7e0ee994a85bfa8f01c63.cleaned.txt` | good | encoding_noise |
| `88436_f74ff498f23077badd28e1a443f537ab.pdf` | 480 | 22.63 | `kb\sexologist\ocr_raw\88436_f74ff498f23077badd28e1a443f537ab.ocr.raw.txt` | `kb\sexologist\cleaned\88436_f74ff498f23077badd28e1a443f537ab.cleaned.txt` | good | encoding_noise |
| `Sexopatologia_Spravochnik_1990.pdf` | 579 | 264.87 | `kb\sexologist\ocr_raw\Sexopatologia_Spravochnik_1990.ocr.raw.txt` | `kb\sexologist\cleaned\Sexopatologia_Spravochnik_1990.cleaned.txt` | low | low_chars_per_page, few_words |
| `Медицинская сексология и психотерапия сексуальных расстройств, Доморацкий В.А., 2020.pdf` | 470 | 101.68 | `kb\sexologist\ocr_raw\Медицинская сексология и психотерапия сексуальных расстройств, Доморацкий В.А., 2020.ocr.raw.txt` | `kb\sexologist\cleaned\Медицинская сексология и психотерапия сексуальных расстройств, Доморацкий В.А., 2020.cleaned.txt` | good | encoding_noise |
| `Медицинская_сексология_Психотерапия_сексуальных_расстройств.pdf` | 470 | 101.68 | `kb\sexologist\ocr_raw\Медицинская_сексология_Психотерапия_сексуальных_расстройств.ocr.raw.txt` | `kb\sexologist\cleaned\Медицинская_сексология_Психотерапия_сексуальных_расстройств.cleaned.txt` | good | encoding_noise; duplicate of `Медицинская сексология и психотерапия сексуальных расстройств, Доморацкий В.А., 2020.pdf` |
| `Опросник_социосексуальной_ориентации_SOI.pdf` | 3 | 0.11 | `kb\sexologist\ocr_raw\Опросник_социосексуальной_ориентации_SOI.ocr.raw.txt` | `kb\sexologist\cleaned\Опросник_социосексуальной_ориентации_SOI.cleaned.txt` | good | - |
| `Сексуальный интеллект.pdf` | 236 | 1.34 | `kb\sexologist\ocr_raw\Сексуальный интеллект.ocr.raw.txt` | `kb\sexologist\cleaned\Сексуальный интеллект.cleaned.txt` | good | encoding_noise |
| `Сочетанное_использование_эриксоновского_гипноза_и_ДПДГ_в_клинической.pdf` | 9 | 0.13 | `kb\sexologist\ocr_raw\Сочетанное_использование_эриксоновского_гипноза_и_ДПДГ_в_клинической.ocr.raw.txt` | `kb\sexologist\cleaned\Сочетанное_использование_эриксоновского_гипноза_и_ДПДГ_в_клинической.cleaned.txt` | good | - |
| `Яффе Секс в жизни женщины .pdf` | 177 | 116.98 | `kb\sexologist\ocr_raw\Яффе Секс в жизни женщины .ocr.raw.txt` | `kb\sexologist\cleaned\Яффе Секс в жизни женщины .cleaned.txt` | good | encoding_noise |
| `Яффе Секс в жизни мужчины .pdf` | 161 | 113.75 | `kb\sexologist\ocr_raw\Яффе Секс в жизни мужчины .ocr.raw.txt` | `kb\sexologist\cleaned\Яффе Секс в жизни мужчины .cleaned.txt` | good | encoding_noise |

## OCR quality estimation

| PDF | Chars/page | Cyrillic ratio | Words | Estimation |
|---|---:|---:|---:|---|
| `126920_4409ae397650cf3bad5ab99ba9787539.pdf` | 1962.1 | 0.995 | 51971 | good |
| `88435_df7b0137c2a7e0ee994a85bfa8f01c63.pdf` | 3522.7 | 0.997 | 57825 | good |
| `88436_f74ff498f23077badd28e1a443f537ab.pdf` | 1520.1 | 0.989 | 86901 | good |
| `Sexopatologia_Spravochnik_1990.pdf` | 35.1 | 0.456 | 1579 | low |
| `Медицинская сексология и психотерапия сексуальных расстройств, Доморацкий В.А., 2020.pdf` | 1752.9 | 0.983 | 92667 | good |
| `Медицинская_сексология_Психотерапия_сексуальных_расстройств.pdf` | 1752.9 | 0.983 | 92667 | good |
| `Опросник_социосексуальной_ориентации_SOI.pdf` | 1243.0 | 0.935 | 431 | good |
| `Сексуальный интеллект.pdf` | 1460.2 | 0.995 | 47755 | good |
| `Сочетанное_использование_эриксоновского_гипноза_и_ДПДГ_в_клинической.pdf` | 2301.3 | 0.992 | 2531 | good |
| `Яффе Секс в жизни женщины .pdf` | 2084.4 | 0.99 | 47173 | good |
| `Яффе Секс в жизни мужчины .pdf` | 1966.9 | 0.988 | 41142 | good |

## Suspicious low-quality OCR files

- `Sexopatologia_Spravochnik_1990.pdf`: quality=low, chars/page=35.1, words=1579, flags=low_chars_per_page, few_words.

## Possible duplicates

Exact SHA-256 duplicates:
- `statya-va-domorackogo (1).pdf` == `Сочетанное_использование_эриксоновского_гипноза_и_ДПДГ_в_клинической.pdf`
- `Медицинская сексология и психотерапия сексуальных расстройств, Доморацкий В.А., 2020.pdf` == `Медицинская_сексология_Психотерапия_сексуальных_расстройств.pdf`

Same-size groups for manual review:
- `statya-va-domorackogo (1).pdf` / `Сочетанное_использование_эриксоновского_гипноза_и_ДПДГ_в_клинической.pdf`
- `Медицинская сексология и психотерапия сексуальных расстройств, Доморацкий В.А., 2020.pdf` / `Медицинская_сексология_Психотерапия_сексуальных_расстройств.pdf`

## Encoding problems

PDF text-layer extraction with possible mojibake/replacement artifacts:
- `88347_2fa12ba6d5ec12fffde3424f26c6009a.pdf`: replacement=0, mojibake=213, nonWhitespace=532445.
- `Osoznannoe_vlechenie1.pdf`: replacement=0, mojibake=251, nonWhitespace=444730.
- `Taormino_T_Bibliya_Bdsm_Polnoe_Rukova6.pdf`: replacement=0, mojibake=472, nonWhitespace=619130.
- `Женская психопатология Святоч.pdf`: replacement=0, mojibake=74, nonWhitespace=411297.
- `Стерн Д. - Глаз видит сам себя.pdf`: replacement=0, mojibake=38, nonWhitespace=86358.
- `Эмили Нагоски - Как хочет женщина.pdf`: replacement=0, mojibake=554, nonWhitespace=613068.

OCR outputs with minor encoding/noise markers, recommended spot-check:
- `88435_df7b0137c2a7e0ee994a85bfa8f01c63.pdf`: mojibakeHits=519, replacement=0, quality=good.
- `88436_f74ff498f23077badd28e1a443f537ab.pdf`: mojibakeHits=471, replacement=0, quality=good.
- `Медицинская сексология и психотерапия сексуальных расстройств, Доморацкий В.А., 2020.pdf`: mojibakeHits=123, replacement=0, quality=good.
- `Медицинская_сексология_Психотерапия_сексуальных_расстройств.pdf`: mojibakeHits=123, replacement=0, quality=good.
- `Сексуальный интеллект.pdf`: mojibakeHits=387, replacement=0, quality=good.
- `Яффе Секс в жизни женщины .pdf`: mojibakeHits=306, replacement=0, quality=good.
- `Яффе Секс в жизни мужчины .pdf`: mojibakeHits=284, replacement=0, quality=good.

## Notes for review

- `Sexopatologia_Spravochnik_1990.pdf` выглядит главным проблемным OCR: очень мало распознанного текста на страницу.
- Дубликат Доморацкого не OCR-ился второй раз: cleaned/raw скопированы из идентичного SHA-файла.
- Папка `kb/sexologist/reviewed` оставлена пустой для ручного утверждения cleaned-файлов перед любыми будущими индексирующими действиями.
- Перед удалением старой `sources/sexologist/ocr` или переносом оригинальных PDF нужно отдельное подтверждение.
