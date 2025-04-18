import { z } from 'zod';

// Base user schema
const baseUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Register schema
export const registerSchema = baseUserSchema.extend({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

// Login schema
export const loginSchema = baseUserSchema;

// Refresh token schema
export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

// Change password schema
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});

// Reset password schema
export const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

// Verify email schema
export const verifyEmailSchema = z.object({
  token: z.string(),
}); 