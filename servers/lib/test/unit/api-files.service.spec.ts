import { jest } from '@jest/globals';
import path from 'path';

// Normalize ROOT to resolved path
process.env.ROOT = path.resolve('C:/safe/test/root');

// --- Mocks for fs/promises ---
const mockWriteFile = jest.fn(() => Promise.resolve());
const mockReadFile = jest.fn(() => Promise.resolve('mocked content'));
const mockReaddir = jest.fn(() => Promise.resolve([]));
const mockAccess = jest.fn<(_p: string) => Promise<void>>(() => Promise.resolve());
const mockUnlink = jest.fn(() => Promise.resolve());
const mockMkdir = jest.fn(() => Promise.resolve());
const mockLstat = jest.fn(() => Promise.resolve({ isSymbolicLink: () => false }));

jest.mock('fs/promises', () => ({
    writeFile: mockWriteFile,
    readFile: mockReadFile,
    readdir: mockReaddir,
    access: mockAccess,
    unlink: mockUnlink,
    mkdir: mockMkdir,
    lstat: mockLstat,
}));

// --- Imports under test ---
import { CONFIG_MODE } from '../../src/enums/config-mode.enum';
import type { Project } from '../../src/types';
import type { IFilesService } from '../../src/files/interfaces/files.service.interface';
import { FilesApiService } from '../../src/api-files/api-files.service';

// Mock underlying file service
const mockFileService: IFilesService = {
    listDirectory: jest.fn(() => Promise.resolve({} as Project)),
    readFile: jest.fn(() => Promise.resolve({} as Project)),
    init: jest.fn(() => Promise.resolve()),
    getMode: jest.fn(() => CONFIG_MODE.GIT),
};

