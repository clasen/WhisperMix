const WhisperMix = require('../index.js')

const transcribe = new WhisperMix({ model: 'whisper-1' });


main(); async function main() {
    const r = [];
    r.push(transcribe.fromVoiceFile('./example.mp3'));
    const x = await Promise.all(r).catch(console.log);
    console.log(x)
}