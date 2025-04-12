"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const csvController_js_1 = require("../controllers/csvController.js");
const router = express_1.default.Router();
// Get all CSV tables and their data
router.get('/', csvController_js_1.getAllTables);
// Create a new table and insert CSV data
router.post('/', csvController_js_1.createTable);
// Delete a table and its metadata
router.delete('/', csvController_js_1.deleteTable);
exports.default = router;
