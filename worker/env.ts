import type { MonteAdmin } from "./index";

export interface Env {
  ADMIN: DurableObjectNamespace<MonteAdmin>;
  UPLOADS: KVNamespace;
  ASSETS: Fetcher;
  ADMIN_ORIGIN: string;
  RP_ID: string;
  GITHUB_REPOSITORY: string;
  GITHUB_REPOSITORY_ID: string;
  GITHUB_APP_ID: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  PUBLIC_SITE_URL: string;
  BOOTSTRAP_TOKEN_HASH?: string;
  BOOTSTRAP_EXPIRES_AT?: string;
  BOOTSTRAP_NAME?: string;
  RECOVERY_USER_ID?: string;
}
