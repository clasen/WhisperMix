import fs from 'fs';
import Bottleneck from 'bottleneck';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { getAudioDurationInSeconds } from 'get-audio-duration';
import os from 'os'; // For temporary directory
import { Readable } from 'stream';
import { pipeline as streamPipeline } from 'stream/promises';

// Static imports for local dependencies
import { pipeline as hfPipeline, env } from '@huggingface/transformers';
import audioDecode from 'audio-decode';

const PARAKEET_LAYOUTS = {
    'istupakov/parakeet-tdt-0.6b-v3': {
        cacheKey: 'istupakov-parakeet-tdt-0.6b-v3',
        repo: 'istupakov/parakeet-tdt-0.6b-v3-onnx',
        files: [
            { src: 'config.json', dst: 'config.json' },
            { src: 'nemo128.onnx', dst: 'nemo128.onnx' },
            { src: 'encoder-model.int8.onnx', dst: 'encoder-model.int8.onnx' },
            { src: 'decoder_joint-model.int8.onnx', dst: 'decoder_joint-model.int8.onnx' },
            { src: 'vocab.txt', dst: 'vocab.txt' },
        ],
    },
    'efederici/parakeet-tdt-0.6b-v3-int4': {
        cacheKey: 'efederici-parakeet-tdt-0.6b-v3-int4',
        repo: 'efederici/parakeet-tdt-0.6b-v3-onnx-int4',
        files: [
            { src: 'config.json', dst: 'config.json' },
            { src: 'nemo128.onnx', dst: 'nemo128.onnx' },
            { src: 'encoder-model.int4.onnx', dst: 'encoder-model.int8.onnx' },
            { src: 'decoder_joint-model.int8.onnx', dst: 'decoder_joint-model.int8.onnx' },
            { src: 'vocab.txt', dst: 'vocab.txt' },
        ],
    },
    'nasedkinpv/parakeet-tdt-0.6b-v3-int8': {
        cacheKey: 'nasedkinpv-parakeet-tdt-0.6b-v3-int8',
        repo: 'nasedkinpv/parakeet-tdt-0.6b-v3-onnx-int8',
        files: [
            { src: 'encoder-int8.onnx', dst: 'encoder-model.int8.onnx' },
            { src: 'encoder-int8.onnx.data', dst: 'encoder-model.int8.onnx.data' },
            { src: 'decoder_joint-int8.onnx', dst: 'decoder_joint-model.int8.onnx' },
            { src: 'vocab.txt', dst: 'vocab.txt' },
            { srcRepo: 'istupakov/parakeet-tdt-0.6b-v3-onnx', src: 'nemo128.onnx', dst: 'nemo128.onnx' },
        ],
        synthConfig: {
            model_type: 'nemo-conformer-tdt',
        },
    },
};

class WhisperMix {
    constructor(setup = {}) {
        this.model = 'openai/whisper-1';
        this.bottleneck = {
            minTime: 2000,
            maxConcurrent: 1,
            reservoir: 18,
            reservoirRefreshAmount: 18,
            reservoirRefreshInterval: 60000
        };
        this.chunkSize = 15 * 60 - 10; // 14 minutes 50 seconds
        
        const config = {
            'openai/whisper-1': {
                url: 'https://api.openai.com/v1/audio/transcriptions',
                modelName: 'whisper-1',
                apiKey: process.env.OPENAI_API_KEY,
            },
            'groq/whisper-large-v3': {
                url: 'https://api.groq.com/openai/v1/audio/transcriptions',
                modelName: 'whisper-large-v3',
                apiKey: process.env.GROQ_API_KEY,
            },
            'xenova/whisper-large-v3': {
                local: true,
                modelName: 'Xenova/whisper-large-v3',
                dtype: 'q8',
            },
            'xenova/whisper-base': {
                local: true,
                modelName: 'Xenova/whisper-base',
                dtype: 'q8',
                backend: 'transformers',
            },
            'istupakov/parakeet-tdt-0.6b-v3': {
                local: true,
                modelName: 'Parakeet-TDT-0.6B-v3',
                backend: 'onnx-asr-web',
                layout: PARAKEET_LAYOUTS['istupakov/parakeet-tdt-0.6b-v3'],
            },
            'efederici/parakeet-tdt-0.6b-v3-int4': {
                local: true,
                modelName: 'Parakeet-TDT-0.6B-v3-int4',
                backend: 'onnx-asr-web',
                layout: PARAKEET_LAYOUTS['efederici/parakeet-tdt-0.6b-v3-int4'],
            },
            'nasedkinpv/parakeet-tdt-0.6b-v3-int8': {
                local: true,
                modelName: 'Parakeet-TDT-0.6B-v3-int8',
                backend: 'onnx-asr-web',
                layout: PARAKEET_LAYOUTS['nasedkinpv/parakeet-tdt-0.6b-v3-int8'],
            },
        };

        Object.assign(this, setup);

        this.config = config[this.model];
        if (!this.config) {
            throw new Error(`Unknown model: "${this.model}". Valid models: ${Object.keys(config).join(', ')}`);
        }
        this.apiKey = this.apiKey || this.config.apiKey;
        this.apiUrl = this.config.url;
        this.isLocal = this.config.local || false;
        this.modelName = this.config.modelName;
        this.dtype = this.dtype || this.config.dtype;
        this.showProgress = this.showProgress || false;
        this.localBackend = this.config.backend || 'transformers';
        this.layout = this.config.layout;
        this.transcriber = null;
        this._onnxAsrNodeModule = null;
        this._warnedParakeetLanguage = false;

        this.limiter = new Bottleneck(this.bottleneck);
    }

