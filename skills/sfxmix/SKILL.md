---
name: whispermix
description: Transcribe audio to text using WhisperMix, a Node.js wrapper around OpenAI Whisper, Groq Whisper Large v3, local Whisper (xenova) and local Parakeet TDT v3 models. Use when the user asks to "transcribe audio", "speech to text", "convert audio/voice to text", mentions an audio file (.mp3, .wav, .m4a, .ogg, .flac, .webm) to turn into text, or names any of these models/providers: Whisper, OpenAI Whisper, Groq Whisper, Whisper Large v3, Parakeet, NVIDIA Parakeet, xenova/whisper, onnx-asr. Also use when the user wants to pick between a cloud API and a local on-device transcription model in a Node.js project.
---

# WhisperMix

Single Node.js entry point for audio transcription. Picks one of four backends behind the same API: OpenAI Whisper, Groq Whisper Large v3, local Whisper (xenova), or local Parakeet TDT v3. Handles long files by chunking and rate-limits API calls automatically.

Do NOT use for TTS, live microphone streaming, or translation. WhisperMix is one-way: a complete audio file/stream → text.

## Model selection (decide first)

| Need | Pick |
|---|---|
| Offline, lowest latency | `istupakov/parakeet-tdt-0.6b-v3` |
| Offline, smallest footprint (~410 MB) | `efederici/parakeet-tdt-0.6b-v3-int4` |
| Highest accuracy, cloud | `groq/whisper-large-v3` (fast) or `openai/whisper-1` |
| Offline + per-language control | `xenova/whisper-large-v3` or `xenova/whisper-base` |
| Node stream input (not a file) | API only: `openai/whisper-1` or `groq/whisper-large-v3` |

Constraints to surface before coding:
- Local models (`xenova/*`, `*/parakeet-tdt-0.6b-v3*`) accept **files only**, not streams.
- `language` option applies only to local Whisper. Parakeet is multilingual and ignores it.
- API models need `OPENAI_API_KEY` or `GROQ_API_KEY` in the environment.
- First Parakeet run downloads weights to `~/.cache/whispermix/parakeet/<modelKey>/` — warn the user.
- Requires `ffmpeg` on `PATH` for long-audio chunking (>15 min split automatically).
- `wordTimestamps: true` changes the return value from plain text to `{ text, words }`, where each word has `start` and `end` times in seconds.

## API

```bash
npm install whispermix
```

ESM only. If the consumer is CommonJS, use `const WhisperMix = (await import('whispermix')).default;`.

```javascript
import WhisperMix from 'whispermix';

const w = new WhisperMix({ model: '<modelKey>' });
const text = await w.fromFile('path/to/audio.mp3');
// API models only:
const text2 = await w.fromStream(fs.createReadStream('path/to/audio.mp3'));
```

Constructor options:
- `model` (required) — see selection table.
- `language` — local Whisper only, e.g. `'spanish'`. Default `'auto'`.
- `chunkSize` — seconds per chunk for long audio. Default `890` (~14m50s).
- `bottleneck` — Bottleneck config for API models. Defaults: `minTime: 3000`, `maxConcurrent: 1`, `reservoir: 18`, `reservoirRefreshAmount: 18`, `reservoirRefreshInterval: 60000`.
- `showProgress` — boolean, prints chunk/decoding progress.
- `wordTimestamps` — boolean, returns `{ text, words }` instead of a string. Can also be passed per call to `fromFile(filePath, { wordTimestamps: true })` or `fromStream(stream, { wordTimestamps: true })`.

## Examples

Cheapest local:

```javascript
import WhisperMix from 'whispermix';
const w = new WhisperMix({ model: 'efederici/parakeet-tdt-0.6b-v3-int4', showProgress: true });
console.log(await w.fromFile('meeting.wav'));
```

Groq with custom rate limit:

```javascript
import WhisperMix from 'whispermix';
const w = new WhisperMix({
    model: 'groq/whisper-large-v3',
    bottleneck: { minTime: 4000, maxConcurrent: 1 },
});
console.log(await w.fromFile('podcast.mp3'));
```

Word-level timestamps:

```javascript
import WhisperMix from 'whispermix';
const w = new WhisperMix({ model: 'openai/whisper-1' });
const result = await w.fromFile('meeting.mp3', { wordTimestamps: true });
console.log(result.text);
console.log(result.words); // [{ word, start, end }, ...]
```

Local Whisper, fixed language:

```javascript
import WhisperMix from 'whispermix';
const w = new WhisperMix({ model: 'xenova/whisper-large-v3', language: 'spanish' });
console.log(await w.fromFile('entrevista.m4a'));
```

## Troubleshooting

- **`OPENAI_API_KEY`/`GROQ_API_KEY is not set`** — export the key, or switch to a local model.
- **`fromStream` not supported** — local models are file-only. Use `fromFile`, or switch to an API model.
- **`Cannot find ffmpeg`** — install it (`brew install ffmpeg` / `apt install ffmpeg`).
- **First Parakeet call hangs** — weights downloading; enable `showProgress: true`.
- **`ERR_REQUIRE_ESM`** — WhisperMix is ESM-only; use dynamic `import()` from CommonJS.
