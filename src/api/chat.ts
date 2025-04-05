import { Request, Response } from 'express';
import axios, { AxiosRequestConfig, AxiosError } from 'axios';
import { db } from '../db';
import { chats } from '../db/schema';
import { v4 as uuidv4 } from 'uuid';
import { eq, desc, asc } from 'drizzle-orm';

interface ChatRequest extends Request {
  body: {
    input_value: string;
    output_type: string;
    input_type: string;
  }
}

interface Thread {
  id: string;
  title: string;
  createdAt: string;
}

interface Message {
  id: string;
  threadId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export const chatHandler = async (req: ChatRequest, res: Response): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Health check first
    const testResponse = await axios.get(
      `https://api.langflow.astra.datastax.com/health`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.REACT_APP_APPLICATION_TOKEN}`
        }
      }
    );
    console.log('Health check response:', testResponse.status);

    const apiUrl = `https://api.langflow.astra.datastax.com/lf/${process.env.REACT_APP_LANGFLOW_ID}/api/v1/run/${process.env.REACT_APP_FLOW_ID}`;
    
    const axiosConfig: AxiosRequestConfig = {
      method: 'post',
      url: apiUrl,
      data: req.body,
      headers: {
        'Authorization': `Bearer ${process.env.REACT_APP_APPLICATION_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Origin': req.headers.origin || 'http://localhost:3000',
        'Referer': req.headers.referer || 'http://localhost:3000/',
        'Host': 'api.langflow.astra.datastax.com'
      },
      validateStatus: (status: number) => status < 500
    };

    console.log('Making request with config:', {
      url: apiUrl,
      method: 'POST',
      headers: {
        ...axiosConfig.headers,
        'Authorization': 'Bearer [HIDDEN]'
      }
    });

    const response = await axios(axiosConfig);
    
    if (response.status !== 200) {
      console.warn('API returned non-200 status:', response.status, response.data);
    }

    return res.status(response.status).json(response.data);

  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('API Error:', {
      message: axiosError.message,
      status: axiosError.response?.status,
      data: axiosError.response?.data,
      config: {
        url: axiosError.config?.url,
        method: axiosError.config?.method,
        headers: {
          ...axiosError.config?.headers,
          Authorization: 'Bearer [HIDDEN]'
        }
      }
    });

    return res.status(axiosError.response?.status || 500).json({
      error: 'API request failed',
      message: axiosError.message,
      details: axiosError.response?.data || 'No additional details available'
    });
  }
};

export const getThreads = async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const threads = await db
      .select()
      .from(chats)
      .where(eq(chats.userId, userId as string))
      .groupBy(chats.threadId)
      .orderBy(desc(chats.createdAt));

    return res.json(threads);
  } catch (error) {
    console.error('Error getting threads:', error);
    return res.status(500).json({ error: 'Failed to get threads' });
  }
};

export const createThread = async (req: Request, res: Response) => {
  try {
    const { userId, title = 'New Chat' } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const threadId = uuidv4();

    await db.insert(chats).values({
      id: uuidv4(),
      threadId,
      userId,
      role: 'system',
      content: 'New chat started'
    });

    return res.json({
      id: threadId,
      title,
      createdAt: new Date()
    });
  } catch (error) {
    console.error('Error creating thread:', error);
    return res.status(500).json({ error: 'Failed to create thread' });
  }
};

export const getMessages = async (req: Request, res: Response) => {
  try {
    const { threadId } = req.params;
    if (!threadId) {
      return res.status(400).json({ error: 'threadId is required' });
    }

    const messages = await db
      .select()
      .from(chats)
      .where(eq(chats.threadId, threadId))
      .orderBy(asc(chats.createdAt));

    return res.json(messages);
  } catch (error) {
    console.error('Error getting messages:', error);
    return res.status(500).json({ error: 'Failed to get messages' });
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { threadId, userId, content } = req.body;
    if (!threadId || !userId || !content) {
      return res.status(400).json({ error: 'threadId, userId, and content are required' });
    }

    // Store user message
    await db.insert(chats).values({
      id: uuidv4(),
      threadId,
      userId,
      role: 'user',
      content
    });

    // Generate and store bot response
    const botResponse = 'This is a test response. The actual AI integration will be implemented later.';
    await db.insert(chats).values({
      id: uuidv4(),
      threadId,
      userId,
      role: 'assistant',
      content: botResponse
    });

    return res.json({ message: botResponse });
  } catch (error) {
    console.error('Error sending message:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
}; 