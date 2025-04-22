import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { BadRequestError } from '../errors/appError';

export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Only validate the request body
      await schema.parseAsync(req.body);
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }));
        const errorMessage = details.map(d => `${d.path}: ${d.message}`).join(', ');
        return next(new BadRequestError(`Validation failed: ${errorMessage}`));
      }
      return next(error);
    }
  };
}; 