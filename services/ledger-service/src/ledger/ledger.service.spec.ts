import { Test, TestingModule } from '@nestjs/testing';
import { LedgerService } from './ledger.service';
import { DATABASE_POOL } from '../database/database.provider';
import { BadRequestException } from '@nestjs/common';
import { EntryDirection } from './dto/ledger.dto';

describe('LedgerService Invariants', () => {
  let service: LedgerService;

  const mockPool = {
    connect: jest.fn(),
    query: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerService,
        { provide: DATABASE_POOL, useValue: mockPool },
      ],
    }).compile();

    service = module.get<LedgerService>(LedgerService);
  });

  it('should reject journal entries where Debit != Credit', async () => {
    const invalidEntry = {
      referenceId: 'REF-1001',
      description: 'Mismatched transaction',
      entries: [
        { accountId: 'acc-1', direction: EntryDirection.DEBIT, amount: 100 },
        { accountId: 'acc-2', direction: EntryDirection.CREDIT, amount: 50 }, // Error: 100 != 50
      ],
    };

    await expect(service.postJournalEntry(invalidEntry)).rejects.toThrow(
      BadRequestException
    );
  });
});