import { NestFactory } from '@nestjs/core';
import AppModule from './app.module.js';
import cloudCMD from './cloudcmd/cloudcmd.js';
import { Logger } from '@nestjs/common';
import { CONFIG_SERVICE, IConfig } from './config/config.interface.js';

type BootstrapOptions = {
  config?: string;
  httpServer?: string;
  runHelp?: CallableFunction;
};

export default async function bootstrap(options?: BootstrapOptions) {
  const logger = new Logger(bootstrap.name);

  //          ──────────────────────────────────────────────────────
  // Stage 1: deciede which config file to load (default libms.yaml)
  //          ──────────────────────────────────────────────────────
  if (process.env.LIBMS_CONFIG_PATH == null) process.env.LIBMS_CONFIG_PATH = options?.config ?? 'libms.yaml';
  //
  //

  //          ──────────────────────────────────────────────────────
  // Stage 2: set "SECRETS_PASSWORD" env variable in your environment
  //          ──────────────────────────────────────────────────────
  const password = process.env.SECRETS_PASSWORD;
  if (!password) { throw new Error('SECRETS_PASSWORD env variable is required'); }
  //
  //

  //          ──────────────────────────────────────────────────────
  // Stage 3: instantiate NestJS app with AppModule.
  //          ──────────────────────────────────────────────────────
  const app = await NestFactory.create(AppModule);
  //
  //

  //          ──────────────────────────────────────────────────────
  // Stage 4: get the config service from the app context (implemented ICOnfig interface)
  //          ──────────────────────────────────────────────────────
  const configService = app.get(CONFIG_SERVICE) as IConfig;
  //
  //

  //          ──────────────────────────────────────────────────────
  // Stage 5: decrypte/load any exisitng secrets files 
  //          ──────────────────────────────────────────────────────
  try {
    await configService.loadSecrets();
    logger.log('√ Secrets loaded successfully');
  } catch (err: any) {
    logger.error('X Failed to load/decrypt secrets:', err.message);
    throw err;
  }
  //
  //

  //          ──────────────────────────────────────────────────────
  // Stage 6: Check if 'githubToken' secret exists
  //          ──────────────────────────────────────────────────────
  let token = configService.getSecret('githubToken');
  if (!token) {
    configService.setSecret('githubToken', 'my-new-token');
    await configService.saveSecrets();
    logger.log('Set and saved new githubToken secret');
  }
  //
  //

  //          ──────────────────────────────────────────────────────
  // Stage 7: load "libms.yaml" config file into memory
  //          ──────────────────────────────────────────────────────
  try {
    await configService.loadConfig(process.env.LIBMS_CONFIG_PATH!);
    logger.log('√ Config file parsed successfully');
  } catch (err: any) {
    logger.error('X Failed to load config file:', err.message);
    process.exit(1);
    return;
  }
  //
  //

  //          ──────────────────────────────────────────────────────
  // Stage 8: read “normal” values from config (port, local-path, mode, etc.)
  //          ──────────────────────────────────────────────────────
  const port = configService.getPort();
  const localPath = configService.getLocalPath();
  const mode = configService.getMode();
  logger.log(`\x1b[32mStarting libms in \x1b[33m${mode} \x1b[32mmode, serving files from \x1b[34m${localPath} \x1b[32mon port \x1b[35m${port}\x1b[0m`);
  //
  //

  //          ──────────────────────────────────────────────────────
  // Stage 9: If HTTP server is not requested, mount CloudCMD (the file-browser UI) instead
  //          ──────────────────────────────────────────────────────
  if (!options?.httpServer) { cloudCMD(app, options?.httpServer, localPath); }
  //
  //

  //          ──────────────────────────────────────────────────────
  // Stage 9: Nest listen on the configured port
  //          ──────────────────────────────────────────────────────
  await app.listen(port);
  logger.log(`√ Nest application is up and running on port ${port}`);
}
