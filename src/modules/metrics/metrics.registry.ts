import * as client from 'prom-client';

client.collectDefaultMetrics({ prefix: 'dbflow_' });

export const httpRequestDuration = new client.Histogram({
  name: 'dbflow_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

export const httpRequestsTotal = new client.Counter({
  name: 'dbflow_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const register = client.register;
