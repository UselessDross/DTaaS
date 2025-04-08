import { Module } from '@nestjs/common';
import GitFilesService, { AutoSyncService } from './git-files.service.js';
import LocalFilesService from '../local/local-files.service.js';

@Module({
  providers: [GitFilesService, LocalFilesService, AutoSyncService],
  exports: [GitFilesService, AutoSyncService],
})
export class GitFilesModule {}
