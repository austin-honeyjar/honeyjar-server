import { db } from '../db/index.js';
import { chatMessages, chatThreads } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { logger } from '../services/logger.js';
import { chatMessageSchema } from '../services/validation.js';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const LANGFLOW_API_URL = `https://api.langflow.astra.datastax.com/lf/${process.env.REACT_APP_LANGFLOW_ID}/api/v1/run/${process.env.REACT_APP_FLOW_ID}`;

async function getAIResponse(userMessage) {
  try {
    logger.info('Getting AI response for message');
    
    // First, try a test request to verify credentials
    const healthCheck = await axios.get('https://api.langflow.astra.datastax.com/health', {
      headers: {
        'Authorization': `Bearer ${process.env.REACT_APP_APPLICATION_TOKEN}`
      }
    });
    logger.info('Health check response:', healthCheck.status);

    const axiosConfig = {
      method: 'post',
      url: LANGFLOW_API_URL,
      data: {
        input_value: userMessage,
        output_type: "chat",
        input_type: "chat",
        tweaks: {
          "ChatInput-PxWcQ": {},
          "ChatOutput-UkDcW": {},
          "Prompt-n8RMG": {},
          "AstraDB-iO8BQ": {},
          "ParseData-9uxtj": {},
          "File-HUHJb": {},
          "SplitText-1aTn9": {},
          "AstraDB-LyWGE": {},
          "Agent-7Eibw": {}
        }
      },
      headers: {
        'Authorization': `Bearer ${process.env.REACT_APP_APPLICATION_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Origin': 'https://honeyjar-langflow-chat.vercel.app',
        'Referer': 'https://honeyjar-langflow-chat.vercel.app/',
        'Host': 'api.langflow.astra.datastax.com'
      }
    };

    const response = await axios(axiosConfig);
    logger.info('Response status:', response.status);

    if (response.status !== 200) {
      logger.warn('API returned non-200 status:', response.status, response.data);
      throw new Error(`Langflow API error: ${response.status} - ${JSON.stringify(response.data)}`);
    }

    const data = response.data;
    const aiResponse = data.outputs[0].outputs[0].results.message.text;

    if (!aiResponse) {
      logger.error('Invalid Langflow API response format:', data);
      throw new Error('Invalid response format from Langflow API');
    }
    
    logger.info('Successfully got AI response');
    return aiResponse;
  } catch (error) {
    logger.error('Error in getAIResponse:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    throw error;
  }
}

const getThreads = async (req, res) => {
  try {
    const { userId } = req.query;
    logger.info(`Fetching threads for user: ${userId}`);

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const threads = await db.select()
      .from(chatThreads)
      .where(eq(chatThreads.userId, userId))
      .orderBy(desc(chatThreads.createdAt));

    // Get the last message for each thread
    const threadsWithLastMessage = await Promise.all(threads.map(async (thread) => {
      const lastMessage = await db.select()
        .from(chatMessages)
        .where(eq(chatMessages.threadId, thread.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);

      return {
        ...thread,
        lastMessage: lastMessage[0]?.content || '',
        date: lastMessage[0]?.createdAt || thread.createdAt
      };
    }));

    res.json(threadsWithLastMessage);
  } catch (error) {
    logger.error('Error fetching threads:', error);
    res.status(500).json({ error: 'Failed to fetch threads' });
  }
};

const createThread = async (req, res) => {
  try {
    const { userId, title } = req.body;
    logger.info(`Creating new thread for user: ${userId}`);

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const threadId = uuidv4();
    const thread = await db.insert(chatThreads)
      .values({
        id: threadId,
        userId,
        title: title || 'New Chat'
      })
      .returning();

    res.json(thread[0]);
  } catch (error) {
    logger.error('Error creating thread:', error);
    res.status(500).json({ error: 'Failed to create thread' });
  }
};

const getThreadMessages = async (req, res) => {
  try {
    const { userId, threadId } = req.params;
    logger.info(`Fetching messages for thread: ${threadId}`);

    if (!userId || !threadId) {
      return res.status(400).json({ error: 'User ID and Thread ID are required' });
    }

    const messages = await db.select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.userId, userId),
          eq(chatMessages.threadId, threadId)
        )
      )
      .orderBy(chatMessages.createdAt);

    res.json(messages);
  } catch (error) {
    logger.error('Error fetching thread messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { userId, threadId, content } = req.body;
    logger.info(`Sending message in thread: ${threadId}`);

    if (!userId || !threadId || !content) {
      return res.status(400).json({ error: 'User ID, Thread ID, and content are required' });
    }

    // Save user message
    const userMessage = await db.insert(chatMessages)
      .values({
        userId,
        threadId,
        role: 'user',
        content
      })
      .returning();

    // Get AI response
    const aiResponse = await getAIResponse(content);

    // Save AI response
    const assistantMessage = await db.insert(chatMessages)
      .values({
        userId,
        threadId,
        role: 'assistant',
        content: aiResponse
      })
      .returning();

    res.json([userMessage[0], assistantMessage[0]]);
  } catch (error) {
    logger.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

const deleteChatHistory = async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    await db.delete(chatMessages).where(eq(chatMessages.userId, userId));
    
    logger.info('Chat history deleted', { userId });
    res.json({ message: 'Chat history deleted successfully' });
  } catch (error) {
    logger.error('Error deleting chat history:', error);
    res.status(500).json({ error: 'Failed to delete chat history' });
  }
};

export {
  getThreads,
  createThread,
  getThreadMessages,
  sendMessage,
  deleteChatHistory,
  getAIResponse
}; 