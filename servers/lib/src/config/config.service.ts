// import { readFileSync } from 'fs';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { encrypt, decrypt } from '../util/EncryptedSecrets.js'; // your encryption utils
import * as yaml from 'js-yaml';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { GitRepo } from './config.model.js';
import resolveFile from './util.js';
import { IConfig } from './config.interface.js';

@Injectable()
export default class Config implements IConfig {
  private configValues: GitRepo;
  private logger: Logger;
  //
  //
  //
  /** ─────────────────────────────────────────────
  *    the usage of the StoreTokenAsSecrets
  * ─────────────────────────────────────────────*/
  private secrets: Record<string, string> = {};
  private secretsFilePath: string = path.resolve(process.env.SECRETS_PATH || './secrets.enc');
  //
  //
  //
  constructor() { this.logger = new Logger(Config.name); }
  async loadSecrets(password: string): Promise<void> {
    if (!existsSync(this.secretsFilePath)) {
      this.logger.warn(`Secrets file not found at ${this.secretsFilePath}`);
      this.secrets = {};
      return;
    }
    try {
      const encrypted = readFileSync(this.secretsFilePath);
      const decryptedJson = await decrypt(encrypted);

      this.secrets = JSON.parse(decryptedJson);
      this.logger.log('Secrets loaded and decrypted');
    } catch (e) {
      this.logger.error('Failed to load or decrypt secrets', e);
      throw e;
    }
  }
  async saveSecrets(password: string): Promise<void> {
    try {
      const jsonString = JSON.stringify(this.secrets);
      const encrypted = encrypt(jsonString);
      writeFileSync(this.secretsFilePath, await encrypted, 'utf8');
      this.logger.log('Secrets encrypted and saved');
    } catch (e) {
      this.logger.error('Failed to save secrets', e);
      throw e;
    }
  }
  getSecret(key: string): string | undefined { return this.secrets[key]; }
  setSecret(key: string, value: string): void { this.secrets[key] = value; }

  //
  //
  //


  async loadConfig(configPath: string): Promise<void> {
    if (configPath !== undefined) {
      try {
        const configFile = readFileSync(resolveFile(configPath), 'utf8');
        this.configValues = yaml.load(configFile) as GitRepo;
      } catch (e) {
        this.logger.error('Error loading config file', e);
        process.exit(1);
      }
    }
    this.logger.log('Config loaded', this.configValues);
  }

  getLocalPath(): string {
    return this.configValues['local-path'];
  }

  getApolloPath(): string {
    return this.configValues['apollo-path'];
  }

  getMode(): string {
    return this.configValues['mode'];
  }

  getPort(): number {
    return this.configValues['port'];
  }
  getLogLevel(): string {
    return this.configValues['log-level'];
  }
  getGraphqlPlayground(): string {
    return this.configValues['graphql-playground'];
  }
  getGitRepos(): { [key: string]: GitRepo }[] {
    return this.configValues['git-repos'];
  }
}