import { GitRepo } from './config.model';

export const CONFIG_SERVICE = 'CONFIG_SERVICE';

export interface IConfig {
  loadConfig(configPath: string): Promise<void>;
  getLocalPath(): string;
  getApolloPath(): string;
  getMode(): string;
  getPort(): number;
  getLogLevel(): string;
  getGraphqlPlayground(): string;
  getGitRepos(): { [key: string]: GitRepo }[];

  // Secrets management methods

  loadSecrets(): Promise<void>; //added
  saveSecrets(): Promise<void>; //added
  getSecret(key: string): string | undefined; //added
  setSecret(key: string, value: string): void; //added


}
