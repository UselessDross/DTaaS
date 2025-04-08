import { Module } from '@nestjs/common';
import { AutoSync } from './auto-sync.service.js'; // use named import
import { ConsoleLogger } from '../util/logger.js';

@Module({
    providers: [
        AutoSync,
        ConsoleLogger, // added to satisfy dependency injection in AutoSyncService
    ],
    exports: [AutoSync],
})
export class AutoSyncModule { }