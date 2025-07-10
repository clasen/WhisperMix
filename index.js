import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import Bottleneck from 'bottleneck';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { getAudioDurationInSeconds } from 'get-audio-duration';
import os from 'os'; // For temporary directory

// Static imports for local dependencies
import { pipeline } from '@xenova/transformers';
import audioDecode from 'audio-decode';

class WhisperMix {
    constructor(setup = {}) {
        this.model = 'openai';
        this.bottleneck = {
            minTime: 2000,
            maxConcurrent: 1,
            reservoir: 18,
            reservoirRefreshAmount: 18,
            reservoirRefreshInterval: 60000
        };
        this.chunkSize = 15 * 60 - 10; // 14 minutes 50 seconds
        
        const config = {
            'openai': {
                url: 'https://api.openai.com/v1/audio/transcriptions',
                modelName: 'whisper-1',
                apiKey: process.env.OPENAI_API_KEY,
            },
            'groq/large-v3': {
                url: 'https://api.groq.com/openai/v1/audio/transcriptions',
                modelName: 'whisper-large-v3',
                apiKey: process.env.GROQ_API_KEY,
            },
            'xenova/large-v3': {
                local: true,
                modelName: 'Xenova/whisper-large-v3',
            },
            'xenova/base': {
                local: true,
                modelName: 'Xenova/whisper-base',
            },            
        };

        Object.assign(this, setup);

        this.config = config[this.model];
        this.apiKey = this.apiKey || this.config.apiKey;
        this.apiUrl = this.config.url;
        this.isLocal = this.config.local || false;
        this.modelName = this.config.modelName;

        this.limiter = new Bottleneck(this.bottleneck);
    }

    async fromFile(filePath) {
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
                if (this.isLocal) {
                    return this._transcribeLocalFile(absolutePath);
                } else {
                    return this.fromStream(fs.createReadStream(absolutePath));
                }
            } else {
                // Split audio and process chunks
                let accumulatedTranscription = "";
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

                    let transcription;
                    if (this.isLocal) {
                        transcription = await this._transcribeLocalFile(chunkPath);
                    } else {
                        const chunkStream = fs.createReadStream(chunkPath);
                        transcription = await this.fromStream(chunkStream);
                    }
                    accumulatedTranscription += (transcription + " ").trimStart();
                    
                    // Clean up chunk immediately after processing
                    try {
                        await fs.promises.unlink(chunkPath);
                    } catch (unlinkErr) {
                        console.warn(`Could not delete chunk ${chunkPath}:`, unlinkErr);
                    }
                }
                return accumulatedTranscription.trim();
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

    async fromStream(audioStream) {
        if (this.isLocal) {
            throw new Error('fromStream is not supported for local Whisper model. Use fromFile instead.');
        }
        
        return this.limiter.schedule(() => new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', audioStream);
            formData.append('model', this.modelName);

            this._makeRequest(formData)
                .then(resolve)
                .catch(reject);
        }));
    }

    async _makeRequest(formData) {
        try {
            const response = await axios.post(this.apiUrl, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${this.apiKey}`,
                },
            });
            return response.data.text.trim();
        } catch (error) {
            throw error.response ? error.response.data : error.message;
        }
    }

    async _transcribeLocalFile(filePath) {
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

            // Create the transcriber pipeline
            const transcriber = await pipeline('automatic-speech-recognition', this.modelName);

            // Pass the processed audio data
            const result = await transcriber(audioData, {
                language: this.language,
                task: 'transcribe',
            });

            return result.text.trim();
        } catch (error) {
            throw new Error(`Local transcription failed: ${error.message}`);
        }
    }
}

// Support both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WhisperMix;
}
export default WhisperMix;