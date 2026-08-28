export function logStructured(service: string, level: 'INFO' | 'WARN' | 'ERROR', message: string, meta: Record<string, any> = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service,
      level,
      message,
      correlationId: meta.correlationId || meta.referenceId || 'N/A',
      ...meta,
    })
  );
}