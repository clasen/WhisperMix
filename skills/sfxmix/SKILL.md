---
name: whispermix
description: "Transcribe audio to text with WhisperMix in Node.js (OpenAI, Groq, Whisper local or Parakeet local)."
---

# WhisperMix

WhisperMix transcribes audio to text with one API and multiple backends.

Use this skill when the user wants speech-to-text from an audio file (`.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac`, `.webm`) in a Node.js project.

Do not use for TTS, translation, or live microphone streaming.

## Choose a model (quick)

- **Cloud, best quality/speed:** `groq/whisper-large-v3` or `openai/whisper-1`
- **Local, fastest startup:** `efederici/parakeet-tdt-0.6b-v3-int4`
- **Local, better language control:** `xenova/whisper-large-v3`

Important limits:
- Local models are file-only (`fromFile`), no `fromStream`.
- API models need `OPENAI_API_KEY` or `GROQ_API_KEY`.
- `ffmpeg` is required for long files.

## Basic usage

Install:

```bash
npm install whispermix
```

File transcription:

```javascript
import WhisperMix from 'whispermix';

const w = new WhisperMix({ model: 'groq/whisper-large-v3' });
const text = await w.fromFile('audio.mp3');
console.log(text);
```

Word timestamps:

```javascript
import WhisperMix from 'whispermix';

const w = new WhisperMix({ model: 'openai/whisper-1' });
const result = await w.fromFile('audio.mp3', { wordTimestamps: true });
console.log(result.text);
console.log(result.words);
```

## Troubleshooting

- `OPENAI_API_KEY` / `GROQ_API_KEY is not set`: set env var or use a local model.
- `fromStream not supported`: use `fromFile` with local models.
- `Cannot find ffmpeg`: install `ffmpeg` and retry.
