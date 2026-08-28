export interface SmsPayload {
  to: string;
  message: string;
}

export class SmsProvider {
  static async sendSms(payload: SmsPayload): Promise<boolean> {
    console.log(`[SMS DISPATCH] To: ${payload.to} | Msg: "${payload.message}"`);
    return true;
  }
}