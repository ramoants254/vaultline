import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class DepositDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  clearingAccountId: string;

  @IsUUID()
  userWalletAccountId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  currency: string = 'USD';

  @IsString()
  @IsNotEmpty()
  paymentMethodToken: string;
}

export class TransferDto {
  @IsUUID()
  senderWalletAccountId: string;

  @IsUUID()
  recipientWalletAccountId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  currency: string = 'USD';
}