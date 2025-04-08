import { Module } from '@nestjs/common';
import AutoSyncService from './auto-sync.service.js'; // Fix: Use default import
import { ConsoleLogger } from '../util/logger.js';

@Module({
    providers: [
        AutoSyncService,
        ConsoleLogger, // added to satisfy dependency injection in AutoSyncService
    ],
    exports: [AutoSyncService],
})
export class AutoSyncModule { }