    async fromFile(filePath, options = {}) {
        const transcriptionOptions = this._resolveTranscriptionOptions(options);
        const absolutePath = path.resolve(filePath);
        
        // Check if file exists
        try {
            await fs.promises.access(absolutePath, fs.constants.F_OK);
        } catch (error) {
            throw new Error(`File not found: ${absolutePath}`);
        }
        
        const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'whispermix-chunks-'));

        try {
            const duration = await getAudioDurationInSeconds(absolutePath);

            if (duration <= this.chunkSize) {
                // Process as a single file
                return this._transcribeFilePath(absolutePath, transcriptionOptions);
            } else {
                // Split audio and process chunks
                const transcriptions = [];
                const numChunks = Math.ceil(duration / this.chunkSize);

                for (let i = 0; i < numChunks; i++) {
                    const chunkPath = path.join(tempDir, `chunk-${i}.mp3`);
                    const startTime = i * this.chunkSize;
                    
                    await new Promise((resolve, reject) => {
                        ffmpeg(absolutePath)
                            .setStartTime(startTime)
                            .setDuration(this.chunkSize)
                            .output(chunkPath)
                            .on('end', () => {
                                resolve();
                            })
                            .on('error', (err) => {
                                console.error(`Error creating chunk ${i + 1}:`, err);
                                reject(err);
                            })
                            .run();
                    });

                    const transcription = await this._transcribeFilePath(chunkPath, transcriptionOptions);
                    transcriptions.push(this._offsetTranscription(transcription, startTime));
                    
                    // Clean up chunk immediately after processing
                    try {
                        await fs.promises.unlink(chunkPath);
                    } catch (unlinkErr) {
                        console.warn(`Could not delete chunk ${chunkPath}:`, unlinkErr);
                    }
                }
                return this._mergeTranscriptions(transcriptions, transcriptionOptions, duration);
            }
        } finally {
            // Clean up the temporary directory
            try {
                await fs.promises.rm(tempDir, { recursive: true, force: true });
            } catch (rmErr) {
                console.warn(`Could not delete temporary directory ${tempDir}:`, rmErr);
            }
        }
    }

    async _transcribeFilePath(filePath, options) {
        if (this.isLocal) {
            return this._transcribeLocalFile(filePath, options);
        }
        return this.fromStream(fs.createReadStream(filePath), options);
    }

    async fromStream(audioStream, options = {}) {
        if (this.isLocal) {
            throw new Error('fromStream is not supported for local Whisper model. Use fromFile instead.');
        }
        const transcriptionOptions = this._resolveTranscriptionOptions(options);

        const chunks = [];
        for await (const chunk of audioStream) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        return this.limiter.schedule(() => this._makeRequest(buffer, transcriptionOptions));
    }

    async _makeRequest(buffer, options = {}) {
        try {
            const blob = new Blob([buffer], { type: 'audio/mpeg' });
            const formData = new FormData();
            formData.append('file', blob, 'audio.mp3');
            formData.append('model', this.modelName);
            if (this.language) {
                formData.append('language', this.language);
            }
            if (options.wordTimestamps) {
                formData.append('response_format', 'verbose_json');
                formData.append('timestamp_granularities[]', 'word');
            }

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: formData,
            });

            const responseData = await response.json();

            if (!response.ok) {
                throw responseData;
            }

            return this._formatApiTranscription(responseData, options);
        } catch (error) {
            throw error?.message || error;
        }
    }

    async _transcribeLocalFile(filePath, options = {}) {
        try {
            // Read the audio file as a buffer
            const buffer = fs.readFileSync(filePath);
            
            // Decode the audio file (supports MP3, WAV, etc.)
            const audioBuffer = await audioDecode(buffer);
            
            // Convert to Float32Array and resample to 16kHz if needed
            let audioData = new Float32Array(audioBuffer.length);
            
            // Copy audio data
            for (let i = 0; i < audioBuffer.length; i++) {
                audioData[i] = audioBuffer.getChannelData(0)[i];
            }
            
            // Resample to 16kHz if the sample rate is different
            if (audioBuffer.sampleRate !== 16000) {
                const ratio = 16000 / audioBuffer.sampleRate;
                const newLength = Math.round(audioData.length * ratio);
                const resampledData = new Float32Array(newLength);
                
                for (let i = 0; i < newLength; i++) {
                    const oldIndex = Math.floor(i / ratio);
                    resampledData[i] = audioData[oldIndex] || 0;
                }
                
                audioData = resampledData;
            }

            // Reuse a single pipeline instance so repeated calls don't re-download/re-initialize.
            const transcriber = await this._getLocalTranscriber();

            if (this.localBackend === 'onnx-asr-web') {
                if (this.language !== undefined && this.showProgress && !this._warnedParakeetLanguage) {
                    console.log('[WhisperMix] "language" option is ignored for Parakeet local models.');
                    this._warnedParakeetLanguage = true;
                }
                const result = await transcriber.transcribeSamples(audioData, 16000);
                const text = result?.text || result?.utterance_text;
                if (typeof text !== 'string') {
                    throw new Error('Parakeet transcription returned no text output.');
                }
                return this._formatLocalTranscription(text, result?.words, options);
            }

            // Pass the processed audio data
            const transcriberOptions = {
                task: 'transcribe',
            };
            if (this.language !== undefined) {
                transcriberOptions.language = this.language;
            }
            if (options.wordTimestamps) {
                transcriberOptions.return_timestamps = 'word';
            }
            const result = await transcriber(audioData, transcriberOptions);
            const words = options.wordTimestamps ? this._wordsFromTransformersChunks(result.chunks) : undefined;
            return this._formatLocalTranscription(result.text, words, options);
        } catch (error) {
            const cacheHint = this.localBackend === 'onnx-asr-web'
                ? this._getParakeetCacheDir(this.layout)
                : `${env.cacheDir}${this.modelName}/`;
            throw new Error(`Local transcription failed: ${error.message}. If this happened after an interrupted download, remove the model cache at ${cacheHint} and try again.`);
        }
    }

    _resolveTranscriptionOptions(options = {}) {
        return {
            wordTimestamps: Boolean(options.wordTimestamps ?? this.wordTimestamps),
        };
    }

    _formatApiTranscription(responseData, options) {
        const text = this._formatText(responseData.text);
        if (!options.wordTimestamps) {
            return text;
        }
        return {
            ...responseData,
            text,
            words: this._normalizeWords(responseData.words),
        };
    }

    _formatLocalTranscription(text, words, options) {
        const formattedText = this._formatText(text);
        if (!options.wordTimestamps) {
            return formattedText;
        }
        return {
            text: formattedText,
            words: this._normalizeWords(words),
        };
    }

    _formatText(text) {
        if (typeof text !== 'string') {
            throw new Error('Transcription returned no text output.');
        }
        return text.trim();
    }

    _wordsFromTransformersChunks(chunks) {
        if (!Array.isArray(chunks)) {
            return undefined;
        }
        return chunks.map((chunk) => ({
            word: chunk.text,
            timestamp: chunk.timestamp,
        }));
    }

    _normalizeWords(words) {
        if (!Array.isArray(words)) {
            throw new Error('Word timestamps were requested, but the selected backend did not return word timestamps.');
        }

        return words
            .map((word) => {
                if (!word || typeof word !== 'object') {
                    throw new Error('Word timestamp response contains an invalid word entry.');
                }

                const text = typeof word.word === 'string' ? word.word : word.text;
                const start = typeof word.start === 'number' ? word.start : word.timestamp?.[0];
                const end = typeof word.end === 'number' ? word.end : word.timestamp?.[1];

                if (typeof text !== 'string' || typeof start !== 'number' || typeof end !== 'number') {
                    throw new Error('Word timestamp response contains an invalid word entry.');
                }

                return {
                    word: text.trim(),
                    start,
                    end,
                };
            })
            .filter((word) => word.word.length > 0);
    }

    _mergeTranscriptions(transcriptions, options, duration) {
        const text = transcriptions
            .map((transcription) => this._transcriptionText(transcription))
            .filter((chunkText) => chunkText.length > 0)
            .join(' ')
            .trim();

        if (!options.wordTimestamps) {
            return text;
        }

        const words = transcriptions.flatMap((transcription) => {
            if (!Array.isArray(transcription.words)) {
                throw new Error('Word timestamps were requested, but a chunk returned no word timestamps.');
            }
            return transcription.words;
        });
        const segments = transcriptions.flatMap((transcription) => (
            Array.isArray(transcription.segments) ? transcription.segments : []
        ));
        const result = { text, words, duration };

        if (segments.length > 0) {
            result.segments = segments;
        }

        return result;
    }

    _transcriptionText(transcription) {
        if (typeof transcription === 'string') {
            return transcription.trim();
        }
        return this._formatText(transcription.text);
    }

    _offsetTranscription(transcription, offsetSeconds) {
        if (typeof transcription === 'string' || offsetSeconds === 0) {
            return transcription;
        }

        return {
            ...transcription,
            words: Array.isArray(transcription.words)
                ? this._offsetTimedItems(transcription.words, offsetSeconds)
                : transcription.words,
            segments: Array.isArray(transcription.segments)
                ? this._offsetTimedItems(transcription.segments, offsetSeconds)
                : transcription.segments,
        };
    }

    _offsetTimedItems(items, offsetSeconds) {
        return items.map((item) => ({
            ...item,
            start: this._offsetTime(item.start, offsetSeconds),
            end: this._offsetTime(item.end, offsetSeconds),
        }));
    }

    _offsetTime(value, offsetSeconds) {
        if (typeof value !== 'number') {
            return value;
        }
        return Number((value + offsetSeconds).toFixed(3));
    }

    async _getLocalTranscriber() {
        if (!this.transcriber) {
            if (this.localBackend === 'onnx-asr-web') {
                if (!this.layout) {
                    throw new Error(`Missing Parakeet layout for model: ${this.model}`);
                }
                const modelDir = await this._ensureParakeetAssets(this.layout);
                const { loadLocalModel } = await this._getOnnxAsrNodeModule();
                this.transcriber = await loadLocalModel(modelDir, {
                    quantization: 'int8',
                    sessionOptions: {
                        executionProviders: ['wasm'],
                    },
                });
                return this.transcriber;
            }

            const options = {};
            if (this.dtype) {
                options.dtype = this.dtype;
            }
            if (this.showProgress) {
                options.progress_callback = (event) => {
                    if (!event || !event.status) return;
                    if (event.file && typeof event.progress === 'number') {
                        console.log(`[WhisperMix] ${event.status} ${event.file} ${event.progress.toFixed(1)}%`);
                        return;
                    }
                    console.log(`[WhisperMix] ${event.status}`);
                };
            }

            this.transcriber = hfPipeline('automatic-speech-recognition', this.modelName, options);
        }

        return this.transcriber;
    }

    async _getOnnxAsrNodeModule() {
        if (!this._onnxAsrNodeModule) {
            this._onnxAsrNodeModule = await import('onnx-asr-web/node');
        }
        return this._onnxAsrNodeModule;
    }

    _getParakeetCacheDir(layout) {
        if (this.cacheDir) {
            return path.resolve(this.cacheDir);
        }
        if (!layout?.cacheKey) {
            throw new Error(`Missing cache key for Parakeet layout: ${this.model}`);
        }
        return path.join(os.homedir(), '.cache', 'whispermix', 'parakeet', layout.cacheKey);
    }

    async _ensureParakeetAssets(layout) {
        const cacheDir = this._getParakeetCacheDir(layout);
        await fs.promises.mkdir(cacheDir, { recursive: true });

        for (const fileDef of layout.files) {
            const destination = path.join(cacheDir, fileDef.dst);
            const sourceRepo = fileDef.srcRepo || layout.repo;

            if (await this._hasFileWithContent(destination)) {
                continue;
            }

            const sourceUrl = `https://huggingface.co/${sourceRepo}/resolve/main/${fileDef.src}`;
            if (this.showProgress) {
                console.log(`[WhisperMix] Downloading ${fileDef.src} from ${sourceRepo}`);
            }
            await this._downloadToFile(sourceUrl, destination);
        }

        if (layout.synthConfig) {
            const configPath = path.join(cacheDir, 'config.json');
            if (!(await this._hasFileWithContent(configPath))) {
                await fs.promises.writeFile(configPath, JSON.stringify(layout.synthConfig, null, 2));
            }
        }

        return cacheDir;
    }

    async _hasFileWithContent(filePath) {
        try {
            const stats = await fs.promises.stat(filePath);
            return stats.isFile() && stats.size > 0;
        } catch {
            return false;
        }
    }

    async _downloadToFile(url, filePath) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Download failed (${response.status} ${response.statusText}) for ${url}`);
        }
        if (!response.body) {
            throw new Error(`Empty response body while downloading ${url}`);
        }

        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;

        try {
            await streamPipeline(
                Readable.fromWeb(response.body),
                fs.createWriteStream(tempPath),
            );
            await fs.promises.rename(tempPath, filePath);
        } catch (error) {
            await fs.promises.rm(tempPath, { force: true });
            throw error;
        }
    }
}

// Support both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WhisperMix;
}
export default WhisperMix;