import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { Pool } from 'pg';
import { Inject } from '@nestjs/common';
import { DATABASE_POOL } from '../database/database.provider';

@Controller()
export class HealthController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  @Get('health')
  getHealth() {
    return { status: 'ok', service: 'ledger-service', timestamp: new Date().toISOString() };
  }

  @Get('readiness')
  async getReadiness(@Res() res: Response) {
    try {
      // Check PostgreSQL connection
      await this.pool.query('SELECT 1');
      
      return res.status(HttpStatus.OK).json({
        status: 'ready',
        checks: {
          database: 'UP',
        },
      });
    } catch (err: any) {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        status: 'DOWN',
        checks: {
          database: 'DOWN',
        },
        error: err.message,
      });
    }
  }
}