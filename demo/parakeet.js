import WhisperMix from '../index.ts';

const whisperParakeet = new WhisperMix({
    model: 'efederici/parakeet-tdt-0.6b-v3-int4',
    showProgress: true,
});

const result = await whisperParakeet.fromFile('conversation.wav');
console.log(result);
