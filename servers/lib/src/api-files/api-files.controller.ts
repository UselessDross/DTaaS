import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';
import { FilesApiService } from './api-files.service';
import { CreateFileDto } from './dto/create-file.dto';
import { UpdateFileDto } from './dto/update-file.dto';

const RATE_LIMIT = { default: { limit: 5, ttl: 60 } }; // 5 requests per 60 seconds

@Controller('files')
export class FilesApiController {
    constructor(private readonly filesApiService: FilesApiService) { }
    @Throttle(RATE_LIMIT)
    @Get()
    listDirectory(@Query('dir') dirPath: string) { return this.filesApiService.listDirectory(dirPath); }

    @Throttle(RATE_LIMIT)
    @Get(':path(*)')
    readFile(@Param('path') filePath: string) { return this.filesApiService.readFile(filePath); }


    @Throttle(RATE_LIMIT)
    @Post(':path(*)')
    createFile(@Param('path') filePath: string, @Body() body: CreateFileDto) { return this.filesApiService.createFile(filePath, body.content); }


    @Throttle(RATE_LIMIT)
    @Put(':path(*)')
    updateFile(@Param('path') filePath: string, @Body() body: UpdateFileDto) { return this.filesApiService.updateFile(filePath, body.content); }

    @Throttle(RATE_LIMIT)
    @Delete(':path(*)')
    deleteFile(@Param('path') filePath: string) { return this.filesApiService.deleteFile(filePath); }
}
