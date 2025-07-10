import WhisperMix from '../index.js';

const whisperLocal = new WhisperMix({
    model: 'xenova/large-v3'
});

const r = await whisperLocal.fromFile('conversation.wav');
console.log(r);