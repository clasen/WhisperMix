# 🎙️ WhisperMix

WhisperMix is a flexible module that provides an interface for transcribing audio using OpenAI's Whisper model, Groq's Whisper Large v3 model, local Whisper models, or local Parakeet TDT v3 models.

## 📦 Installation

```bash
npm install whispermix
```

## ⚙️ Configuration

Before using WhisperMix with API-based models, you need to set up your environment variables:

- For OpenAI's Whisper: Set `OPENAI_API_KEY` in your environment or `.env` file.
- For Groq's Whisper Large v3: Set `GROQ_API_KEY` in your environment or `.env` file.
- For local Whisper: No API key required.

## 🚀 Usage

First, import the WhisperMix class:

```javascript
import WhisperMix from 'whispermix';
```

### 🔧 Initializing WhisperMix

You can initialize WhisperMix with a specific model:

```javascript
const whisper = new WhisperMix({ model: 'openai/whisper-1' }); // For OpenAI's Whisper
// or
const whisperGroq = new WhisperMix({ model: 'groq/whisper-large-v3' }); // For Groq's Whisper Large v3
// or
const whisperLocal = new WhisperMix({ model: 'xenova/whisper-large-v3' }); // For local Whisper (large)
// or
const whisperLocalBase = new WhisperMix({ model: 'xenova/whisper-base' }); // For local Whisper (base)
// or
const whisperParakeet = new WhisperMix({ model: 'istupakov/parakeet-tdt-0.6b-v3' }); // For local Parakeet v3 (int8)
// or
const whisperParakeetInt4 = new WhisperMix({ model: 'efederici/parakeet-tdt-0.6b-v3-int4' }); // For local Parakeet v3 (int4 encoder)
// or
const whisperParakeetAlt = new WhisperMix({ model: 'nasedkinpv/parakeet-tdt-0.6b-v3-int8' }); // For local Parakeet v3 (alt int8 repo)
```

### 📄 Transcribing from a File

```javascript
const filePath = 'path/to/your/audio/file.mp3';
whisperGroq.fromFile(filePath)
  .then(transcription => console.log(transcription))
  .catch(error => console.error(error));

// For local Whisper with language specification
const whisperLocal = new WhisperMix({ 
  model: 'xenova/whisper-large-v3',
  language: 'spanish' // Optional
});
whisperLocal.fromFile(filePath)
  .then(transcription => console.log(transcription))
  .catch(error => console.error(error));
```

### 🌊 Transcribing from a Stream

```javascript
import fs from 'fs';
const audioStream = fs.createReadStream('path/to/your/audio/file.mp3');

whisperGroq.fromStream(audioStream)
  .then(transcription => console.log(transcription))
  .catch(error => console.error(error));
```

**Note:** Stream transcription is only available for API-based models (OpenAI and Groq). Local models (Whisper and Parakeet) require file input.

### ⏱️ Word-Level Timestamps

By default, WhisperMix returns only the transcribed text. To include the start and end time for each word, pass `wordTimestamps: true` per call:

```javascript
const result = await whisperGroq.fromFile('path/to/audio.mp3', {
  wordTimestamps: true
});

console.log(result.text);
console.log(result.words);
// [{ word: 'Hello', start: 0.12, end: 0.48 }, ...]
```

You can also enable it on the instance:

```javascript
const whisper = new WhisperMix({
  model: 'openai/whisper-1',
  wordTimestamps: true
});

const result = await whisper.fromStream(audioStream);
```

### 🐦 Parakeet local models

Parakeet TDT v3 local models are downloaded once and cached in:

`~/.cache/whispermix/parakeet/<modelKey>/`

Available local Parakeet model keys:

- `istupakov/parakeet-tdt-0.6b-v3` (about 670 MB, int8)
- `efederici/parakeet-tdt-0.6b-v3-int4` (about 410 MB, int4/int8 hybrid)
- `nasedkinpv/parakeet-tdt-0.6b-v3-int8` (about 890 MB, int8)

Notes:

- Parakeet TDT v3 is multilingual (25 European languages).
- `language` is ignored for Parakeet local models.

### ⏱️ Long Audio Processing

WhisperMix automatically handles long audio files by splitting them into smaller segments if they exceed 15 minutes in duration. This process is transparent to the user and works with both API-based and local models:

The segmented transcriptions are automatically merged into a single result, ensuring a smooth experience when working with content of any length.

### 🚦 Rate Limiting Configuration

WhisperMix uses Bottleneck for rate limiting API-based models. You can configure the Bottleneck settings when initializing WhisperMix:

```javascript
const whisper = new WhisperMix({
  model: 'openai/whisper-1',
  bottleneck: {
    minTime: 3000,
    maxConcurrent: 1,
    reservoir: 18,
    reservoirRefreshAmount: 18,
    reservoirRefreshInterval: 60000
  }
});
```

The default Bottleneck configuration is:

- `minTime`: 3000 ms (minimum time between requests)
- `maxConcurrent`: 1 (maximum number of concurrent requests)
- `reservoir`: 18 (number of requests that can be made before throttling)
- `reservoirRefreshAmount`: 18 (number of requests added back to the reservoir)
- `reservoirRefreshInterval`: 60000 ms (time interval for refreshing the reservoir)

You can adjust these settings based on your specific rate limiting needs. Note that rate limiting is not applied to local Whisper models.

## 📚 API

### `new WhisperMix(options)`

Creates a new WhisperMix instance.

- `options.model`: The model to use for transcription. Can be `'openai/whisper-1'` (OpenAI), `'groq/whisper-large-v3'` (Groq), `'xenova/whisper-large-v3'` or `'xenova/whisper-base'` (local Whisper), `'istupakov/parakeet-tdt-0.6b-v3'`, `'efederici/parakeet-tdt-0.6b-v3-int4'`, or `'nasedkinpv/parakeet-tdt-0.6b-v3-int8'` (local Parakeet).
- `options.bottleneck`: (Optional) Configuration for Bottleneck rate limiting (API models only).
- `options.chunkSize`: (Optional) The size in seconds of the chunks to split the audio into. Default is 890 seconds.
- `options.language`: (Optional) Language for local Whisper model. Defaults to 'auto' for automatic detection.
- `options.wordTimestamps`: (Optional) Return `{ text, words }` instead of plain text, where each word has `start` and `end` times in seconds.

### `whisper.fromFile(filePath, options)`

Transcribes audio from a file.

- `filePath`: Path to the audio file.
- `options.wordTimestamps`: (Optional) Return word-level timestamps for this call.

Returns a Promise that resolves with the transcription text, or `{ text, words }` when `wordTimestamps` is enabled.

### `whisper.fromStream(audioStream, options)`

Transcribes audio from a stream.

- `audioStream`: A readable stream of the audio data.
- `options.wordTimestamps`: (Optional) Return word-level timestamps for this call.

Returns a Promise that resolves with the transcription text, or `{ text, words }` when `wordTimestamps` is enabled.

## 📄 License

The MIT License (MIT)

Copyright (c) Martin Clasen

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.