import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { BadRequestError } from '../errors/appError';

export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate both body and params
      const data = {
        body: req.body,
        params: req.params,
        query: req.query
      };
      await schema.parseAsync(data);
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