export interface App {
  id: string;
  type: string;
  attributes: {
    name: string;
    bundleId: string;
    sku: string;
    primaryLocale: string;
  };
}

export interface ListAppsResponse {
  data: App[];
}

export interface AppInfoResponse {
  data: App;
  included?: any[];
}

export type AppIncludeOptions = 
  | "appClips"
  | "appInfos"
  | "appStoreVersions"
  | "availableTerritories"
  | "betaAppReviewDetail"
  | "betaGroups"
  | "betaLicenseAgreement"
  | "builds"
  | "endUserLicenseAgreement"
  | "gameCenterEnabledVersions"
  | "inAppPurchasesV2"
  /** @deprecated The v1 in-app purchase relationship, deprecated since App Store Connect API 2.0. Use "inAppPurchasesV2". */
  | "inAppPurchases"
  | "preOrder"
  | "prices"
  | "reviewSubmissions";