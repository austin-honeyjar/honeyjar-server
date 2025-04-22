import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors/appError';
import logger from '../utils/logger';

export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new ForbiddenError('User not authenticated');
      }

      if (!req.user.permissions.includes(permission)) {
        logger.warn('Permission denied:', {
          userId: req.user.id,
          requiredPermission: permission,
          userPermissions: req.user.permissions
        });
        throw new ForbiddenError(`Permission '${permission}' required`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}; 