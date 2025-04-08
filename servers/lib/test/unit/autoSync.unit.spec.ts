import { jest } from '@jest/globals';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Set up the mock BEFORE any other imports.
jest.unstable_mockModule('child_process', () => ({
  execSync: jest.fn(),
}));

// Dynamically import modules so that they see the mocked child_process.
const { ConsoleLogger } = await import('../../src/util/logger.js');
const { AutoSync } = await import('../../src/files/git/git-files.service.js');

// Retrieve the mocked execSync.
const childProcMock = (await import('child_process')).execSync as jest.Mock;
const mockExecSync = childProcMock;

// You may also mock your logger if needed.
jest.mock('../../src/util/logger', () => ({
  ConsoleLogger: jest.fn().mockImplementation(() => ({
    LogMsg: jest.fn(),
    ErrorMsg: jest.fn(),
  })),
}));




describe('AutoSync', () => {
  // Declare a variable to hold the AutoSync instance.
  let autoSync: InstanceType<typeof AutoSync>;

  beforeEach(() => {
    // Clear mocks and instantiate a new AutoSync before each test.
    jest.clearAllMocks();
    autoSync = new AutoSync();
  });

  afterEach(() => {
    // Clear timers and mocks after each test.
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  it('1 - should initialize with correct project path', () => {
    // Calculate expected repo path based on the location of this test file.
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const expectedPath = path.resolve(__dirname, '../../../..').replace(/[\\\/]+$/, '');
    expect(autoSync['repoPath'].replace(/[\\\/]+$/, '')).toBe(expectedPath);  // Check that the AutoSync instance's repoPath (private) matches the expected path.
  });



  it('2 - should log the project path on initialization', () => {
    // Spy on the logger's LogMsg method to capture log calls.
    const logSpy = jest.spyOn(ConsoleLogger.prototype, 'LogMsg');
    autoSync = new AutoSync();                                                              // Create a new AutoSync instance
    autoSync.setRepository(autoSync['repoPath']);                                           // Set the repository path using the instance's existing repoPath property.
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Repository path set to:'));// Verify that LogMsg was called with a message indicating the repository path was set.
  });



  it('3 - should run a command successfully', () => {
    // Set up test command and working directory.
    const command = 'git status';
    const cwd = '/path/to/repo';
    const output = 'On branch main';
    mockExecSync.mockReturnValue(Buffer.from(output));                                 // Mock the execSync response to simulate successful command execution.
    const logMsgSpy = jest.spyOn(ConsoleLogger.prototype, 'LogMsg');                   // Spy on LogMsg to verify logging output.
    const result = autoSync['runCommand'](command, cwd);                               // Call the private runCommand method via bracket notation.
    expect(mockExecSync).toHaveBeenCalledWith(command, { cwd, stdio: 'pipe' });        // Verify that execSync was called with proper arguments.
    expect(result).toBe(output.trim());                                                // Check that the returned result matches the trimmed output.
    expect(logMsgSpy).toHaveBeenCalledWith(expect.stringContaining(`Running command: "${command}" in directory: ${cwd}`));// Verify that the LogMsg was used to log the command execution and output.
    expect(logMsgSpy).toHaveBeenCalledWith(expect.stringContaining(`Command output: ${output}`));
  });



  it('4 - should handle command execution error', () => {
    // Prepare test command and cwd to simulate error execution.
    const command = 'git status';
    const cwd = '/path/to/repo';
    const error = new Error('Command failed');
    mockExecSync.mockImplementation(() => { throw error; });                    // Mock execSync so that it throws an error.
    const errorMsgSpy = jest.spyOn(ConsoleLogger.prototype, 'ErrorMsg');        // Spy on ErrorMsg to verify error logging.
    const result = autoSync['runCommand'](command, cwd);                        // Execute the command.
    expect(mockExecSync).toHaveBeenCalledWith(command, { cwd, stdio: 'pipe' }); // Validate that execSync was called correctly.
    expect(result).toBeNull();                                                  // Since an error is thrown, result should be null.
    expect(errorMsgSpy).toHaveBeenCalledWith(expect.stringContaining(`Error running command: "${command}" in ${cwd}`));     // Verify the error messages were logged.
    expect(errorMsgSpy).toHaveBeenCalledWith(error.message);
  });




  it('5 - should sync all repositories successfully', async () => {
    jest.spyOn(autoSync as any, 'autoSync').mockResolvedValue(Promise.resolve()); // Spy on the private autoSync method and simulate a resolved promise.
    await autoSync['syncRepository']();                                           // Call the syncRepository method.
    expect((autoSync as any)['autoSync']).toHaveBeenCalled();                     // Check that the private autoSync method was indeed called.
  });




  it('6 - should schedule auto sync at specified interval', async () => {

    jest.useFakeTimers();                                                                             // Configure fake timers for scheduling tests.
    const autoSyncSpy = jest.spyOn(autoSync as any, 'autoSync').mockResolvedValue(Promise.resolve()); // Spy on the private autoSync method (which is scheduled).
    const logMsgSpy = jest.spyOn(ConsoleLogger.prototype, 'LogMsg');                                  // Spy on logger to capture schedule message.
    const setIntervalSpy = jest.spyOn(global, 'setInterval');                                         // Spy on setInterval to capture scheduling callback.
    autoSync.scheduleAutoSync(1);                                                                     // Schedule auto sync every 1 second.
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);                          // Verify that setInterval is called with the correct delay.
    const scheduledFn = setIntervalSpy.mock.calls[0][0];                                              // Capture the scheduled function callback.
    await scheduledFn();                                                                              // Manually invoke the scheduled callback.
    expect(autoSyncSpy).toHaveBeenCalled();                                                           // Verify that the scheduled autoSync method was called.
    expect(logMsgSpy).toHaveBeenCalledWith(expect.stringContaining('Scheduling auto sync every 1 seconds.'));     // Verify that a log message for scheduling was produced.
  }, 5000);




  it('7 - should handle upstream branch setup and pull', async () => {
    // Retrieve the repository path for validation.
    const repoPath = autoSync['repoPath'];
    // Spy on logger to capture messages.
    const logMsgSpy = jest.spyOn(ConsoleLogger.prototype, 'LogMsg');
    // Mock execSync implementation to simulate sequence of git commands:
    mockExecSync.mockImplementation((command: string): any => {
      if (command.includes('git remote -v')) { return Buffer.from(''); }
      else if (command.includes('git branch --set-upstream-to=origin/main main')) { throw new Error('fatal: the requested upstream branch \'origin/main\' does not exist'); }
      else if (command.includes('git pull')) { return Buffer.from('Pulled successfully'); }
      else if (command.includes('git status --porcelain')) { return Buffer.from('M newFile.txt'); }
      else if (command.includes('git add .')) { return Buffer.from(''); }
      else if (command.includes('git commit -m')) { return Buffer.from(''); }
      else if (command.includes('git push')) { return Buffer.from(''); }
      return Buffer.from('');
    });
    // Execute syncRepository to simulate complete auto sync process.
    await autoSync.syncRepository();
    // Verify each git command was executed with expected parameters.
    expect(mockExecSync).toHaveBeenCalledWith('git remote -v', { cwd: repoPath, stdio: 'pipe' });
    expect(mockExecSync).toHaveBeenCalledWith('git branch --set-upstream-to=origin/main main', { cwd: repoPath, stdio: 'pipe' });
    expect(mockExecSync).toHaveBeenCalledWith('git pull', { cwd: repoPath, stdio: 'pipe' });
    expect(mockExecSync).toHaveBeenCalledWith('git status --porcelain', { cwd: repoPath, stdio: 'pipe' });
    expect(mockExecSync).toHaveBeenCalledWith('git add .', { cwd: repoPath, stdio: 'pipe' });
    expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('git commit -m'), { cwd: repoPath, stdio: 'pipe' });
    expect(mockExecSync).toHaveBeenCalledWith('git push', { cwd: repoPath, stdio: 'pipe' });
    // Validate that a log message indicating the start of sync was logged.
    expect(logMsgSpy).toHaveBeenCalledWith(expect.stringContaining('Starting auto sync process for repository at:'));
  });




  it('8 - should correctly set and return repository path', () => {
    const expectedRepoPath = '/custom/repo/path';       // Define a custom repository path.
    autoSync.setRepository(expectedRepoPath);           // Use setRepository to update the repoPath.
    const currentRepo = autoSync.GetCurrentRepository();// Call GetCurrentRepository to get the current repo path.
    expect(currentRepo).toBe(expectedRepoPath);         // Validate that it matches the expected value.
  });
});
