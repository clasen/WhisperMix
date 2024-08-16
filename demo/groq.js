require('dotenv').config();
const WhisperMix = require('../index.js')

const transcribe = new WhisperMix({ model: 'whisper-large-v3' });

main(); async function main() {
    for (let i = 0; i < 10; i++) {
        transcribe.fromFile('./example.mp3')
            .then(console.log)
            .catch(console.error);
    }
}