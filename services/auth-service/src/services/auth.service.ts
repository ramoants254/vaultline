import argon2 from 'argon2';
import { db } from '../db/index.js';
import { redis, getBlacklistKey } from '../redis/client.js';

export interface User {
  id: string;
  email: string;
  full_name: string;
  kyc_document_url: string | null;
  created_at: Date;
}

export class AuthService {
  /** Register a new user */
  static async createUser(
    email: string,
    password: string,
    fullName: string
  ): Promise<Omit<User, 'password_hash'>> {
    const passwordHash = await argon2.hash(password);

    const result = await db.query<User>(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, full_name, kyc_document_url, created_at`,
      [email, passwordHash, fullName]
    );

    return result.rows[0];
  }

  /** Validate credentials and return user (throws on failure) */
  static async validateUser(email: string, password: string): Promise<User> {
    const result = await db.query<User & { password_hash: string }>(
      `SELECT id, email, full_name, kyc_document_url, created_at, password_hash
       FROM users WHERE email = $1`,
      [email]
    );

    const user = result.rows[0];
    if (!user) throw new Error('Invalid credentials');

    const valid = await argon2.verify(user.password_hash, password);
    if (!valid) throw new Error('Invalid credentials');

    const { password_hash: _omit, ...safeUser } = user;
    return safeUser as User;
  }

  /** Fetch a user by ID */
  static async getUserById(userId: string): Promise<User | null> {
    const result = await db.query<User>(
      `SELECT id, email, full_name, kyc_document_url, created_at
       FROM users WHERE id = $1`,
      [userId]
    );
    return result.rows[0] ?? null;
  }

  /** Blacklist a refresh token in Redis */
  static async blacklistToken(token: string, ttlSeconds: number): Promise<void> {
    await redis.set(getBlacklistKey(token), '1', 'EX', ttlSeconds);
  }

  /** Check if a refresh token is blacklisted */
  static async isTokenBlacklisted(token: string): Promise<boolean> {
    const val = await redis.get(getBlacklistKey(token));
    return val !== null;
  }

  /** Update KYC document URL for a user */
  static async updateKycDocument(userId: string, documentUrl: string): Promise<User> {
    const result = await db.query<User>(
      `UPDATE users SET kyc_document_url = $1
       WHERE id = $2
       RETURNING id, email, full_name, kyc_document_url, created_at`,
      [documentUrl, userId]
    );

    const user = result.rows[0];
    if (!user) throw new Error('User not found');
    return user;
  }
}
