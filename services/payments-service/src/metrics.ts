import client from 'prom-client';

client.collectDefaultMetrics();

export const httpRequestsTotal = new client.Counter({ name: 'vaultline_http_requests_total', help: 'Total HTTP requests handled', labelNames: ['method', 'route', 'status_code'] });
export const httpRequestDuration = new client.Histogram({ name: 'vaultline_http_request_duration_seconds', help: 'HTTP request duration in seconds', labelNames: ['method', 'route', 'status_code'], buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5] });
export const httpRequestsInFlight = new client.Gauge({ name: 'vaultline_http_requests_in_flight', help: 'HTTP requests currently being handled' });
export const rabbitmqEventsPublished = new client.Counter({ name: 'vaultline_rabbitmq_events_published_total', help: 'RabbitMQ events published', labelNames: ['event_type'] });
export const paymentsTotal = new client.Counter({ name: 'vaultline_payments_total', help: 'Payments processed', labelNames: ['operation', 'status'] });
export { client as prometheusClient };
