import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

export enum EntryDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export class CreateAccountDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsEnum(AccountType)
  type: AccountType;

  @IsString()
  currency: string = 'USD';
}

export class LedgerEntryLineDto {
  @IsUUID()
  accountId: string;

  @IsEnum(EntryDirection)
  direction: EntryDirection;

  @IsNumber()
  @IsPositive()
  amount: number;
}

export class CreateJournalEntryDto {
  @IsString()
  @IsNotEmpty()
  referenceId: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => LedgerEntryLineDto)
  entries: LedgerEntryLineDto[];
}