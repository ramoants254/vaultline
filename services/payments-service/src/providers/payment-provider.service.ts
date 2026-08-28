import { Injectable, Logger } from '@nestjs/common';

export interface PaymentProcessResult {
  success: boolean;
  transactionId: string;
  errorMessage?: string;
}

@Injectable()
export class PaymentProviderService {
  private readonly logger = new Logger(PaymentProviderService.name);

  async processExternalDeposit(amount: number, currency: string, paymentMethodToken: string): Promise<PaymentProcessResult> {
    this.logger.log(`Processing charge via Stripe/Payment Gateway: ${amount} ${currency}`);

    // Standard payment gateway simulation/integration rule
    // Fail charges if token is explicitly 'tok_fail'
    if (paymentMethodToken === 'tok_fail') {
      return {
        success: false,
        transactionId: `tx_failed_${Date.now()}`,
        errorMessage: 'Card declined / payment gateway authorization failed',
      };
    }

    return {
      success: true,
      transactionId: `tx_stripe_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    };
  }
}