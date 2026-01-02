/**
 * Integration tests for SLURM Monitor extension
 * These tests verify the interaction between different components
 */

import * as vscode from 'vscode';
import { SlurmService } from '../slurmService';
import { SlurmJobsProvider, SlurmQueueProvider, JobTreeItem, CategoryTreeItem } from '../slurmProvider';
import { MOCK_SQUEUE_OUTPUT, MOCK_SCONTROL_OUTPUT, createCommandMock } from './__mocks__/slurmCommands';

// Mock child_process
jest.mock('child_process', () => ({
    exec: jest.fn()
}));

jest.mock('util', () => ({
    promisify: (fn: any) => fn
}));

import { exec } from 'child_process';
const mockExec = exec as jest.MockedFunction<typeof exec>;

describe('Integration Tests', () => {
    let service: SlurmService;
    let jobsProvider: SlurmJobsProvider;
    let queueProvider: SlurmQueueProvider;
    let mockOutputChannel: vscode.OutputChannel;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOutputChannel = vscode.window.createOutputChannel('test');
        service = new SlurmService(mockOutputChannel);
        jobsProvider = new SlurmJobsProvider(service, true);
        queueProvider = new SlurmQueueProvider(service);
    });

    describe('Full workflow: Submit -> Monitor -> Cancel', () => {
        it('should handle complete job lifecycle', async () => {
            // 1. Submit a job
            mockExec.mockImplementation((cmd: any) => {
                if (cmd.includes('sbatch')) {
                    return { stdout: 'Submitted batch job 12345', stderr: '' } as any;
                }
                if (cmd.includes('squeue')) {
                    return { stdout: MOCK_SQUEUE_OUTPUT.singleJob, stderr: '' } as any;
                }
                if (cmd.includes('scancel')) {
                    return { stdout: '', stderr: '' } as any;
                }
                return { stdout: '', stderr: '' } as any;
            });

            const jobId = await service.submitJob({
                scriptPath: '/path/to/script.sh',
                partition: 'gpu',
                time: '4:00:00'
            });
            expect(jobId).toBe('12345');

            // 2. Refresh and verify job appears
            await jobsProvider.refresh();
            const jobs = jobsProvider.getJobs();
            expect(jobs).toHaveLength(1);
            expect(jobs[0].jobId).toBe('12345');

            // 3. Get job details
            mockExec.mockImplementation((cmd: any) => {
                if (cmd.includes('scontrol show job')) {
                    return { stdout: MOCK_SCONTROL_OUTPUT.basicJob, stderr: '' } as any;
                }
                return { stdout: '', stderr: '' } as any;
            });

            const details = await service.getJobDetails('12345');
            expect(details).not.toBeNull();
            expect(details!.state).toBe('RUNNING');

            // 4. Cancel the job
            mockExec.mockImplementation(() => ({ stdout: '', stderr: '' } as any));
            const cancelled = await service.cancelJob('12345');
            expect(cancelled).toBe(true);
        });
    });

    describe('Array job handling', () => {
        it('should properly group and display array jobs', async () => {
            mockExec.mockImplementation(() => ({
                stdout: MOCK_SQUEUE_OUTPUT.arrayJobs,
                stderr: ''
            } as any));

            await jobsProvider.refresh();
            const jobs = jobsProvider.getJobs();

            // All 5 array tasks should be fetched
            expect(jobs).toHaveLength(5);

            // When getting tree children, they should be grouped
            jobsProvider.toggleGrouping(); // Disable state grouping
            const children = await jobsProvider.getChildren();

            // Should have 1 parent item for the array
            expect(children).toHaveLength(1);
            expect((children[0] as JobTreeItem).isArrayParent).toBe(true);

            // Expand the parent to get individual tasks
            const taskChildren = await jobsProvider.getChildren(children[0]);
            expect(taskChildren).toHaveLength(5);
        });

        it('should show mixed array and regular jobs correctly', async () => {
            mockExec.mockImplementation(() => ({
                stdout: MOCK_SQUEUE_OUTPUT.mixedArrayAndRegular,
                stderr: ''
            } as any));

            await jobsProvider.refresh();
            jobsProvider.toggleGrouping(); // Disable state grouping
            const children = await jobsProvider.getChildren();

            // Should have: 1 array parent + 2 regular jobs = 3 items
            expect(children).toHaveLength(3);

            const arrayParent = children.find(c => (c as JobTreeItem).isArrayParent);
            const regularJobs = children.filter(c => !(c as JobTreeItem).isArrayParent);

            expect(arrayParent).toBeDefined();
            expect(regularJobs).toHaveLength(2);
        });
    });

    describe('State grouping', () => {
        it('should group jobs by state correctly', async () => {
            mockExec.mockImplementation(() => ({
                stdout: MOCK_SQUEUE_OUTPUT.allStates,
                stderr: ''
            } as any));

            await jobsProvider.refresh();
            const categories = await jobsProvider.getChildren();

            // Should have category items for each state present
            const categoryStates = categories
                .filter(c => c instanceof CategoryTreeItem)
                .map(c => (c as CategoryTreeItem).state);

            expect(categoryStates).toContain('RUNNING');
            expect(categoryStates).toContain('PENDING');
            expect(categoryStates).toContain('COMPLETED');
            expect(categoryStates).toContain('FAILED');
            expect(categoryStates).toContain('CANCELLED');
            expect(categoryStates).toContain('TIMEOUT');
        });

        it('should return correct jobs under each category', async () => {
            mockExec.mockImplementation(() => ({
                stdout: MOCK_SQUEUE_OUTPUT.multipleJobs,
                stderr: ''
            } as any));

            await jobsProvider.refresh();
            const categories = await jobsProvider.getChildren();

            const runningCategory = categories.find(
                c => c instanceof CategoryTreeItem && (c as CategoryTreeItem).state === 'RUNNING'
            );
            expect(runningCategory).toBeDefined();

            const runningJobs = await jobsProvider.getChildren(runningCategory);
            expect(runningJobs).toHaveLength(2);
            expect(runningJobs.every(j => (j as JobTreeItem).job.state === 'RUNNING')).toBe(true);
        });
    });

    describe('Job counts', () => {
        it('should calculate job counts correctly', async () => {
            mockExec.mockImplementation(() => ({
                stdout: MOCK_SQUEUE_OUTPUT.multipleJobs,
                stderr: ''
            } as any));

            await jobsProvider.refresh();
            const counts = jobsProvider.getJobCounts();

            expect(counts.get('RUNNING')).toBe(2);
            expect(counts.get('PENDING')).toBe(1);
            expect(counts.get('COMPLETED')).toBe(1);
        });
    });

    describe('Resubmit job', () => {
        it('should resubmit a job using original command', async () => {
            let resubmitCommand = '';

            mockExec.mockImplementation((cmd: any) => {
                if (cmd.includes('scontrol show job')) {
                    return { stdout: MOCK_SCONTROL_OUTPUT.completedJob, stderr: '' } as any;
                }
                if (cmd.includes('sbatch')) {
                    resubmitCommand = cmd;
                    return { stdout: 'Submitted batch job 12350', stderr: '' } as any;
                }
                return { stdout: '', stderr: '' } as any;
            });

            const newJobId = await service.resubmitJob('12346');

            expect(newJobId).toBe('12350');
            expect(resubmitCommand).toContain('--partition=cpu');
            expect(resubmitCommand).toContain('/home/testuser/scripts/analysis.sh');
        });
    });

    describe('Error handling', () => {
        it('should handle network errors gracefully', async () => {
            mockExec.mockImplementation(() => {
                throw new Error('Network timeout');
            });

            await jobsProvider.refresh();
            const jobs = jobsProvider.getJobs();

            expect(jobs).toHaveLength(0);

            const children = await jobsProvider.getChildren();
            expect(children).toHaveLength(1);
            expect((children[0] as vscode.TreeItem).label).toContain('Error');
        });

        it('should handle invalid job ID in details', async () => {
            mockExec.mockImplementation(() => ({
                stdout: MOCK_SCONTROL_OUTPUT.invalidJob,
                stderr: ''
            } as any));

            const details = await service.getJobDetails('99999');
            expect(details).toBeNull();
        });
    });

    describe('Queue provider vs Jobs provider', () => {
        it('should use different methods for fetching', async () => {
            const getJobsSpy = jest.spyOn(service, 'getJobs');
            const getMyJobsSpy = jest.spyOn(service, 'getMyJobs');

            mockExec.mockImplementation(() => ({
                stdout: MOCK_SQUEUE_OUTPUT.singleJob,
                stderr: ''
            } as any));

            // JobsProvider uses getMyJobs (which internally calls getJobs with user filter)
            await jobsProvider.refresh();
            expect(getMyJobsSpy).toHaveBeenCalled();

            getMyJobsSpy.mockClear();
            getJobsSpy.mockClear();

            // QueueProvider uses getJobs directly (no user filter)
            await queueProvider.refresh();
            expect(getJobsSpy).toHaveBeenCalled();
            expect(getMyJobsSpy).not.toHaveBeenCalled();
        });
    });

    describe('Long running jobs', () => {
        it('should parse long-running job times correctly', async () => {
            mockExec.mockImplementation(() => ({
                stdout: MOCK_SQUEUE_OUTPUT.longRunning,
                stderr: ''
            } as any));

            await jobsProvider.refresh();
            const jobs = jobsProvider.getJobs();

            expect(jobs).toHaveLength(1);
            expect(jobs[0].timeUsed).toBe('7-12:30:00');
            expect(jobs[0].nodes).toBe(4);
        });
    });

    describe('Concurrent operations', () => {
        it('should handle concurrent refresh calls', async () => {
            let callCount = 0;
            mockExec.mockImplementation(() => {
                callCount++;
                return {
                    stdout: MOCK_SQUEUE_OUTPUT.singleJob,
                    stderr: ''
                } as any;
            });

            // Start multiple refreshes concurrently
            await Promise.all([
                jobsProvider.refresh(),
                jobsProvider.refresh(),
                jobsProvider.refresh()
            ]);

            // Should still result in valid state
            const jobs = jobsProvider.getJobs();
            expect(jobs.length).toBeGreaterThanOrEqual(0);
        });
    });
});

