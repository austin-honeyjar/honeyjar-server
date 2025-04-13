import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../server';
import logger from '../utils/logger';

describe('Authentication Flow', () => {
  let validToken: string;
  let invalidToken: string;

  beforeAll(async () => {
    // Create a test session with Clerk
    try {
      // For testing purposes, we'll use a mock token
      // In a real test environment, you would create an actual session
      validToken = 'test_valid_token';
      invalidToken = 'invalid_token';
    } catch (error) {
      logger.error('Failed to setup test tokens:', { error });
      throw error;
    }
  });

  describe('Public Endpoint', () => {
    it('should allow access to public endpoint without authentication', async () => {
      const response = await request(app)
        .get('/api/auth/public')
        .expect(200);

      expect(response.body).toEqual({
        message: 'This is a public endpoint'
      });
    });
  });

  describe('Protected Endpoint', () => {
    it('should deny access to protected endpoint without token', async () => {
      const response = await request(app)
        .get('/api/auth/protected')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should deny access to protected endpoint with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/protected')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should allow access to protected endpoint with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/protected')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.message).toBe('This is a protected endpoint');
      expect(response.body.user).toBeDefined();
      expect(response.body.session).toBeDefined();
    });
  });

  describe('Session Endpoint', () => {
    it('should deny access to session endpoint without token', async () => {
      const response = await request(app)
        .get('/api/auth/session')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return session information with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.userId).toBeDefined();
      expect(response.body.sessionId).toBeDefined();
      expect(response.body.status).toBeDefined();
      expect(response.body.expiresAt).toBeDefined();
      expect(response.body.lastActiveAt).toBeDefined();
    });
  });
}); 