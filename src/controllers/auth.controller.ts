import { Request, Response } from 'express';
import { authService } from '../services/auth/auth.service';
import { ApiError } from '../utils/error';
import logger from '../utils/logger';

export const authController = {
  async register(req: Request, res: Response) {
    try {
      const { email, password, firstName, lastName } = req.body;
      const user = await authService.register({ email, password, firstName, lastName });
      res.status(201).json(user);
    } catch (error) {
      logger.error('Registration failed', { error });
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Registration failed' });
      }
    }
  },

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const tokens = await authService.login(email, password);
      res.json(tokens);
    } catch (error) {
      logger.error('Login failed', { error });
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Login failed' });
      }
    }
  },

  async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;
      const tokens = await authService.refreshToken(refreshToken);
      res.json(tokens);
    } catch (error) {
      logger.error('Token refresh failed', { error });
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Token refresh failed' });
      }
    }
  },

  async logout(req: Request, res: Response) {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        await authService.logout(token);
      }
      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      logger.error('Logout failed', { error });
      res.status(500).json({ error: 'Logout failed' });
    }
  },

  async verifyEmail(req: Request, res: Response) {
    try {
      const { token } = req.body;
      await authService.verifyEmail(token);
      res.json({ message: 'Email verified successfully' });
    } catch (error) {
      logger.error('Email verification failed', { error });
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Email verification failed' });
      }
    }
  },

  async forgotPassword(req: Request, res: Response) {
    try {
      const { email } = req.body;
      await authService.forgotPassword(email);
      res.json({ message: 'Password reset email sent' });
    } catch (error) {
      logger.error('Password reset request failed', { error });
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Password reset request failed' });
      }
    }
  },

  async resetPassword(req: Request, res: Response) {
    try {
      const { token, password } = req.body;
      await authService.resetPassword(token, password);
      res.json({ message: 'Password reset successful' });
    } catch (error) {
      logger.error('Password reset failed', { error });
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Password reset failed' });
      }
    }
  },

  async changePassword(req: Request, res: Response) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user?.id;
      if (!userId) {
        throw new ApiError(401, 'User not authenticated');
      }
      await authService.changePassword(userId, currentPassword, newPassword);
      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      logger.error('Password change failed', { error });
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Password change failed' });
      }
    }
  },

  async getCurrentUser(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new ApiError(401, 'User not authenticated');
      }
      const user = await authService.getUser(userId);
      res.json(user);
    } catch (error) {
      logger.error('Failed to get current user', { error });
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to get current user' });
      }
    }
  },

  async getUserPermissions(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new ApiError(401, 'User not authenticated');
      }
      const permissions = await authService.getUserPermissions(userId);
      res.json(permissions);
    } catch (error) {
      logger.error('Failed to get user permissions', { error });
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to get user permissions' });
      }
    }
  },

  async getUsersWithPermission(req: Request, res: Response) {
    try {
      const { permission } = req.query;
      if (!permission || typeof permission !== 'string') {
        throw new ApiError(400, 'Permission parameter is required');
      }
      const users = await authService.getUsersWithPermission(permission);
      res.json(users);
    } catch (error) {
      logger.error('Failed to get users with permission', { error });
      if (error instanceof ApiError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to get users with permission' });
      }
    }
  }
}; 