import { z } from 'zod';

// Chat message validation schema
export const chatMessageSchema = z.object({
  userId: z.string(),
  threadId: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string()
});

// CSV upload validation schema for backend
export const csvUploadSchema = z.object({
  file: z.any().refine((file) => file !== undefined, {
    message: 'File is required',
    path: ['file'],
  }),
  fileName: z.string().min(1, 'File name is required'),
});

// Table name validation schema
export const tableNameSchema = z.object({
  tableName: z.string()
    .min(1, 'Table name is required')
    .regex(/^[a-zA-Z0-9_]+$/, 'Table name can only contain letters, numbers, and underscores'),
});

// Validation middleware
export const validateRequest = (schema) => async (req, res, next) => {
  try {
    const validatedData = await schema.parseAsync(req.body);
    req.body = validatedData;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
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

// File validation middleware
export const validateFile = (schema) => async (req, res, next) => {
  try {
    const validatedData = await schema.parseAsync({
      file: req.file,
      fileName: req.file?.originalname
    });
    req.validatedFile = validatedData;
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
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