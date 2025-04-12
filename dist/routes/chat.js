"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const chatController_js_1 = require("../controllers/chatController.js");
const router = express_1.default.Router();
// Save a chat message
router.post('/', async (req, res) => {
    try {
        const { userId, role, content } = req.body;
        if (!userId || !role || !content) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const message = await (0, chatController_js_1.saveMessage)(userId, role, content);
        res.json(message);
    }
    catch (error) {
        console.error('Error in chat route:', error);
        res.status(500).json({ error: error.message });
    }
});
// Get messages for a user
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const messages = await (0, chatController_js_1.getMessages)(userId);
        res.json(messages);
    }
    catch (error) {
        console.error('Error in chat route:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
