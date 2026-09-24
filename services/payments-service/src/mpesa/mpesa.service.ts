import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import axios from 'axios';
import Redis from 'ioredis';
import { getMpesaConfig, MpesaConfig } from './mpesa.config';

export interface StkPushResult {
  success: boolean;
  checkoutRequestId?: string;
  merchantRequestId?: string;
  errorMessage?: string;
  rawResponse?: any;
}

export interface B2CPayoutResult {
  success: boolean;
  conversationId?: string;
  originatorConversationId?: string;
  errorMessage?: string;
  rawResponse?: any;
}

@Injectable()
export class MpesaService implements OnModuleInit {
  private readonly logger = new Logger(MpesaService.name);
  private config: MpesaConfig;
  private redis: Redis;

  // Redis key for caching the OAuth access token
  private readonly TOKEN_CACHE_KEY = 'mpesa:access_token';
  // Token TTL is 3600s from Safaricom; we cache for 3300s to account for clock skew
  private readonly TOKEN_TTL_SECONDS = 3300;

  onModuleInit() {
    this.config = getMpesaConfig();
    const redisUrl =
      process.env.REDIS_URL ||
      (process.env.REDIS_HOST
        ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`
        : 'redis://localhost:6379');
    this.redis = new Redis(redisUrl);
    this.logger.log(`[MpesaService] Initialized (${this.config.environment})`);
  }

  // ─── OAuth Token ───────────────────────────────────────────────────────────

  /**
   * Fetches a Daraja OAuth2 access token.
   * Caches the token in Redis for 55 minutes to avoid re-authenticating
   * on every API call (Safaricom tokens last 60 minutes).
   */
  async getAccessToken(): Promise<string> {
    // 1. Try cache first
    const cached = await this.redis.get(this.TOKEN_CACHE_KEY);
    if (cached) {
      return cached;
    }

    // 2. Fetch fresh token from Daraja
    const credentials = Buffer.from(
      `${this.config.consumerKey}:${this.config.consumerSecret}`,
    ).toString('base64');

    try {
      const response = await axios.get(this.config.authUrl, {
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      });

      const token: string = response.data.access_token;

      // 3. Cache in Redis
      await this.redis.set(this.TOKEN_CACHE_KEY, token, 'EX', this.TOKEN_TTL_SECONDS);
      this.logger.log('[MpesaService] Fresh access token obtained and cached in Redis');

      return token;
    } catch (error: any) {
      const msg = error?.response?.data || error.message;
      this.logger.error('[MpesaService] Failed to fetch access token:', msg);
      throw new Error(`M-Pesa auth failed: ${JSON.stringify(msg)}`);
    }
  }

  // ─── STK Push (Customer Deposit) ───────────────────────────────────────────

  /**
   * Triggers an M-Pesa STK Push (USSD prompt) on the customer's phone.
   * The transaction result is delivered asynchronously via the callback URL.
   *
   * @param phoneNumber  - Customer's phone in format 2547XXXXXXXX
   * @param amount       - Amount in KES (whole numbers only; min 1)
   * @param accountRef   - Short label shown to customer (e.g. "VaultlineDeposit")
   * @param idempotencyKey - Mapped to the payment reference
   */
  async stkPush(
    phoneNumber: string,
    amount: number,
    accountRef: string,
    idempotencyKey: string,
  ): Promise<StkPushResult> {
    const token = await this.getAccessToken();
    const timestamp = this.getTimestamp();
    const password = this.generatePassword(timestamp);

    const callbackUrl = `${this.config.callbackBaseUrl}/api/v1/payments/mpesa/stk-callback`;

    const payload = {
      BusinessShortCode: this.config.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount), // M-Pesa requires integers
      PartyA: phoneNumber,
      PartyB: this.config.shortcode,
      PhoneNumber: phoneNumber,
      CallBackURL: callbackUrl,
      AccountReference: accountRef.substring(0, 20), // Max 20 chars
      TransactionDesc: `Vaultline deposit ref:${idempotencyKey}`.substring(0, 30),
    };

    try {
      const response = await axios.post(this.config.stkPushUrl, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = response.data;
      // ResponseCode "0" means request accepted
      if (data.ResponseCode === '0') {
        this.logger.log(
          `[MpesaService] STK Push sent — CheckoutRequestID: ${data.CheckoutRequestID}`,
        );
        return {
          success: true,
          checkoutRequestId: data.CheckoutRequestID,
          merchantRequestId: data.MerchantRequestID,
          rawResponse: data,
        };
      }

      return {
        success: false,
        errorMessage: data.ResponseDescription || 'STK Push rejected by Safaricom',
        rawResponse: data,
      };
    } catch (error: any) {
      const msg = error?.response?.data || error.message;
      this.logger.error('[MpesaService] STK Push failed:', msg);
      return {
        success: false,
        errorMessage: `STK Push error: ${JSON.stringify(msg)}`,
      };
    }
  }

  // ─── B2C Payout (Business to Customer Withdrawal) ──────────────────────────

  /**
   * Sends money from the Vaultline business shortcode to a customer's M-Pesa wallet.
   * Result is delivered asynchronously via the result/timeout callback URLs.
   *
   * @param phoneNumber  - Customer's phone in format 2547XXXXXXXX
   * @param amount       - Amount in KES
   * @param remarks      - Short description (max 100 chars)
   */
  async b2cPayout(
    phoneNumber: string,
    amount: number,
    remarks: string,
  ): Promise<B2CPayoutResult> {
    const token = await this.getAccessToken();

    const resultUrl = `${this.config.callbackBaseUrl}/api/v1/payments/mpesa/b2c-result`;
    const timeoutUrl = `${this.config.callbackBaseUrl}/api/v1/payments/mpesa/b2c-timeout`;

    const payload = {
      InitiatorName: process.env.MPESA_INITIATOR_NAME || 'testapi',
      SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL || '',
      CommandID: 'BusinessPayment',
      Amount: Math.round(amount),
      PartyA: this.config.shortcode,
      PartyB: phoneNumber,
      Remarks: remarks.substring(0, 100),
      QueueTimeOutURL: timeoutUrl,
      ResultURL: resultUrl,
      Occasion: 'VaultlineWithdrawal',
    };

    try {
      const response = await axios.post(this.config.b2cUrl, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = response.data;
      if (data.ResponseCode === '0') {
        this.logger.log(
          `[MpesaService] B2C Payout queued — ConversationID: ${data.ConversationID}`,
        );
        return {
          success: true,
          conversationId: data.ConversationID,
          originatorConversationId: data.OriginatorConversationID,
          rawResponse: data,
        };
      }

      return {
        success: false,
        errorMessage: data.ResponseDescription || 'B2C Payout rejected by Safaricom',
        rawResponse: data,
      };
    } catch (error: any) {
      const msg = error?.response?.data || error.message;
      this.logger.error('[MpesaService] B2C Payout failed:', msg);
      return {
        success: false,
        errorMessage: `B2C error: ${JSON.stringify(msg)}`,
      };
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Daraja timestamp format: YYYYMMDDHHmmss */
  private getTimestamp(): string {
    return new Date()
      .toISOString()
      .replace(/[-T:.Z]/g, '')
      .substring(0, 14);
  }

  /**
   * Daraja STK password = Base64(Shortcode + Passkey + Timestamp)
   */
  private generatePassword(timestamp: string): string {
    return Buffer.from(
      `${this.config.shortcode}${this.config.passkey}${timestamp}`,
    ).toString('base64');
  }
}
