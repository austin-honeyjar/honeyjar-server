"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateFile = exports.validateRequest = exports.tableNameSchema = exports.csvUploadSchema = exports.chatMessageSchema = void 0;
const zod_1 = require("zod");
// Chat message validation schema
exports.chatMessageSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    threadId: zod_1.z.string(),
    role: zod_1.z.enum(['user', 'assistant', 'system']),
    content: zod_1.z.string()
});
// CSV upload validation schema for backend
exports.csvUploadSchema = zod_1.z.object({
    file: zod_1.z.any().refine((file) => file !== undefined, {
        message: 'File is required',
        path: ['file'],
    }),
    fileName: zod_1.z.string().min(1, 'File name is required'),
});
// Table name validation schema
exports.tableNameSchema = zod_1.z.object({
    tableName: zod_1.z.string()
        .min(1, 'Table name is required')
        .regex(/^[a-zA-Z0-9_]+$/, 'Table name can only contain letters, numbers, and underscores'),
});
// Validation middleware
const validateRequest = (schema) => async (req, res, next) => {
    try {
        const validatedData = await schema.parseAsync(req.body);
        req.body = validatedData;
        next();
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Validation failed',
                details: error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }))
            });
        }
        next(error);
    }
};
exports.validateRequest = validateRequest;
// File validation middleware
const validateFile = (schema) => async (req, res, next) => {
    try {
        const validatedData = await schema.parseAsync({
            file: req.file,
            fileName: req.file?.originalname
        });
        req.validatedFile = validatedData;
        next();
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'File validation failed',
                details: error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }))
            });
        }
        next(error);
    }
};
exports.validateFile = validateFile;
