const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const Bottleneck = require('bottleneck');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const os = require('os'); // For temporary directory

class WhisperMix {
    constructor(setup = {}) {
        this.model = 'whisper-1';
        this.bottleneck = {
            minTime: 2000,
            maxConcurrent: 1,
            reservoir: 18,
            reservoirRefreshAmount: 18,
            reservoirRefreshInterval: 60000
        };
        this.chunkSize = 15 * 60 - 10; // 14 minutes 50 seconds

        const config = {
            'whisper-1': {
                url: 'https://api.openai.com/v1/audio/transcriptions',
                apiKey: process.env.OPENAI_API_KEY,
            },
            'whisper-large-v3': {
                url: 'https://api.groq.com/openai/v1/audio/transcriptions',
                apiKey: process.env.GROQ_API_KEY,
            },
        };

        Object.assign(this, setup);

        this.apiKey = this.apiKey || config[this.model].apiKey;
        this.apiUrl = config[this.model].url;

        this.limiter = new Bottleneck(this.bottleneck);
    }

    async fromFile(filePath) {
        const absolutePath = path.resolve(filePath);
        const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'whispermix-chunks-'));

        try {
            const duration = await getAudioDurationInSeconds(absolutePath);

            if (duration <= this.chunkSize) {
                // Process as a single file
                return this.fromStream(fs.createReadStream(absolutePath));
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

                    const chunkStream = fs.createReadStream(chunkPath);
                    const transcription = await this.fromStream(chunkStream);
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
        return this.limiter.schedule(() => new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', audioStream);
            formData.append('model', this.model);

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
}

module.exports = WhisperMix;