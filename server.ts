import express from 'express';
import cors from 'cors';
import { getThreads, createThread, getMessages, sendMessage } from './src/api/chat';

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Chat endpoints
app.get('/api/chat/threads', getThreads);
app.post('/api/chat/threads', createThread);
app.get('/api/chat/threads/:threadId/messages', getMessages);
app.post('/api/chat/messages', sendMessage);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 