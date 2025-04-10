import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Use unstable_mockModule to mock child_process for ESM modules.
jest.unstable_mockModule('child_process', () => ({
    execSync: jest.fn(),
}));

// Import the mocked child_process module.
// The 'cp' import is removed as it is not used.

// Now import the AutoSync and RunCommand classes (they pick up the mocked cp).
import { RunCommand } from '../../src/files/git/git-files.service';

jest.mock('../../src/util/logger', () => {
    return {
        ConsoleLogger: jest.fn().mockImplementation(() => ({
            LogMsg: jest.fn(),
            ErrorMsg: jest.fn(),
        })),
    };
});


describe('RunCommand', () => {
    let runCommandInstance: RunCommand;

    beforeEach(() => {
        runCommandInstance = new RunCommand();
    });

    it('1 - should return expected output for a valid command', () => {
        const output = runCommandInstance.runCommand('echo hello', process.cwd());
        expect(output).toMatch(/hello/);
    });

    it('2 - should return null for an invalid command', () => {
        const output = runCommandInstance.runCommand('nonexistentcommand', process.cwd());
        expect(output).toBeNull();
    });
});

// Duplicate test suite removed to avoid conflicts.