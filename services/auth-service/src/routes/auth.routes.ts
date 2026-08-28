import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth.service.js';

export async function authRoutes(fastify: FastifyInstance) {
  // POST /auth/register
  fastify.post('/register', async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      fullName: z.string().min(2),
    });

    const body = schema.parse(request.body);
    const user = await AuthService.createUser(body.email, body.password, body.fullName);

    return reply.status(201).send({
      message: 'User registered successfully',
      user,
    });
  });

  // POST /auth/login
  fastify.post('/login', async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string(),
    });

    const body = schema.parse(request.body);
    const user = await AuthService.validateUser(body.email, body.password);

    // Issue JWT Access Token (15 min) & Refresh Token (7 days)
    const accessToken = fastify.jwt.sign(
      { userId: user.id, email: user.email },
      { expiresIn: '15m' }
    );

    const refreshToken = fastify.jwt.sign(
      { userId: user.id, type: 'refresh' },
      { expiresIn: '7d' }
    );

    return reply.send({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user,
    });
  });

  // POST /auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const schema = z.object({ refreshToken: z.string() });
    const { refreshToken } = schema.parse(request.body);

    const isBlacklisted = await AuthService.isTokenBlacklisted(refreshToken);
    if (isBlacklisted) {
      return reply.status(401).send({ error: 'Refresh token has been revoked' });
    }

    try {
      const decoded = fastify.jwt.verify<{ userId: string; type: string }>(refreshToken);
      if (decoded.type !== 'refresh') {
        return reply.status(400).send({ error: 'Invalid token type' });
      }

      const user = await AuthService.getUserById(decoded.userId);
      if (!user) return reply.status(404).send({ error: 'User not found' });

      const newAccessToken = fastify.jwt.sign(
        { userId: user.id, email: user.email },
        { expiresIn: '15m' }
      );

      return reply.send({ accessToken: newAccessToken });
    } catch {
      return reply.status(401).send({ error: 'Invalid or expired refresh token' });
    }
  });

  // POST /auth/logout
  fastify.post('/logout', async (request, reply) => {
    const schema = z.object({ refreshToken: z.string() });
    const { refreshToken } = schema.parse(request.body);

    // Blacklist token in Redis for 7 days (604800 seconds)
    await AuthService.blacklistToken(refreshToken, 604800);

    return reply.send({ message: 'Logged out successfully' });
  });

  // Protected: GET /auth/me
  fastify.get('/me', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const reqUser = request.user as { userId: string };
    const user = await AuthService.getUserById(reqUser.userId);
    return reply.send({ user });
  });

  // Protected: POST /auth/kyc/upload (Hook/Stub)
  fastify.post('/kyc/upload', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const schema = z.object({ documentUrl: z.string().url() });
    const { documentUrl } = schema.parse(request.body);
    const reqUser = request.user as { userId: string };

    const updatedUser = await AuthService.updateKycDocument(reqUser.userId, documentUrl);
    return reply.send({
      message: 'KYC document submitted successfully. Verification pending.',
      user: updatedUser,
    });
  });
}