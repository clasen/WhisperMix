require('dotenv').config();
const WhisperMix = require('../index.js')


const transcribe = new WhisperMix({ model: 'whisper-large-v3' });

main(); async function main() {
    const r = await transcribe.fromFile('./example.mp3');
    console.log(r)
}