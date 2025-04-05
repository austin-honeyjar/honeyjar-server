"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const csvController_js_1 = require("../controllers/csvController.js");
const validation_js_1 = require("../services/validation.js");
const validation_js_2 = require("../services/validation.js");
const logger_js_1 = require("../services/logger.js");
const router = express_1.default.Router();
const upload = (0, multer_1.default)({ dest: 'uploads/' });
// Apply logging middleware to all routes
router.use((req, res, next) => {
    logger_js_1.logger.info({
        method: req.method,
        url: req.url,
        params: req.params,
        query: req.query,
        ip: req.ip,
        userAgent: req.get('user-agent')
    }, 'Incoming request');
    next();
});
// Get all tables
router.get('/', csvController_js_1.getAllTables);
// Create a new table from CSV
router.post('/upload', upload.single('file'), (0, validation_js_1.validateFile)(validation_js_2.csvUploadSchema), csvController_js_1.createTable);
// Delete a table
router.delete('/:tableName', (0, validation_js_1.validateRequest)(validation_js_2.tableNameSchema), csvController_js_1.deleteTable);
exports.default = router;
