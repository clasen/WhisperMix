const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const Bottleneck = require('bottleneck');

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
        return this.fromStream(fs.createReadStream(filePath));
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