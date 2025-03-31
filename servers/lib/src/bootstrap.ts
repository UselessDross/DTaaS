import { NestFactory } from '@nestjs/core';
import AppModule from './app.module.js';
import cloudCMD from './cloudcmd/cloudcmd.js';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { GitRepo } from 'src/config/config.model.js';
import { CONFIG_SERVICE, IConfig } from './config/config.interface.js';
import { AutoSyncService } from './auto-sync/auto-sync.service.js';
import { ConsoleLogger } from './util/logger.js';
// import { resolve } from 'path';

type BootstrapOptions = {
  config?: string;
  httpServer?: string;
  runHelp?: CallableFunction;
};

export default async function bootstrap(options?: BootstrapOptions) {
  const logger = new Logger(bootstrap.name);

  if (process.env.LIBMS_CONFIG_PATH == null)
    process.env.LIBMS_CONFIG_PATH = options.config ?? 'libms.yaml';

  const app = await NestFactory.create(AppModule);
  const configService = app.get(CONFIG_SERVICE) as IConfig;
  const port = configService.getPort();
  const localPath = configService.getLocalPath();
  const mode = configService.getMode();
  const userRepoConfigs: { [key: string]: GitRepo }[] = configService.getGitRepos(); //added

  logger.log(
    `\x1b[32mStarting libms in \x1b[33m${mode} \x1b[32mmode, serving files from \x1b[34m${localPath} \x1b[32mon port \x1b[35m${port}\x1b[0m`,
  );

  if (!options.httpServer) {
    cloudCMD(app, options.httpServer, configService.getLocalPath());
  }

  const repoPaths = userRepoConfigs.map(repoObj => {
    // Each repoObj is like { user1: { 'repo-url': '...', 'http-token': '...' } }
    const key = Object.keys(repoObj)[0];
    return path.join(localPath, key);
  });


  // Then instantiate and schedule auto sync:
  const autoSyncService = new AutoSyncService(new ConsoleLogger());
  // Use repoPaths directly.
  autoSyncService.setRepositories(repoPaths);

  autoSyncService.scheduleAutoSync(userRepoConfigs['sync-interval'] ?? 60);


  await app.listen(port);
}