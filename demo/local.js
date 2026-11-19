import WhisperMix from '../index.ts';

const whisperLocal = new WhisperMix({
    model: 'xenova/whisper-large-v3',
    showProgress: true,
    language: 'spanish',
});

const r = await whisperLocal.fromFile('conversation.wav');
console.log(r);