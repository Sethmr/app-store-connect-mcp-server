import { AppStoreConnectClient } from '../services/index.js';
import { 
  ListAppStoreVersionLocalizationsResponse, 
  AppStoreVersionLocalizationResponse,
  AppStoreVersionLocalizationUpdateRequest,
  AppStoreVersionLocalizationField,
  ListAppStoreVersionsResponse,
  AppStoreVersionCreateRequest,
  AppStoreVersionResponse
} from '../types/index.js';
import { validateRequired, sanitizeLimit } from '../utils/index.js';

export class LocalizationHandlers {
  constructor(private client: AppStoreConnectClient) {}

  async listAppStoreVersions(args: {
    appId: string;
    limit?: number;
    filter?: {
      platform?: string;
      versionString?: string;
      appVersionState?: string;
      /** @deprecated Deprecated since App Store Connect API 3.3. Use appVersionState. */
      appStoreState?: string;
    };
  }): Promise<ListAppStoreVersionsResponse> {
    const { appId, limit = 100, filter } = args;
    
    validateRequired(args, ['appId']);
    
    const params: Record<string, any> = {
      limit: sanitizeLimit(limit)
    };
    
    if (filter?.platform) {
      params['filter[platform]'] = filter.platform;
    }
    
    if (filter?.versionString) {
      params['filter[versionString]'] = filter.versionString;
    }
    
    // appVersionState replaced appStoreState in App Store Connect API 3.3. Fall
    // back to the deprecated key (and its own value set) if that's all we're given.
    if (filter?.appVersionState) {
      params['filter[appVersionState]'] = filter.appVersionState;
    } else if (filter?.appStoreState) {
      params['filter[appStoreState]'] = filter.appStoreState;
    }
    
    return this.client.get<ListAppStoreVersionsResponse>(
      `/apps/${appId}/appStoreVersions`,
      params
    );
  }

  async listAppStoreVersionLocalizations(args: {
    appStoreVersionId: string;
    limit?: number;
  }): Promise<ListAppStoreVersionLocalizationsResponse> {
    const { appStoreVersionId, limit = 100 } = args;
    
    validateRequired(args, ['appStoreVersionId']);
    
    const params: Record<string, any> = {
      limit: sanitizeLimit(limit)
    };
    
    return this.client.get<ListAppStoreVersionLocalizationsResponse>(
      `/appStoreVersions/${appStoreVersionId}/appStoreVersionLocalizations`,
      params
    );
  }

  async getAppStoreVersionLocalization(args: {
    localizationId: string;
  }): Promise<AppStoreVersionLocalizationResponse> {
    const { localizationId } = args;
    
    validateRequired(args, ['localizationId']);
    
    return this.client.get<AppStoreVersionLocalizationResponse>(
      `/appStoreVersionLocalizations/${localizationId}`
    );
  }

  async updateAppStoreVersionLocalization(args: {
    localizationId: string;
    field: AppStoreVersionLocalizationField;
    value: string;
  }): Promise<AppStoreVersionLocalizationResponse> {
    const { localizationId, field, value } = args;
    
    validateRequired(args, ['localizationId', 'field', 'value']);
    
    // Validate field
    const validFields: AppStoreVersionLocalizationField[] = [
      'description', 'keywords', 'marketingUrl', 
      'promotionalText', 'supportUrl', 'whatsNew'
    ];
    
    if (!validFields.includes(field)) {
      throw new Error(`Invalid field: ${field}. Must be one of: ${validFields.join(', ')}`);
    }
    
    const requestData: AppStoreVersionLocalizationUpdateRequest = {
      data: {
        type: 'appStoreVersionLocalizations',
        id: localizationId,
        attributes: {
          [field]: value
        }
      }
    };
    
    return this.client.patch<AppStoreVersionLocalizationResponse>(
      `/appStoreVersionLocalizations/${localizationId}`,
      requestData
    );
  }

  async createAppStoreVersion(args: {
    appId: string;
    platform: 'IOS' | 'MAC_OS' | 'TV_OS' | 'VISION_OS';
    versionString: string;
    copyright?: string;
    releaseType?: 'MANUAL' | 'AFTER_APPROVAL' | 'SCHEDULED';
    earliestReleaseDate?: string;
    buildId?: string;
  }): Promise<AppStoreVersionResponse> {
    const { 
      appId, 
      platform, 
      versionString, 
      copyright, 
      releaseType, 
      earliestReleaseDate,
      buildId 
    } = args;
    
    validateRequired(args, ['appId', 'platform', 'versionString']);
    
    // Validate version string format
    const versionRegex = /^\d+\.\d+(\.\d+)?$/;
    if (!versionRegex.test(versionString)) {
      throw new Error('Version string must be in format X.Y or X.Y.Z (e.g., 1.0 or 1.0.0)');
    }
    
    // Validate release date if provided
    if (earliestReleaseDate) {
      const date = new Date(earliestReleaseDate);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid release date format. Use ISO 8601 format (e.g., 2024-01-01T00:00:00Z)');
      }
      if (releaseType !== 'SCHEDULED') {
        throw new Error('earliestReleaseDate can only be set when releaseType is SCHEDULED');
      }
    }
    
    const requestData: AppStoreVersionCreateRequest = {
      data: {
        type: 'appStoreVersions',
        attributes: {
          platform,
          versionString,
          ...(copyright && { copyright }),
          ...(releaseType && { releaseType }),
          ...(earliestReleaseDate && { earliestReleaseDate })
        },
        relationships: {
          app: {
            data: {
              type: 'apps',
              id: appId
            }
          },
          ...(buildId && {
            build: {
              data: {
                type: 'builds',
                id: buildId
              }
            }
          })
        }
      }
    };
    
    return this.client.post<AppStoreVersionResponse>(
      '/appStoreVersions',
      requestData
    );
  }
}