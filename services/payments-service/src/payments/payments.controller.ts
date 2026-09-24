import { Controller, Post, Body, Headers, BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { DepositDto, TransferDto } from './dto/payment.dto';
import { MpesaDepositDto, MpesaWithdrawalDto } from '../mpesa/dto/mpesa.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ─── Existing Card/Stripe Deposit ──────────────────────────────────────────

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

  // ─── M-Pesa STK Push Deposit ───────────────────────────────────────────────

  /**
   * Initiates an M-Pesa STK Push on the customer's phone.
   * Returns immediately with checkoutRequestId — the actual completion
   * is confirmed via Safaricom's async callback to /payments/mpesa/stk-callback.
   *
   * Requires header: X-Idempotency-Key
   */
  @Post('mpesa/deposit')
  async mpesaDeposit(
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Body() dto: MpesaDepositDto,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Header X-Idempotency-Key is required');
    }
    return this.paymentsService.initiateMpesaDeposit(dto, idempotencyKey);
  }

  // ─── M-Pesa B2C Withdrawal ─────────────────────────────────────────────────

  /**
   * Initiates an M-Pesa B2C payout (Vaultline → customer M-Pesa wallet).
   * Returns immediately — confirmed asynchronously via /payments/mpesa/b2c-result.
   *
   * Requires header: X-Idempotency-Key
   */
  @Post('mpesa/withdraw')
  async mpesaWithdraw(
    @Headers('x-idempotency-key') idempotencyKey: string,
    @Body() dto: MpesaWithdrawalDto,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Header X-Idempotency-Key is required');
    }
    return this.paymentsService.initiateMpesaWithdrawal(dto, idempotencyKey);
  }
}