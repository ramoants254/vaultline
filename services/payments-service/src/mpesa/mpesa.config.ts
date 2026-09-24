export type MpesaEnvironment = 'sandbox' | 'production';

export interface MpesaConfig {
  environment: MpesaEnvironment;
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackBaseUrl: string;

  // Derived URLs
  baseUrl: string;
  authUrl: string;
  stkPushUrl: string;
  b2cUrl: string;
  queryUrl: string;
}

export function getMpesaConfig(): MpesaConfig {
  const environment = (process.env.MPESA_ENVIRONMENT as MpesaEnvironment) || 'sandbox';

  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const callbackBaseUrl = process.env.MPESA_CALLBACK_BASE_URL;

  if (!consumerKey || !consumerSecret || !shortcode || !passkey || !callbackBaseUrl) {
    throw new Error(
      '[MpesaConfig] Missing required environment variables. ' +
      'Ensure MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, ' +
      'MPESA_PASSKEY, and MPESA_CALLBACK_BASE_URL are set.',
    );
  }

  const baseUrl =
    environment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';

  return {
    environment,
    consumerKey,
    consumerSecret,
    shortcode,
    passkey,
    callbackBaseUrl,
    baseUrl,
    authUrl: `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    stkPushUrl: `${baseUrl}/mpesa/stkpush/v1/processrequest`,
    b2cUrl: `${baseUrl}/mpesa/b2c/v1/paymentrequest`,
    queryUrl: `${baseUrl}/mpesa/stkpushquery/v1/query`,
  };
}
