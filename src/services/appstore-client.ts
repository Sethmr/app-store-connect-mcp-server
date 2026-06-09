import axios, { AxiosInstance } from 'axios';
import { AuthService } from './auth.js';
import { AppStoreConnectConfig } from '../types/index.js';

export class AppStoreConnectClient {
  private axiosInstance: AxiosInstance;
  private authService: AuthService;

  constructor(config: AppStoreConnectConfig) {
    this.authService = new AuthService(config);
    this.authService.validateConfig();
    
    this.axiosInstance = axios.create({
      baseURL: 'https://api.appstoreconnect.apple.com/v1',
    });
  }

  async request<T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', url: string, data?: any, params?: Record<string, any>): Promise<T> {
    // Read-only by default. Mutating calls (tester removal, capability changes,
    // version creation, ...) require an explicit opt-in via ASC_ALLOW_WRITES=true
    // in the server's environment, so a confused or injected tool call can never
    // change App Store Connect state silently.
    if (method !== 'GET' && process.env.ASC_ALLOW_WRITES !== 'true') {
      throw new Error(
        `Blocked ${method} ${url}: this server is running in read-only mode. ` +
        'Set ASC_ALLOW_WRITES=true in the MCP server environment to enable write operations.'
      );
    }

    const token = await this.authService.generateToken();

    const response = await this.axiosInstance.request<T>({
      method,
      url,
      data,
      params,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  }

  async get<T = any>(url: string, params?: Record<string, any>): Promise<T> {
    return this.request<T>('GET', url, undefined, params);
  }

  async post<T = any>(url: string, data: any): Promise<T> {
    return this.request<T>('POST', url, data);
  }

  async put<T = any>(url: string, data: any): Promise<T> {
    return this.request<T>('PUT', url, data);
  }

  async delete<T = any>(url: string, data?: any): Promise<T> {
    return this.request<T>('DELETE', url, data);
  }

  async patch<T = any>(url: string, data: any): Promise<T> {
    return this.request<T>('PATCH', url, data);
  }

  async downloadFromUrl(url: string): Promise<any> {
    // The segment URL is model-supplied input. Never let it exfiltrate the API
    // token: require https, and only attach the Authorization header when the
    // host is Apple's API itself. (Analytics report segment URLs are presigned
    // and don't need the token anyway.)
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      throw new Error(`Blocked download from ${url}: only https URLs are allowed.`);
    }
    const isAppleApi = parsed.hostname === 'api.appstoreconnect.apple.com';
    if (!isAppleApi && !parsed.hostname.endsWith('.apple.com')) {
      throw new Error(
        `Blocked download from host ${parsed.hostname}: not an Apple domain. ` +
        'Use the segment URLs returned by list_analytics_report_segments.'
      );
    }

    const headers: Record<string, string> = {};
    if (isAppleApi) {
      headers['Authorization'] = `Bearer ${await this.authService.generateToken()}`;
    }

    const response = await axios.get(url, { headers });

    return {
      data: response.data,
      contentType: response.headers['content-type'],
      size: response.headers['content-length']
    };
  }
}