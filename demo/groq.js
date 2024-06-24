const WhisperMix = require('../index.js')

const transcribe = new WhisperMix({ model: 'whisper-large-v3' });

main(); async function main() {
    const r = transcribe.fromVoiceFile('./example.mp3');
    console.log(r)
}