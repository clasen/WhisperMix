import 'dotenv/config';
import WhisperMix from '../index.js';

const transcribe = new WhisperMix({ model: 'groq/whisper-large-v3' });

for (let i = 0; i < 10; i++) {
    try {
        const result = await transcribe.fromFile('./example.mp3');
        console.log(`${i}/10`, result);
    } catch (error) {
        console.error(error);
    }
}