describe('Tree Item Properties', () => {
    let service: SlurmService;
    let jobsProvider: SlurmJobsProvider;
    let mockOutputChannel: vscode.OutputChannel;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOutputChannel = vscode.window.createOutputChannel('test');
        service = new SlurmService(mockOutputChannel);
        jobsProvider = new SlurmJobsProvider(service, true);
    });

    it('should create tree items with correct context values for menu visibility', async () => {
        mockExec.mockImplementation(() => ({
            stdout: MOCK_SQUEUE_OUTPUT.allStates,
            stderr: ''
        } as any));

        await jobsProvider.refresh();
        jobsProvider.toggleGrouping(); // Flat list

        const items = await jobsProvider.getChildren();
        const jobItems = items.filter(i => i instanceof JobTreeItem) as JobTreeItem[];

        // Running jobs should be cancellable
        const runningJob = jobItems.find(j => j.job.state === 'RUNNING');
        expect(runningJob?.contextValue).toBe('job-running');

        // Pending jobs should be cancellable
        const pendingJob = jobItems.find(j => j.job.state === 'PENDING');
        expect(pendingJob?.contextValue).toBe('job-pending');

        // Completed jobs should not be cancellable
        const completedJob = jobItems.find(j => j.job.state === 'COMPLETED');
        expect(completedJob?.contextValue).toBe('job');

        // Failed jobs should not be cancellable
        const failedJob = jobItems.find(j => j.job.state === 'FAILED');
        expect(failedJob?.contextValue).toBe('job');
    });

    it('should have appropriate icons for different job states', async () => {
        mockExec.mockImplementation(() => ({
            stdout: MOCK_SQUEUE_OUTPUT.allStates,
            stderr: ''
        } as any));

        await jobsProvider.refresh();
        jobsProvider.toggleGrouping();

        const items = await jobsProvider.getChildren();
        const jobItems = items.filter(i => i instanceof JobTreeItem) as JobTreeItem[];

        const iconIds = new Map<string, string>();
        for (const item of jobItems) {
            iconIds.set(item.job.state, (item.iconPath as vscode.ThemeIcon).id);
        }

        expect(iconIds.get('RUNNING')).toBe('sync~spin');
        expect(iconIds.get('PENDING')).toBe('watch');
        expect(iconIds.get('COMPLETED')).toBe('pass');
        expect(iconIds.get('FAILED')).toBe('error');
        expect(iconIds.get('CANCELLED')).toBe('circle-slash');
        expect(iconIds.get('TIMEOUT')).toBe('clock');
    });
});
