import { Controller, Post, Body, Headers, BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { DepositDto, TransferDto } from './dto/payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('deposit')
  async deposit(
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Body() dto: DepositDto,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Header X-Idempotency-Key is required');
    }
    return this.paymentsService.processDeposit(dto, idempotencyKey);
  }

  @Post('transfer')
  async transfer(
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Body() dto: TransferDto,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Header X-Idempotency-Key is required');
    }
    return this.paymentsService.processTransfer(dto, idempotencyKey);
  }
}