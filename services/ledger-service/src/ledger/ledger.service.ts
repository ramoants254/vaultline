import { Injectable, Inject, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { randomInt } from 'crypto';
import { DATABASE_POOL } from '../database/database.provider';
import { CreateAccountDto, CreateJournalEntryDto, EntryDirection, AccountType } from './dto/ledger.dto';

@Injectable()
export class LedgerService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async createAccount(dto: CreateAccountDto) {
    const accountNumber = `VL${randomInt(1_000_000_000, 10_000_000_000)}`;

    try {
      const res = await this.pool.query(
        `INSERT INTO accounts (user_id, account_number, type, currency)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [dto.userId || null, accountNumber, dto.type, dto.currency]
      );
      return res.rows[0];
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException(`Account number ${accountNumber} already exists`);
      }
      throw error;
    }
  }

  async getAccountBalance(accountId: string) {
    const res = await this.pool.query(
      `SELECT id, user_id, account_number, type, currency, balance, created_at
       FROM accounts WHERE id = $1`,
      [accountId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    return res.rows[0];
  }

  async getAccountsForUser(userId: string) {
    const res = await this.pool.query(
      `SELECT id, user_id, account_number, type, currency, balance, created_at
       FROM accounts WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows;
  }

  async getAccountHistory(accountId: string) {
    const res = await this.pool.query(
      `SELECT le.id, le.direction, le.amount, le.created_at,
              je.reference_id, je.description
       FROM ledger_entries le
       JOIN journal_entries je ON le.journal_entry_id = je.id
       WHERE le.account_id = $1
       ORDER BY le.created_at DESC`,
      [accountId]
    );
    return res.rows;
  }

  /**
   * Post double-entry transaction using SERIALIZABLE isolation level
   * Guarantees atomic debit = credit invariant and non-negative wallet balances
   */
  async postJournalEntry(dto: CreateJournalEntryDto) {
    // 1. Verify Debit == Credit Invariant
    let totalDebit = 0;
    let totalCredit = 0;

    for (const entry of dto.entries) {
      if (entry.direction === EntryDirection.DEBIT) {
        totalDebit += entry.amount;
      } else {
        totalCredit += entry.amount;
      }
    }

    // Fix floating point precision comparison issues
    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new BadRequestException(
        `Double-entry invariant failed: total DEBIT (${totalDebit}) must equal total CREDIT (${totalCredit})`
      );
    }

    const client: PoolClient = await this.pool.connect();

    try {
      // 2. Start PostgreSQL SERIALIZABLE transaction
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      // Check idempotency reference
      const refCheck = await client.query(
        'SELECT id FROM journal_entries WHERE reference_id = $1',
        [dto.referenceId]
      );
      if (refCheck.rows.length > 0) {
        throw new ConflictException(`Transaction reference ${dto.referenceId} already exists`);
      }

      // Create Journal Entry
      const journalRes = await client.query(
        `INSERT INTO journal_entries (reference_id, description)
         VALUES ($1, $2) RETURNING id, reference_id, created_at`,
        [dto.referenceId, dto.description]
      );
      const journalId = journalRes.rows[0].id;

      // 3. Process each entry line & update cached balances
      for (const entry of dto.entries) {
        // Fetch and lock account
        const accRes = await client.query('SELECT * FROM accounts WHERE id = $1 FOR UPDATE', [
          entry.accountId,
        ]);
        if (accRes.rows.length === 0) {
          throw new NotFoundException(`Account ${entry.accountId} not found`);
        }
        const account = accRes.rows[0];

        // Insert ledger entry line
        await client.query(
          `INSERT INTO ledger_entries (journal_entry_id, account_id, direction, amount)
           VALUES ($1, $2, $3, $4)`,
          [journalId, entry.accountId, entry.direction, entry.amount]
        );

        // Calculate balance delta based on accounting equations
        // Liability/Revenue: +CREDIT, -DEBIT
        // Asset/Expense/Equity: +DEBIT, -CREDIT
        let balanceChange = 0;
        if (account.type === AccountType.LIABILITY || account.type === AccountType.REVENUE) {
          balanceChange = entry.direction === EntryDirection.CREDIT ? entry.amount : -entry.amount;
        } else {
          balanceChange = entry.direction === EntryDirection.DEBIT ? entry.amount : -entry.amount;
        }

        // Apply updated balance
        await client.query(
          `UPDATE accounts SET balance = balance + $1 WHERE id = $2`,
          [balanceChange, entry.accountId]
        );
      }

      await client.query('COMMIT');
      return {
        success: true,
        journalEntryId: journalId,
        referenceId: dto.referenceId,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23514'
      ) {
        // Postgres check constraint violation (check_non_negative_balance)
        throw new BadRequestException('Insufficient funds: operation would result in negative balance');
      }
      throw error;
    } finally {
      client.release();
    }
  }
}