describe('FilesApiService (full coverage)', () => {
    let service: FilesApiService;
    beforeEach(() => {
        jest.clearAllMocks();
        mockReaddir.mockResolvedValue([]);
        mockAccess.mockReset().mockResolvedValue(undefined);
        mockLstat.mockImplementation(() => Promise.resolve({ isSymbolicLink: () => false }));
        service = new FilesApiService(mockFileService);
    });

    // --- createFile ---
    describe('createFile()', () => {
        beforeEach(() => {
            // Override instance methods so our simulation “wins.”
            service['fileExists'] = async (_p: string) => false;
            service['enforceMaxFilesInDir'] = async (_p: string) => { };
            // Force the instance to use our writeFile mock.
            service['writeFile'] = mockWriteFile;
        });
        it('rejects existing file', async () => {
            service['fileExists'] = async (_p: string) => true;
            mockReaddir.mockResolvedValue([]);
            await expect(service.createFile('c.txt', 'x'))
                .rejects.toThrow('File already exists.');
        });
        it('creates when safe', async () => {
            service['fileExists'] = async (_p: string) => false;
            const fp = 'a.txt';
            const txt = 'ok';
            const fullPath = path.resolve(process.env.ROOT!, fp);
            // Simulate fs.access rejecting with ENOENT for the target file.
            mockAccess.mockImplementation((_p: string) => {
                return _p === fullPath ? Promise.reject(new Error('ENOENT')) : Promise.resolve(undefined);
            });
            mockReaddir.mockResolvedValue([]);
            // Call createFile; it should then call fs.writeFile (our mockWriteFile).
            const result = await service.createFile(fp, txt);
            expect(mockWriteFile).toHaveBeenCalledWith(fullPath, txt, 'utf8');
            expect(result).toEqual({ message: 'File created.', path: fp });
        });
        it('rejects bad extension', async () => {
            await expect(service.createFile('a.js', 'x'))
                .rejects.toThrow('Unsupported file extension.');
        });
        it('rejects too-long content', async () => {
            await expect(service.createFile('b.txt', 'x'.repeat(300)))
                .rejects.toThrow('Content too long');
        });
        it('rejects directory full', async () => {
            service['fileExists'] = async (_p: string) => false;
            service['enforceMaxFilesInDir'] = async (_p: string) => { throw new Error('Directory limit exceeded'); };
            mockAccess.mockResolvedValue(undefined);
            mockReaddir.mockResolvedValue(Array(12).fill({ isFile: () => true }));
            await expect(service.createFile('d.txt', 'x'))
                .rejects.toThrow('Directory limit exceeded');
        });
    });

    // --- updateFile ---
    describe('updateFile()', () => {
        beforeEach(() => {
            service['fileExists'] = async (_p: string) => true;
            service['rejectSymlinks'] = async (_p: string) => { };
            service['enforceMaxFilesInDir'] = async (_p: string) => { };
            // Force instance to use our writeFile mock.
            service['writeFile'] = mockWriteFile;
            mockAccess.mockResolvedValue(undefined);
        });
        it('updates when exists', async () => {
            const fp = 'u.txt';
            const fullPath = path.resolve(process.env.ROOT!, fp);
            mockAccess.mockResolvedValue(undefined);
            mockLstat.mockResolvedValue({ isSymbolicLink: () => false });
            mockReaddir.mockResolvedValue([]);
            const res = await service.updateFile(fp, 'new');
            expect(mockWriteFile).toHaveBeenCalledWith(fullPath, 'new', 'utf8');
            expect(res).toEqual({ message: 'File updated.', path: fp });
        });
        it('rejects if missing', async () => {
            service['fileExists'] = async (_p: string) => false;
            const fp = 'u2.txt';
            mockAccess.mockRejectedValue(new Error('ENOENT'));
            mockLstat.mockResolvedValue({ isSymbolicLink: () => false });
            mockReaddir.mockResolvedValue([]);
            await expect(service.updateFile(fp, 'x'))
                .rejects.toThrow('File does not exist.');
        });
    });

    // --- deleteFile ---
    describe('deleteFile()', () => {
        beforeEach(() => {
            service['fileExists'] = async (_p: string) => true;
            service['rejectSymlinks'] = async (_p: string) => { };
            service['enforceMaxFilesInDir'] = async (_p: string) => { };
            mockAccess.mockResolvedValue(undefined);
            // Force instance to use our unlink mock.
            service['unlink'] = mockUnlink;
        });
        it('deletes when exists', async () => {
            const fp = 'z.txt';
            const fullPath = path.resolve(process.env.ROOT!, fp);
            mockLstat.mockResolvedValue({ isSymbolicLink: () => false });
            mockReaddir.mockResolvedValue([]);
            const res = await service.deleteFile(fp);
            expect(mockUnlink).toHaveBeenCalledWith(fullPath);
            expect(res).toEqual({ message: 'File deleted.', path: fp });
        });
        it('rejects if missing', async () => {
            service['fileExists'] = async (_p: string) => false;
            const fp = 'z2.txt';
            mockAccess.mockRejectedValue(new Error('ENOENT'));
            mockLstat.mockResolvedValue({ isSymbolicLink: () => false });
            mockReaddir.mockResolvedValue([]);
            await expect(service.deleteFile(fp))
                .rejects.toThrow('File does not exist.');
        });
    });

    // --- readFile ---
    describe('readFile()', () => {
        beforeEach(() => {
            (service as any).rejectSymlinks = async () => { };
        });
        it('delegates when safe', async () => {
            const fp = 'r.txt';
            const fullPath = path.resolve(process.env.ROOT!, fp);
            mockLstat.mockResolvedValue({ isSymbolicLink: () => false });
            const data = await service.readFile(fp);
            expect(mockFileService.readFile).toHaveBeenCalledWith(fullPath);
            expect(data).toEqual({} as Project);
        });
        it('rejects bad extension', async () => {
            await expect(service.readFile('r.js'))
                .rejects.toThrow('Unsupported file extension.');
        });
    });

    // --- listDirectory ---
    describe('listDirectory()', () => {
        it('delegates when safe', async () => {
            const dir = 'sub';
            const fullPath = path.resolve(process.env.ROOT!, dir);
            const data = await service.listDirectory(dir);
            expect(mockFileService.listDirectory).toHaveBeenCalledWith(fullPath);
            expect(data).toEqual({} as Project);
        });
        it('rejects traversal', async () => {
            await expect(service.listDirectory('../etc'))
                .rejects.toThrow('Path traversal attempt detected.');
        });
    });
});
