"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const chatRoutes_js_1 = __importDefault(require("./routes/chatRoutes.js"));
const csvController_js_1 = require("./controllers/csvController.js");
const index_js_1 = require("./db/index.js");
dotenv_1.default.config();
const app = (0, express_1.default)();
// CORS configuration
const isDevelopment = process.env.NODE_ENV !== 'production';
const corsOptions = {
    origin: isDevelopment ? ['http://localhost:3000', 'http://localhost:3004'] : '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: isDevelopment
};
// Middleware
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
app.use(express_1.default.static(path_1.default.join(process.cwd(), 'public')));
// Routes
app.use('/api/chat', chatRoutes_js_1.default);
// CSV endpoints
app.get('/api/csv', csvController_js_1.getAllTables);
app.post('/api/csv', csvController_js_1.createTable);
const PORT = process.env.PORT || (isDevelopment ? 3001 : 3000);
// Start server after ensuring database tables exist
(0, index_js_1.ensureTables)()
    .then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log('Environment:', {
            nodeEnv: process.env.NODE_ENV,
            isDevelopment
        });
    });
})
    .catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
