"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteChatHistory = exports.sendMessage = exports.getThreadMessages = exports.createThread = exports.getThreads = void 0;
exports.getAIResponse = getAIResponse;
const index_js_1 = require("../db/index.js");
const schema_js_1 = require("../db/schema.js");
const drizzle_orm_1 = require("drizzle-orm");
const logger_js_1 = require("../services/logger.js");
const validation_js_1 = require("../services/validation.js");
const axios_1 = __importDefault(require("axios"));
const uuid_1 = require("uuid");
const LANGFLOW_API_URL = `https://api.langflow.astra.datastax.com/lf/${process.env.REACT_APP_LANGFLOW_ID}/api/v1/run/${process.env.REACT_APP_FLOW_ID}`;
async function getAIResponse(userMessage) {
    try {
        logger_js_1.logger.info('Getting AI response for message');
        // First, try a test request to verify credentials
        const healthCheck = await axios_1.default.get('https://api.langflow.astra.datastax.com/health', {
            headers: {
                'Authorization': `Bearer ${process.env.REACT_APP_APPLICATION_TOKEN}`
            }
        });
        logger_js_1.logger.info('Health check response:', healthCheck.status);
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
        const response = await (0, axios_1.default)(axiosConfig);
        logger_js_1.logger.info('Response status:', response.status);
        if (response.status !== 200) {
            logger_js_1.logger.warn('API returned non-200 status:', response.status, response.data);
            throw new Error(`Langflow API error: ${response.status} - ${JSON.stringify(response.data)}`);
        }
        const data = response.data;
        const aiResponse = data.outputs[0].outputs[0].results.message.text;
        if (!aiResponse) {
            logger_js_1.logger.error('Invalid Langflow API response format:', data);
            throw new Error('Invalid response format from Langflow API');
        }
        logger_js_1.logger.info('Successfully got AI response');
        return aiResponse;
    }
    catch (error) {
        logger_js_1.logger.error('Error in getAIResponse:', {
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
        logger_js_1.logger.info(`Fetching threads for user: ${userId}`);
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        const threads = await index_js_1.db.select()
            .from(schema_js_1.chatThreads)
            .where((0, drizzle_orm_1.eq)(schema_js_1.chatThreads.userId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema_js_1.chatThreads.createdAt));
        // Get the last message for each thread
        const threadsWithLastMessage = await Promise.all(threads.map(async (thread) => {
            const lastMessage = await index_js_1.db.select()
                .from(schema_js_1.chatMessages)
                .where((0, drizzle_orm_1.eq)(schema_js_1.chatMessages.threadId, thread.id))
                .orderBy((0, drizzle_orm_1.desc)(schema_js_1.chatMessages.createdAt))
                .limit(1);
            return {
                ...thread,
                lastMessage: lastMessage[0]?.content || '',
                date: lastMessage[0]?.createdAt || thread.createdAt
            };
        }));
        res.json(threadsWithLastMessage);
    }
    catch (error) {
        logger_js_1.logger.error('Error fetching threads:', error);
        res.status(500).json({ error: 'Failed to fetch threads' });
    }
};
exports.getThreads = getThreads;
const createThread = async (req, res) => {
    try {
        const { userId, title } = req.body;
        logger_js_1.logger.info(`Creating new thread for user: ${userId}`);
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        const threadId = (0, uuid_1.v4)();
        const thread = await index_js_1.db.insert(schema_js_1.chatThreads)
            .values({
            id: threadId,
            userId,
            title: title || 'New Chat'
        })
            .returning();
        res.json(thread[0]);
    }
    catch (error) {
        logger_js_1.logger.error('Error creating thread:', error);
        res.status(500).json({ error: 'Failed to create thread' });
    }
};
exports.createThread = createThread;
const getThreadMessages = async (req, res) => {
    try {
        const { userId, threadId } = req.params;
        logger_js_1.logger.info(`Fetching messages for thread: ${threadId}`);
        if (!userId || !threadId) {
            return res.status(400).json({ error: 'User ID and Thread ID are required' });
        }
        const messages = await index_js_1.db.select()
            .from(schema_js_1.chatMessages)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_js_1.chatMessages.userId, userId), (0, drizzle_orm_1.eq)(schema_js_1.chatMessages.threadId, threadId)))
            .orderBy(schema_js_1.chatMessages.createdAt);
        res.json(messages);
    }
    catch (error) {
        logger_js_1.logger.error('Error fetching thread messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
};
exports.getThreadMessages = getThreadMessages;
const sendMessage = async (req, res) => {
    try {
        const { userId, threadId, content } = req.body;
        logger_js_1.logger.info(`Sending message in thread: ${threadId}`);
        if (!userId || !threadId || !content) {
            return res.status(400).json({ error: 'User ID, Thread ID, and content are required' });
        }
        // Save user message
        const userMessage = await index_js_1.db.insert(schema_js_1.chatMessages)
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
        const assistantMessage = await index_js_1.db.insert(schema_js_1.chatMessages)
            .values({
            userId,
            threadId,
            role: 'assistant',
            content: aiResponse
        })
            .returning();
        res.json([userMessage[0], assistantMessage[0]]);
    }
    catch (error) {
        logger_js_1.logger.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
};
exports.sendMessage = sendMessage;
const deleteChatHistory = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        await index_js_1.db.delete(schema_js_1.chatMessages).where((0, drizzle_orm_1.eq)(schema_js_1.chatMessages.userId, userId));
        logger_js_1.logger.info('Chat history deleted', { userId });
        res.json({ message: 'Chat history deleted successfully' });
    }
    catch (error) {
        logger_js_1.logger.error('Error deleting chat history:', error);
        res.status(500).json({ error: 'Failed to delete chat history' });
    }
};
exports.deleteChatHistory = deleteChatHistory;
