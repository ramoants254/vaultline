export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
}

export class EmailProvider {
  static async sendEmail(payload: EmailPayload): Promise<boolean> {
    // In production, nodemailer or SendGrid SDK transmits the email.
    console.log('\n==================================================');
    console.log(`[EMAIL DISPATCH] To: ${payload.to}`);
    console.log(`[Subject]: ${payload.subject}`);
    console.log(`[Body]:\n${payload.body}`);
    console.log('==================================================\n');
    return true;
  }
}