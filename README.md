# 🎙️ WhisperMix

WhisperMix is a flexible module that provides an interface for transcribing audio using OpenAI's Whisper model or Groq's Whisper Large v3 model.

## 📦 Installation

```bash
npm install whispermix
```

## ⚙️ Configuration

Before using WhisperMix, you need to set up your environment variables:

- For OpenAI's Whisper: Set `OPENAI_API_KEY` in your environment or `.env` file.
- For Groq's Whisper Large v3: Set `GROQ_API_KEY` in your environment or `.env` file.

## 🚀 Usage

First, import the WhisperMix class:

```javascript
const WhisperMix = require('whispermix');
```

### 🔧 Initializing WhisperMix

You can initialize WhisperMix with a specific model:

```javascript
const whisper = new WhisperMix({ model: 'whisper-1' }); // For OpenAI's Whisper
// or
const whisper = new WhisperMix({ model: 'whisper-large-v3' }); // For Groq's Whisper Large v3
```

### 📄 Transcribing from a File

```javascript
const filePath = 'path/to/your/audio/file.mp3';
whisper.fromVoiceFile(filePath)
  .then(transcription => console.log(transcription))
  .catch(error => console.error(error));
```

### 🌊 Transcribing from a Stream

```javascript
const fs = require('fs');
const audioStream = fs.createReadStream('path/to/your/audio/file.mp3');

whisper.fromVoiceStream(audioStream)
  .then(transcription => console.log(transcription))
  .catch(error => console.error(error));
```

## 📚 API

### `new WhisperMix(options)`

Creates a new WhisperMix instance.

- `options.model`: The model to use for transcription. Can be 'whisper-1' (OpenAI) or 'whisper-large-v3' (Groq).

### `whisper.fromVoiceFile(filePath)`

Transcribes audio from a file.

- `filePath`: Path to the audio file.

Returns a Promise that resolves with the transcription text.

### `whisper.fromVoiceStream(audioStream)`

Transcribes audio from a stream.

- `audioStream`: A readable stream of the audio data.

Returns a Promise that resolves with the transcription text.

## ⚠️ Error Handling

WhisperMix throws errors for API request failures. Always wrap your calls in try-catch blocks or use `.catch()` with promises to handle potential errors.

## 📄 License

The MIT License (MIT)

Copyright (c) Martin Clasen

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.