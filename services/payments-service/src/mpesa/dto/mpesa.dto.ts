import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * DTO for initiating an M-Pesa STK Push deposit.
 * The transaction is async — the response only confirms the push was sent.
 * The actual completion/failure is communicated via the callback URL.
 */
export class MpesaDepositDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  clearingAccountId: string;

  @IsUUID()
  userWalletAccountId: string;

  /**
   * Customer's Safaricom phone number.
   * Format: 2547XXXXXXXX (international format without +)
   * e.g. 254708374149
   */
  @IsString()
  @IsNotEmpty()
  @Matches(/^2547\d{8}$/, {
    message: 'phoneNumber must be in format 2547XXXXXXXX (Safaricom Kenya number)',
  })
  phoneNumber: string;

  /**
   * Amount in Kenyan Shillings (KES). M-Pesa only accepts whole numbers.
   * Safaricom sandbox minimum: KES 1, maximum: KES 150,000
   */
  @IsNumber()
  @IsPositive()
  @Min(1)
  @Max(150000)
  amount: number;
}

/**
 * DTO for initiating an M-Pesa B2C withdrawal (business pays customer).
 */
export class MpesaWithdrawalDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  userWalletAccountId: string;

  /**
   * Customer's Safaricom phone number in format 2547XXXXXXXX
   */
  @IsString()
  @IsNotEmpty()
  @Matches(/^2547\d{8}$/, {
    message: 'phoneNumber must be in format 2547XXXXXXXX (Safaricom Kenya number)',
  })
  phoneNumber: string;

  /**
   * Amount in KES. Minimum KES 10 for B2C.
   */
  @IsNumber()
  @IsPositive()
  @Min(10)
  @Max(150000)
  amount: number;

  /**
   * Short description shown on the transaction (max 100 chars).
   */
  @IsString()
  @IsNotEmpty()
  remarks: string;
}
