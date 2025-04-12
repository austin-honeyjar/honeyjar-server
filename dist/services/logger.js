"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stream = exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const fs_1 = __importDefault(require("fs"));
const __filename = (0, url_1.fileURLToPath)(import.meta.url);
const __dirname = path_1.default.dirname(__filename);
// Ensure logs directory exists
const logsDir = path_1.default.join(__dirname, '../../logs');
if (!fs_1.default.existsSync(logsDir)) {
    fs_1.default.mkdirSync(logsDir);
}
// Create the logger instance with simpler configuration
const logger = (0, pino_1.default)({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
        },
    },
});
exports.logger = logger;
// Create a stream object for Morgan integration
const stream = {
    write: (message) => {
        logger.info({ type: 'http' }, message.trim());
    },
};
exports.stream = stream;
