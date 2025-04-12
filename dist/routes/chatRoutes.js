"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const chatController_js_1 = require("../controllers/chatController.js");
const logger_js_1 = require("../services/logger.js");
const router = express_1.default.Router();
// Log all requests
router.use((req, res, next) => {
    logger_js_1.logger.info(`${req.method} ${req.url}`);
    next();
});
// Get all threads for a user
router.get('/threads', chatController_js_1.getThreads);
// Create a new thread
router.post('/threads', chatController_js_1.createThread);
// Get messages for a specific thread
router.get('/threads/:userId/:threadId/messages', chatController_js_1.getThreadMessages);
// Send a message in a thread
router.post('/threads/:userId/:threadId/messages', chatController_js_1.sendMessage);
// Delete all chat history for a user
router.delete('/history', chatController_js_1.deleteChatHistory);
exports.default = router;
