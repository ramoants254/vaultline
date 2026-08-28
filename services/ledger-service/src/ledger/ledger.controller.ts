import { Controller, Post, Get, Body, Param, Headers, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { CreateAccountDto, CreateJournalEntryDto } from './dto/ledger.dto';

@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Post('accounts')
  async createAccount(@Body() dto: CreateAccountDto) {
    return this.ledgerService.createAccount(dto);
  }

  @Get('accounts')
  async getAccounts(@Headers('x-user-id') userId?: string) {
    if (!userId) throw new UnauthorizedException('User context is required');
    return this.ledgerService.getAccountsForUser(userId);
  }

  @Get('accounts/:id/balance')
  async getBalance(@Param('id') id: string) {
    return this.ledgerService.getAccountBalance(id);
  }

  @Get('accounts/:id/history')
  async getHistory(@Param('id') id: string) {
    return this.ledgerService.getAccountHistory(id);
  }

  @Post('entries')
  @HttpCode(HttpStatus.CREATED)
  async postEntry(@Body() dto: CreateJournalEntryDto) {
    return this.ledgerService.postJournalEntry(dto);
  }
}