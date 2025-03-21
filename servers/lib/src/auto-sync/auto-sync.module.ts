import { Module } from '@nestjs/common';
import { AutoSyncService } from './auto-sync.service';

@Module({
    providers: [AutoSyncService],
    exports: [AutoSyncService],
})
export class AutoSyncModule { }