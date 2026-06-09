import { execFileSync } from 'child_process';
import { AppStoreConnectConfig } from '../types/index.js';

// All credentials resolve to the macOS login Keychain by default, so nothing
// sensitive needs to live in the MCP client config or in a plaintext .env.
// Environment variables, when set, take precedence (handy for CI or a quick
// override). Store secrets with scripts/setup-keychain.sh.
//
// Keychain layout (service is fixed, account names map to fields):
//   service "appstore-connect-mcp"  account "key-id"      -> APP_STORE_CONNECT_KEY_ID
//   service "appstore-connect-mcp"  account "issuer-id"   -> APP_STORE_CONNECT_ISSUER_ID
//   service "appstore-connect-mcp"  account "private-key" -> the .p8 PEM contents
//   service "appstore-connect-mcp"  account "vendor-number" (optional)

export const KEYCHAIN_SERVICE = 'appstore-connect-mcp';

function readKeychain(account: string): string | undefined {
  try {
    // The accessing binary is `security` itself; the setup script grants it
    // access (-T) so this read is non-interactive (no GUI prompt).
    const raw = execFileSync(
      'security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).replace(/\n$/, '');
    if (!raw) return undefined;
    // setup-keychain.sh stores every value base64-encoded (see note there).
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    return decoded || undefined;
  } catch {
    // Not found, or `security` unavailable (non-macOS). Fall through to env.
    return undefined;
  }
}

export function resolveConfig(): AppStoreConnectConfig {
  const keyId = process.env.APP_STORE_CONNECT_KEY_ID || readKeychain('key-id');
  const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID || readKeychain('issuer-id');
  const vendorNumber = process.env.APP_STORE_CONNECT_VENDOR_NUMBER || readKeychain('vendor-number');

  // For the private key, an explicit file path wins; otherwise pull the PEM
  // straight from the Keychain so the .p8 file can be deleted entirely.
  const privateKeyPath = process.env.APP_STORE_CONNECT_P8_PATH || undefined;
  const privateKey = privateKeyPath ? undefined : readKeychain('private-key');

  return {
    keyId: keyId as string,
    issuerId: issuerId as string,
    privateKey,
    privateKeyPath,
    vendorNumber,
  };
}
