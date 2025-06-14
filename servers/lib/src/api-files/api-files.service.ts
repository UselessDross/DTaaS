import { Injectable } from '@nestjs/common';
import { IFilesService } from '../files/interfaces/files.service.interface.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';



const ROOT: string = 'C:/path/to/your/root/files';
const MAX_BYTES: number = 1024 * 1024; // 1 MB
const MAX_FILES_PER_DIR: number = 12;
const MAX_CHAR_LENGTH: number = 256;

@Injectable()
export class FilesApiService {

    private readonly filesService: IFilesService;
    constructor(filesService_: IFilesService) { this.filesService = filesService_; }

    async listDirectory(dirPath: string): Promise<any> {
        try {
            this.ensurePathIsSafe(dirPath);
            const fullPath = this.resolveAndValidateRoot(dirPath);
            return this.filesService.listDirectory(fullPath);
        } catch (err: any) {
            throw new BadRequestException('Invalid directory path: ' + err.message);

        }
    }

    async readFile(filePath: string): Promise<any> {
        const fullPath = this.resolveAndValidateRoot(filePath);
        this.ensureExtensionIsSafe(filePath);
        this.ensureFileNameIsSafe(filePath);
        this.ensurePathIsSafe(fullPath);
        this.rejectSymlinks(fullPath);
        return this.filesService.readFile(fullPath);
    }


    async createFile(filePath: string, content: string): Promise<any> {
        const fullPath = this.resolveAndValidateRoot(filePath);
        this.ensureExtensionIsSafe(filePath);
        this.ensureFileNameIsSafe(filePath);
        this.ensureContentSafe(content);
        this.ensureSizeSafe(content);
        await this.enforceMaxFilesInDir(fullPath);

        if (await this.fileExists(fullPath)) {
            throw new BadRequestException('File already exists.');
        }

        await fs.writeFile(fullPath, content, 'utf8');
        return { message: 'File created.', path: filePath };
    }


    async updateFile(filePath: string, content: string): Promise<any> {
        const fullPath = this.resolveAndValidateRoot(filePath);
        this.ensureExtensionIsSafe(filePath);
        this.ensureFileNameIsSafe(filePath);
        this.rejectSymlinks(fullPath);
        this.ensureContentSafe(content);
        this.ensureSizeSafe(content);
        await this.enforceMaxFilesInDir(fullPath);

        if (!(await this.fileExists(fullPath))) { throw new BadRequestException('File does not exist.'); }

        await fs.writeFile(fullPath, content, 'utf8');
        return { message: 'File updated.', path: filePath };
    }

    async deleteFile(filePath: string): Promise<any> {
        const fullPath = this.resolveAndValidateRoot(filePath);
        this.ensureExtensionIsSafe(filePath);
        this.ensureFileNameIsSafe(filePath);
        this.ensurePathIsSafe(fullPath);
        this.rejectSymlinks(fullPath);
        await this.enforceMaxFilesInDir(fullPath);
        if (!(await this.fileExists(fullPath))) { throw new BadRequestException('File does not exist.'); }


        await fs.unlink(fullPath);
        return { message: 'File deleted.', path: filePath };

    }


    // ────────────────────────────────────────────
    // φ SECURITY CHECKS
    // ────────────────────────────────────────────


    private resolveAndValidateRoot(inputPath: string): string {
        const fullPath = path.resolve(ROOT, inputPath);
        if (!fullPath.startsWith(ROOT)) throw new BadRequestException('Access outside root is blocked.');
        return fullPath;
    }

    private ensureExtensionIsSafe(filePath: string): void {
        switch (path.extname(filePath).toLowerCase()) {
            case '.txt': if (!filePath.endsWith('.txt')) throw new BadRequestException('Only .txt files are allowed.');
                break;
            default: throw new BadRequestException('Unsupported file extension.');
        }
    }

    private ensurePathIsSafe(filePath: string): void {
        if (filePath.length > MAX_CHAR_LENGTH) { throw new BadRequestException(`Path too long: max ${MAX_CHAR_LENGTH} characters.`); }
        if (filePath.includes('\0')) { throw new BadRequestException('Null byte injection detected.'); }
        if (filePath.includes('..')) { throw new BadRequestException('Path traversal attempt detected.'); }
        const _fullPath = path.resolve(ROOT, filePath);
        if (!_fullPath.startsWith(ROOT)) throw new BadRequestException('Path escapes root.');
        if (filePath.length > MAX_CHAR_LENGTH) { throw new BadRequestException(`File path exceeds maximum length of ${MAX_CHAR_LENGTH} characters.`); }
    }




    private ensureContentSafe(content: string): void {
        if (content.length > MAX_CHAR_LENGTH) { throw new BadRequestException(`Content too long: max ${MAX_CHAR_LENGTH} characters.`); }
    }

    private async enforceMaxFilesInDir(fullPath: string): Promise<void> {
        const dir = path.dirname(fullPath);
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files = entries.filter(e => e.isFile());
        if (files.length >= MAX_FILES_PER_DIR) {
            throw new BadRequestException(`Directory limit exceeded. Max ${MAX_FILES_PER_DIR} files allowed.`);
        }
    }

    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
    private ensureFileNameIsSafe(filePath: string): void {
        const base = path.basename(filePath);
        if (!/^[a-zA-Z0-9_\-\.]+$/.test(base)) {
            throw new BadRequestException('File name contains illegal characters.');
        }

        const forbidden = ['con', 'nul', 'aux', 'com1', 'prn', 'lpt1'];
        if (forbidden.includes(base.toLowerCase())) {
            throw new BadRequestException('File name is reserved.');
        }
    }

    private async rejectSymlinks(filePath: string): Promise<void> {
        const stat = await fs.lstat(filePath);
        if (stat.isSymbolicLink()) {
            throw new BadRequestException('Symbolic links are not allowed.');
        }
    }
    private ensureSizeSafe(content: string): void {
        const byteSize = Buffer.byteLength(content, 'utf8');
        if (byteSize > MAX_BYTES) {
            throw new BadRequestException('File size too large.');
        }
    }
}
