import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import { AppStoreConnectConfig } from '../types/index.js';

export class AuthService {
  constructor(private config: AppStoreConnectConfig) {}

  async generateToken(): Promise<string> {
    // Key material comes either inline (from the Keychain) or from a file path.
    const privateKey = this.config.privateKey
      ?? await fs.readFile(this.config.privateKeyPath as string, 'utf-8');

    const token = jwt.sign({}, privateKey, {
      algorithm: 'ES256',
      expiresIn: '20m', // App Store Connect tokens can be valid for up to 20 minutes
      audience: 'appstoreconnect-v1',
      keyid: this.config.keyId,
      issuer: this.config.issuerId,
    });

    return token;
  }

  validateConfig(): void {
    const hasKeyMaterial = !!this.config.privateKey || !!this.config.privateKeyPath;
    if (!this.config.keyId || !this.config.issuerId || !hasKeyMaterial) {
      throw new Error(
        "Missing App Store Connect credentials. Store them in the macOS Keychain " +
        "with scripts/setup-keychain.sh, or set APP_STORE_CONNECT_KEY_ID, " +
        "APP_STORE_CONNECT_ISSUER_ID, and APP_STORE_CONNECT_P8_PATH."
      );
    }
  }
}