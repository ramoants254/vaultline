import autocannon from 'autocannon';

async function runLoadTest() {
  console.log('🚀 Starting Vaultline High-Concurrency Load Test...');

  // 1. Stress Test Ledger direct journal entry postings
  console.log('\n--- 1. Testing Ledger Double-Entry Concurrency ---');
  const ledgerResult = await autocannon({
    url: 'http://localhost:4002/ledger/entries',
    connections: 20, // 20 concurrent connections
    duration: 10,   // Run for 10 seconds
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    setupClient: (client) => {
      // Dynamically generate unique reference ID per request
      client.on('request', () => {
        const uniqueRef = `load_ref_${Date.now()}_${Math.random()}`;
        client.setBody(JSON.stringify({
          referenceId: uniqueRef,
          description: 'Load test journal posting',
          entries: [
            { accountId: 'CLEARING_ID_HERE', direction: 'DEBIT', amount: 10.00 },
            { accountId: 'USER_ID_HERE', direction: 'CREDIT', amount: 10.00 }
          ]
        }));
      });
    }
  });

  console.log(`Req/Sec: ${ledgerResult.requests.average}`);
  console.log(`Latency Avg: ${ledgerResult.latency.average} ms`);
  console.log(`Errors / Non-2xx: ${ledgerResult.errors + ledgerResult.non2xx}`);

  // 2. Stress Test Payments Gateway Idempotency & Rate Limiter
  console.log('\n--- 2. Testing Payments API Gateway Idempotency & Throughput ---');
  const paymentsResult = await autocannon({
    url: 'http://localhost:8000/api/v1/payments/deposit',
    connections: 15,
    duration: 10,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN_HERE',
      'X-Idempotency-Key': 'static-idempotency-key-test' // Tests concurrent lock protection
    },
    body: JSON.stringify({
      userId: '11111111-1111-1111-1111-111111111111',
      clearingAccountId: 'CLEARING_ID_HERE',
      userWalletAccountId: 'USER_ID_HERE',
      amount: 50.00,
      currency: 'USD',
      paymentMethodToken: 'tok_visa_valid'
    })
  });

  console.log(`Req/Sec: ${paymentsResult.requests.average}`);
  console.log(`Latency Avg: ${paymentsResult.latency.average} ms`);
  console.log(`Errors / Non-2xx: ${paymentsResult.errors + paymentsResult.non2xx}`);
}

runLoadTest();