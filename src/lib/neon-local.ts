import { neonConfig } from "@neondatabase/serverless";

/** Hostname that marks a connection string as the local docker-compose database (resolves to 127.0.0.1). */
export const LOCAL_DB_HOST = "db.localtest.me";
const LOCAL_PROXY_PORT = 4444;

/**
 * Points the Neon driver at the local HTTP/WebSocket proxy from docker-compose.yml.
 * Does nothing unless the URL's host is `db.localtest.me`, so Neon and Vercel are unaffected.
 */
export function configureLocalNeon(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return;
  }
  if (host !== LOCAL_DB_HOST) return;
  neonConfig.fetchEndpoint = (h) => `http://${h}:${LOCAL_PROXY_PORT}/sql`;
  neonConfig.wsProxy = (h) => `${h}:${LOCAL_PROXY_PORT}/v2`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}
