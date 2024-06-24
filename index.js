const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

class WhisperMix {
    
    constructor(setup = { model: 'whisper-1' }) {
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

        this.model = setup.model;
        this.apiKey = config[this.model].apiKey;

        Object.assign(this, setup)

        this.apiUrl = config[this.model].url;
    }

    async fromVoiceFile(filePath) {
        return this.fromVoiceStream(fs.createReadStream(filePath));
    }

    async fromVoiceStream(audioStream) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', audioStream);
            formData.append('model', this.model);

            this._makeRequest(formData)
                .then(resolve)
                .catch(reject);
        });
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

module.exports = WhisperMix