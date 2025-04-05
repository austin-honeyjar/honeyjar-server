"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = exports.getMessages = exports.createThread = exports.getThreads = exports.chatHandler = void 0;
const axios_1 = __importDefault(require("axios"));
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const uuid_1 = require("uuid");
const drizzle_orm_1 = require("drizzle-orm");
const chatHandler = async (req, res) => {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    try {
        // Health check first
        const testResponse = await axios_1.default.get(`https://api.langflow.astra.datastax.com/health`, {
            headers: {
                'Authorization': `Bearer ${process.env.REACT_APP_APPLICATION_TOKEN}`
            }
        });
        console.log('Health check response:', testResponse.status);
        const apiUrl = `https://api.langflow.astra.datastax.com/lf/${process.env.REACT_APP_LANGFLOW_ID}/api/v1/run/${process.env.REACT_APP_FLOW_ID}`;
        const axiosConfig = {
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
            validateStatus: (status) => status < 500
        };
        console.log('Making request with config:', {
            url: apiUrl,
            method: 'POST',
            headers: {
                ...axiosConfig.headers,
                'Authorization': 'Bearer [HIDDEN]'
            }
        });
        const response = await (0, axios_1.default)(axiosConfig);
        if (response.status !== 200) {
            console.warn('API returned non-200 status:', response.status, response.data);
        }
        return res.status(response.status).json(response.data);
    }
    catch (error) {
        const axiosError = error;
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
exports.chatHandler = chatHandler;
const getThreads = async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }
        const threads = await db_1.db
            .select()
            .from(schema_1.chats)
            .where((0, drizzle_orm_1.eq)(schema_1.chats.userId, userId))
            .groupBy(schema_1.chats.threadId)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.chats.createdAt));
        return res.json(threads);
    }
    catch (error) {
        console.error('Error getting threads:', error);
        return res.status(500).json({ error: 'Failed to get threads' });
    }
};
exports.getThreads = getThreads;
const createThread = async (req, res) => {
    try {
        const { userId, title = 'New Chat' } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }
        const threadId = (0, uuid_1.v4)();
        await db_1.db.insert(schema_1.chats).values({
            id: (0, uuid_1.v4)(),
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
    }
    catch (error) {
        console.error('Error creating thread:', error);
        return res.status(500).json({ error: 'Failed to create thread' });
    }
};
exports.createThread = createThread;
const getMessages = async (req, res) => {
    try {
        const { threadId } = req.params;
        if (!threadId) {
            return res.status(400).json({ error: 'threadId is required' });
        }
        const messages = await db_1.db
            .select()
            .from(schema_1.chats)
            .where((0, drizzle_orm_1.eq)(schema_1.chats.threadId, threadId))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.chats.createdAt));
        return res.json(messages);
    }
    catch (error) {
        console.error('Error getting messages:', error);
        return res.status(500).json({ error: 'Failed to get messages' });
    }
};
exports.getMessages = getMessages;
const sendMessage = async (req, res) => {
    try {
        const { threadId, userId, content } = req.body;
        if (!threadId || !userId || !content) {
            return res.status(400).json({ error: 'threadId, userId, and content are required' });
        }
        // Store user message
        await db_1.db.insert(schema_1.chats).values({
            id: (0, uuid_1.v4)(),
            threadId,
            userId,
            role: 'user',
            content
        });
        // Generate and store bot response
        const botResponse = 'This is a test response. The actual AI integration will be implemented later.';
        await db_1.db.insert(schema_1.chats).values({
            id: (0, uuid_1.v4)(),
            threadId,
            userId,
            role: 'assistant',
            content: botResponse
        });
        return res.json({ message: botResponse });
    }
    catch (error) {
        console.error('Error sending message:', error);
        return res.status(500).json({ error: 'Failed to send message' });
    }
};
exports.sendMessage = sendMessage;
