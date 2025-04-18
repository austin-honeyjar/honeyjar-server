import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { ForbiddenError } from '../errors/appError';
import logger from '../utils/logger';

export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        throw new ForbiddenError('User not authenticated');
      }

      const authService = AuthService.getInstance();
      await authService.verifyPermission(req.user.id, permission);

      logger.info(`User ${req.user.id} accessed ${permission} with permission`);
      next();
    } catch (error) {
      next(error);
    }
  };
}; 