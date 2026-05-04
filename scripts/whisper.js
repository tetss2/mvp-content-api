/**
 * ТРАНСКРИБАЦИЯ ВИДЕО/АУДИО через Whisper API
 * Запуск: node scripts/whisper.js ./sources/sexologist/video.mp4 output.txt
 *
 * Поддерживает: mp3, mp4, wav, m4a, webm (до 25MB на файл)
 * Большие файлы нужно разбить на части вручную.
 */

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('❌ Нужен OPENAI_API_KEY');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function transcribe(inputFile, outputFile) {
  if (!inputFile) {
    console.error('Использование: node scripts/whisper.js <input_file> [output.txt]');
    console.error('Пример: node scripts/whisper.js ./sources/sexologist/lecture.mp3 transcript.txt');
    process.exit(1);
  }

  const absInput = path.resolve(inputFile);
  if (!fs.existsSync(absInput)) {
    console.error(`❌ Файл не найден: ${absInput}`);
    process.exit(1);
  }

  const fileSize = fs.statSync(absInput).size;
  const fileSizeMB = (fileSize / 1024 / 1024).toFixed(1);
  console.log(`📁 Файл: ${absInput}`);
  console.log(`📦 Размер: ${fileSizeMB} MB`);

  if (fileSize > 25 * 1024 * 1024) {
    console.error('❌ Файл больше 25MB. Разбей его на части (например через ffmpeg):');
    console.error('   ffmpeg -i input.mp4 -ss 0 -t 1800 part1.mp3');
    console.error('   ffmpeg -i input.mp4 -ss 1800 -t 1800 part2.mp3');
    process.exit(1);
  }

  console.log('⏳ Отправляю в Whisper API...');
  const estimatedCost = (fileSize / 1024 / 1024 / 60 * 0.006).toFixed(3);
  console.log(`💰 Примерная стоимость: ~$${estimatedCost}`);

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(absInput),
      model: 'whisper-1',
      language: 'ru',
      response_format: 'text',
    });

    const outFile = outputFile || `${path.basename(inputFile, path.extname(inputFile))}_transcript.txt`;
    const absOutput = path.resolve(outFile);
    fs.writeFileSync(absOutput, transcription);

    console.log(`✅ Готово! Транскрипт сохранён: ${absOutput}`);
    console.log(`📝 Длина: ${transcription.length} символов`);
    console.log(`\nПервые 200 символов:`);
    console.log(transcription.substring(0, 200) + '...');

  } catch (err) {
    console.error('❌ Ошибка Whisper:', err.message);
    process.exit(1);
  }
}

transcribe(process.argv[2], process.argv[3]);
