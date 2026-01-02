/**
 * Unit tests for SlurmProvider (Tree Data Providers)
 */

import * as vscode from 'vscode';
import { JobTreeItem, CategoryTreeItem, SlurmJobsProvider, SlurmQueueProvider, JobHistoryProvider } from '../slurmProvider';
import { SlurmJob, JobState } from '../types';

// Mock SlurmService
const mockSlurmService = {
    getMyJobs: jest.fn(),
    getJobs: jest.fn(),
    getJobDetails: jest.fn(),
    cancelJob: jest.fn(),
    submitJob: jest.fn(),
    resubmitJob: jest.fn(),
    getClusterInfo: jest.fn(),
    getJobHistory: jest.fn(),
    getConfig: jest.fn().mockReturnValue({
        refreshInterval: 30,
        autoRefresh: true,
        sshHost: '',
        sshUser: '',
        sshKeyPath: '',
        squeueFormat: '%i|%j|%P|%T|%M|%l|%D|%R|%S|%e',
        showAllUsers: false,
        partitionFilter: [],
        maxJobsDisplayed: 100
    })
};

// Sample job data
const createMockJob = (overrides: Partial<SlurmJob> = {}): SlurmJob => ({
    jobId: '12345',
    name: 'test_job',
    partition: 'gpu',
    state: 'RUNNING',
    stateRaw: 'R',
    timeUsed: '01:30:00',
    timeLimit: '04:00:00',
    nodes: 1,
    nodelist: 'node01',
    startTime: '2024-01-15T10:00:00',
    endTime: 'N/A',
    ...overrides
});

describe('JobTreeItem', () => {
    describe('constructor', () => {
        it('should create a tree item with correct properties', () => {
            const job = createMockJob();
            const item = new JobTreeItem(job);

            expect(item.label).toBe('test_job');
            expect(item.id).toBe('12345');
            expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
        });

        it('should use jobId as label when name is empty', () => {
            const job = createMockJob({ name: '' });
            const item = new JobTreeItem(job);

            expect(item.label).toBe('12345');
        });
    });

    describe('description', () => {
        it('should include job ID, partition, and state', () => {
            const job = createMockJob();
            const item = new JobTreeItem(job);

            expect(item.description).toContain('12345');
            expect(item.description).toContain('gpu');
            expect(item.description).toContain('R');
        });

        it('should include elapsed time for running jobs', () => {
            const job = createMockJob({ state: 'RUNNING', timeUsed: '02:30:00' });
            const item = new JobTreeItem(job);

            expect(item.description).toContain('02:30:00');
        });

        it('should not include elapsed time for pending jobs', () => {
            const job = createMockJob({ state: 'PENDING', stateRaw: 'PD', timeUsed: '0:00' });
            const item = new JobTreeItem(job);

            expect(item.description).not.toContain('0:00');
        });
    });

    describe('contextValue', () => {
        it('should return "job-running" for running jobs', () => {
            const job = createMockJob({ state: 'RUNNING' });
            const item = new JobTreeItem(job);

            expect(item.contextValue).toBe('job-running');
        });

        it('should return "job-pending" for pending jobs', () => {
            const job = createMockJob({ state: 'PENDING' });
            const item = new JobTreeItem(job);

            expect(item.contextValue).toBe('job-pending');
        });

        it('should return "job" for completed jobs', () => {
            const job = createMockJob({ state: 'COMPLETED' });
            const item = new JobTreeItem(job);

            expect(item.contextValue).toBe('job');
        });

        it('should return "job" for failed jobs', () => {
            const job = createMockJob({ state: 'FAILED' });
            const item = new JobTreeItem(job);

            expect(item.contextValue).toBe('job');
        });
    });

    describe('icon', () => {
        it('should have sync icon for running jobs', () => {
            const job = createMockJob({ state: 'RUNNING' });
            const item = new JobTreeItem(job);

            expect((item.iconPath as vscode.ThemeIcon).id).toBe('sync~spin');
        });

        it('should have watch icon for pending jobs', () => {
            const job = createMockJob({ state: 'PENDING' });
            const item = new JobTreeItem(job);

            expect((item.iconPath as vscode.ThemeIcon).id).toBe('watch');
        });

        it('should have pass icon for completed jobs', () => {
            const job = createMockJob({ state: 'COMPLETED' });
            const item = new JobTreeItem(job);

            expect((item.iconPath as vscode.ThemeIcon).id).toBe('pass');
        });

        it('should have error icon for failed jobs', () => {
            const job = createMockJob({ state: 'FAILED' });
            const item = new JobTreeItem(job);

            expect((item.iconPath as vscode.ThemeIcon).id).toBe('error');
        });
    });

    describe('tooltip', () => {
        it('should include job details in tooltip', () => {
            const job = createMockJob();
            const item = new JobTreeItem(job);

            const tooltipValue = (item.tooltip as vscode.MarkdownString).value;
            expect(tooltipValue).toContain('test_job');
            expect(tooltipValue).toContain('12345');
            expect(tooltipValue).toContain('RUNNING');
            expect(tooltipValue).toContain('gpu');
        });
    });

    describe('array job parent', () => {
        it('should create collapsible parent for array jobs', () => {
            const parentJob = createMockJob({ arrayJobId: '12345' });
            const tasks = [
                createMockJob({ jobId: '12345_1', state: 'RUNNING' }),
                createMockJob({ jobId: '12345_2', state: 'RUNNING' }),
                createMockJob({ jobId: '12345_3', state: 'PENDING' })
            ];

            const item = new JobTreeItem(
                parentJob,
                vscode.TreeItemCollapsibleState.Collapsed,
                true,
                tasks
            );

            expect(item.isArrayParent).toBe(true);
            expect(item.arrayTasks).toHaveLength(3);
            expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
            expect(item.id).toBe('array-12345');
        });

        it('should show task count in description for array parents', () => {
            const parentJob = createMockJob({ arrayJobId: '12345' });
            const tasks = [
                createMockJob({ jobId: '12345_1', state: 'RUNNING' }),
                createMockJob({ jobId: '12345_2', state: 'PENDING' })
            ];

            const item = new JobTreeItem(
                parentJob,
                vscode.TreeItemCollapsibleState.Collapsed,
                true,
                tasks
            );

            expect(item.description).toContain('2 tasks');
        });

        it('should show state summary for array parents', () => {
            const parentJob = createMockJob({ arrayJobId: '12345' });
            const tasks = [
                createMockJob({ jobId: '12345_1', state: 'RUNNING' }),
                createMockJob({ jobId: '12345_2', state: 'RUNNING' }),
                createMockJob({ jobId: '12345_3', state: 'PENDING' })
            ];

            const item = new JobTreeItem(
                parentJob,
                vscode.TreeItemCollapsibleState.Collapsed,
                true,
                tasks
            );

            // Should contain state counts like "2R/1P"
            expect(item.description).toMatch(/\d+R/);
        });

        it('should return array-job-cancellable context when tasks are cancellable', () => {
            const parentJob = createMockJob({ arrayJobId: '12345' });
            const tasks = [
                createMockJob({ jobId: '12345_1', state: 'RUNNING' }),
                createMockJob({ jobId: '12345_2', state: 'PENDING' })
            ];

            const item = new JobTreeItem(
                parentJob,
                vscode.TreeItemCollapsibleState.Collapsed,
                true,
                tasks
            );

            expect(item.contextValue).toBe('array-job-cancellable');
        });

        it('should return array-job context when no tasks are cancellable', () => {
            const parentJob = createMockJob({ arrayJobId: '12345' });
            const tasks = [
                createMockJob({ jobId: '12345_1', state: 'COMPLETED' }),
                createMockJob({ jobId: '12345_2', state: 'FAILED' })
            ];

            const item = new JobTreeItem(
                parentJob,
                vscode.TreeItemCollapsibleState.Collapsed,
                true,
                tasks
            );

            expect(item.contextValue).toBe('array-job');
        });
    });
});

describe('CategoryTreeItem', () => {
    it('should create category with correct label and count', () => {
        const category = new CategoryTreeItem('RUNNING', 5);

        expect(category.label).toBe('Running');
        expect(category.state).toBe('RUNNING');
        expect(category.description).toBe('(5)');
    });

    it('should have appropriate icons for different states', () => {
        const runningCategory = new CategoryTreeItem('RUNNING', 1);
        const pendingCategory = new CategoryTreeItem('PENDING', 1);
        const failedCategory = new CategoryTreeItem('FAILED', 1);

        expect((runningCategory.iconPath as vscode.ThemeIcon).id).toBe('play-circle');
        expect((pendingCategory.iconPath as vscode.ThemeIcon).id).toBe('clock');
        expect((failedCategory.iconPath as vscode.ThemeIcon).id).toBe('error');
    });
});

describe('SlurmJobsProvider', () => {
    let provider: SlurmJobsProvider;

    beforeEach(() => {
        jest.clearAllMocks();
        provider = new SlurmJobsProvider(mockSlurmService as any, true);
    });

    describe('refresh', () => {
        it('should fetch jobs and update internal state', async () => {
            const jobs = [
                createMockJob({ jobId: '1', state: 'RUNNING' }),
                createMockJob({ jobId: '2', state: 'PENDING' })
            ];
            mockSlurmService.getMyJobs.mockResolvedValue(jobs);

            await provider.refresh();

            expect(mockSlurmService.getMyJobs).toHaveBeenCalled();
            expect(provider.getJobs()).toHaveLength(2);
        });

        it('should handle errors gracefully', async () => {
            mockSlurmService.getMyJobs.mockRejectedValue(new Error('Connection failed'));

            await provider.refresh();

            expect(provider.getJobs()).toHaveLength(0);
        });
    });

    describe('getJobCounts', () => {
        it('should count jobs by state', async () => {
            const jobs = [
                createMockJob({ jobId: '1', state: 'RUNNING' }),
                createMockJob({ jobId: '2', state: 'RUNNING' }),
                createMockJob({ jobId: '3', state: 'PENDING' }),
                createMockJob({ jobId: '4', state: 'COMPLETED' })
            ];
            mockSlurmService.getMyJobs.mockResolvedValue(jobs);

            await provider.refresh();
            const counts = provider.getJobCounts();

            expect(counts.get('RUNNING')).toBe(2);
            expect(counts.get('PENDING')).toBe(1);
            expect(counts.get('COMPLETED')).toBe(1);
        });
    });

    describe('getChildren', () => {
        it('should return loading item while loading', async () => {
            // Don't await refresh to test loading state
            mockSlurmService.getMyJobs.mockImplementation(() => new Promise(() => {}));
            provider.refresh(); // Start loading but don't await

            const children = await provider.getChildren();

            expect(children).toHaveLength(1);
            expect((children[0] as vscode.TreeItem).label).toBe('Loading...');
        });

        it('should return "No jobs found" when empty', async () => {
            mockSlurmService.getMyJobs.mockResolvedValue([]);

            await provider.refresh();
            const children = await provider.getChildren();

            expect(children).toHaveLength(1);
            expect((children[0] as vscode.TreeItem).label).toBe('No jobs found');
        });

        it('should return category items when grouping is enabled', async () => {
            const jobs = [
                createMockJob({ jobId: '1', state: 'RUNNING' }),
                createMockJob({ jobId: '2', state: 'PENDING' })
            ];
            mockSlurmService.getMyJobs.mockResolvedValue(jobs);

            await provider.refresh();
            const children = await provider.getChildren();

            expect(children.some(c => c instanceof CategoryTreeItem)).toBe(true);
        });

        it('should return job items for category children', async () => {
            const jobs = [
                createMockJob({ jobId: '1', state: 'RUNNING' }),
                createMockJob({ jobId: '2', state: 'RUNNING' })
            ];
            mockSlurmService.getMyJobs.mockResolvedValue(jobs);

            await provider.refresh();
            const categories = await provider.getChildren();
            const runningCategory = categories.find(
                c => c instanceof CategoryTreeItem && c.state === 'RUNNING'
            );

            const categoryChildren = await provider.getChildren(runningCategory);

            expect(categoryChildren).toHaveLength(2);
            expect(categoryChildren.every(c => c instanceof JobTreeItem)).toBe(true);
        });

        it('should group array jobs under parent', async () => {
            const jobs = [
                createMockJob({ jobId: '12345_1', state: 'RUNNING' }),
                createMockJob({ jobId: '12345_2', state: 'RUNNING' }),
                createMockJob({ jobId: '12345_3', state: 'PENDING' }),
                createMockJob({ jobId: '12346', state: 'RUNNING' }) // Regular job
            ];
            mockSlurmService.getMyJobs.mockResolvedValue(jobs);

            await provider.refresh();
            provider.toggleGrouping(); // Disable state grouping to see flat list
            const children = await provider.getChildren();

            // Should have 2 items: array parent + regular job
            const arrayParent = children.find(c => c instanceof JobTreeItem && (c as JobTreeItem).isArrayParent);
            expect(arrayParent).toBeDefined();

            // Expand array parent
            const arrayChildren = await provider.getChildren(arrayParent);
            expect(arrayChildren).toHaveLength(3);
        });

        it('should not group single array task', async () => {
            const jobs = [
                createMockJob({ jobId: '12345_1', state: 'RUNNING' })
            ];
            mockSlurmService.getMyJobs.mockResolvedValue(jobs);

            await provider.refresh();
            provider.toggleGrouping(); // Disable state grouping
            const children = await provider.getChildren();

            // Single task should appear as regular job, not grouped
            expect(children).toHaveLength(1);
            expect((children[0] as JobTreeItem).isArrayParent).toBe(false);
        });
    });

    describe('toggleGrouping', () => {
        it('should toggle groupByState flag', async () => {
            const jobs = [createMockJob()];
            mockSlurmService.getMyJobs.mockResolvedValue(jobs);
            await provider.refresh();

            // Initially grouped
            let children = await provider.getChildren();
            expect(children.some(c => c instanceof CategoryTreeItem)).toBe(true);

            // Toggle off
            provider.toggleGrouping();
            children = await provider.getChildren();
            expect(children.every(c => c instanceof JobTreeItem)).toBe(true);
        });
    });

    describe('toggleArrayGrouping', () => {
        it('should toggle array job grouping', async () => {
            const jobs = [
                createMockJob({ jobId: '12345_1', state: 'RUNNING' }),
                createMockJob({ jobId: '12345_2', state: 'RUNNING' })
            ];
            mockSlurmService.getMyJobs.mockResolvedValue(jobs);
            await provider.refresh();
            provider.toggleGrouping(); // Disable state grouping first

            // Initially grouped
            let children = await provider.getChildren();
            expect(children.some(c => (c as JobTreeItem).isArrayParent)).toBe(true);

            // Toggle array grouping off
            provider.toggleArrayGrouping();
            children = await provider.getChildren();
            expect(children.every(c => !(c as JobTreeItem).isArrayParent)).toBe(true);
            expect(children).toHaveLength(2);
        });
    });
});

describe('SlurmQueueProvider', () => {
    it('should fetch all jobs (not just my jobs)', async () => {
        const provider = new SlurmQueueProvider(mockSlurmService as any);
        const jobs = [createMockJob()];
        mockSlurmService.getJobs.mockResolvedValue(jobs);

        await provider.refresh();

        // SlurmQueueProvider uses getJobs (showOnlyMyJobs=false)
        expect(mockSlurmService.getJobs).toHaveBeenCalled();
        expect(provider.getJobs()).toHaveLength(1);
    });
});

describe('SlurmJobsProvider filters', () => {
    let provider: SlurmJobsProvider;

    beforeEach(() => {
        jest.clearAllMocks();
        provider = new SlurmJobsProvider(mockSlurmService as any, true);
    });

    it('should pass filter to service when refreshing', async () => {
        const filter = { partition: ['gpu'], state: ['RUNNING' as const] };
        provider.setFilter(filter);
        mockSlurmService.getMyJobs.mockResolvedValue([]);

        await provider.refresh();

        expect(mockSlurmService.getMyJobs).toHaveBeenCalledWith(
            expect.objectContaining({ partition: ['gpu'], state: ['RUNNING'] })
        );
    });

    it('should clear filter when empty object is set', async () => {
        provider.setFilter({ partition: ['gpu'] });
        mockSlurmService.getMyJobs.mockResolvedValue([]);
        await provider.refresh();

        provider.setFilter({});
        await provider.refresh();

        expect(mockSlurmService.getMyJobs).toHaveBeenLastCalledWith({});
    });
});

describe('JobHistoryProvider', () => {
    let provider: JobHistoryProvider;

    const createMockHistoryEntry = (overrides: Partial<any> = {}) => ({
        jobId: '12345',
        name: 'history_job',
        partition: 'gpu',
        state: 'COMPLETED',
        stateRaw: 'CD',
        timeUsed: '01:30:00',
        timeLimit: '04:00:00',
        nodes: 1,
        nodelist: 'node01',
        startTime: '2024-01-15T10:00:00',
        endTime: '2024-01-15T11:30:00',
        elapsed: '01:30:00',
        maxRSS: '4G',
        maxVMSize: '8G',
        cpuTime: '01:25:00',
        exitCode: '0:0',
        ...overrides
    });

    beforeEach(() => {
        jest.clearAllMocks();
        provider = new JobHistoryProvider(mockSlurmService as any);
    });

    describe('refresh', () => {
        it('should fetch job history and update internal state', async () => {
            const historyJobs = [
                createMockHistoryEntry({ jobId: '1' }),
                createMockHistoryEntry({ jobId: '2' })
            ];
            mockSlurmService.getJobHistory.mockResolvedValue(historyJobs);

            await provider.refresh();

            expect(mockSlurmService.getJobHistory).toHaveBeenCalledWith(100); // Default limit
        });

        it('should use custom limit when set', async () => {
            mockSlurmService.getJobHistory.mockResolvedValue([]);
            provider.setLimit(50);

            await provider.refresh();

            expect(mockSlurmService.getJobHistory).toHaveBeenCalledWith(50);
        });

        it('should handle errors gracefully', async () => {
            mockSlurmService.getJobHistory.mockRejectedValue(new Error('Connection failed'));

            await provider.refresh();
            const children = await provider.getChildren();

            expect(children).toHaveLength(1);
            expect((children[0] as vscode.TreeItem).label).toContain('Error');
        });
    });

    describe('getChildren', () => {
        it('should return loading item while loading', async () => {
            mockSlurmService.getJobHistory.mockImplementation(() => new Promise(() => {}));
            provider.refresh(); // Start loading but don't await

            const children = await provider.getChildren();

            expect(children).toHaveLength(1);
            expect((children[0] as vscode.TreeItem).label).toBe('Loading history...');
        });

        it('should return "No jobs" message when empty', async () => {
            mockSlurmService.getJobHistory.mockResolvedValue([]);

            await provider.refresh();
            const children = await provider.getChildren();

            expect(children).toHaveLength(1);
            expect((children[0] as vscode.TreeItem).label).toContain('No jobs');
        });

        it('should return tree items for history entries', async () => {
            const historyJobs = [
                createMockHistoryEntry({ jobId: '1', name: 'job1', state: 'COMPLETED' }),
                createMockHistoryEntry({ jobId: '2', name: 'job2', state: 'FAILED' })
            ];
            mockSlurmService.getJobHistory.mockResolvedValue(historyJobs);

            await provider.refresh();
            const children = await provider.getChildren();

            expect(children).toHaveLength(2);
            expect((children[0] as vscode.TreeItem).label).toBe('job1');
            expect((children[1] as vscode.TreeItem).label).toBe('job2');
        });

        it('should use jobId as label when name is empty', async () => {
            const historyJobs = [
                createMockHistoryEntry({ jobId: '12345', name: '' })
            ];
            mockSlurmService.getJobHistory.mockResolvedValue(historyJobs);

            await provider.refresh();
            const children = await provider.getChildren();

            expect((children[0] as vscode.TreeItem).label).toBe('12345');
        });

        it('should include job details in description', async () => {
            const historyJobs = [
                createMockHistoryEntry({
                    jobId: '123',
                    partition: 'gpu',
                    stateRaw: 'CD',
                    elapsed: '02:00:00'
                })
            ];
            mockSlurmService.getJobHistory.mockResolvedValue(historyJobs);

            await provider.refresh();
            const children = await provider.getChildren();

            const description = (children[0] as vscode.TreeItem).description as string;
            expect(description).toContain('123');
            expect(description).toContain('gpu');
            expect(description).toContain('CD');
            expect(description).toContain('02:00:00');
        });

        it('should have correct context value for history jobs', async () => {
            const historyJobs = [createMockHistoryEntry()];
            mockSlurmService.getJobHistory.mockResolvedValue(historyJobs);

            await provider.refresh();
            const children = await provider.getChildren();

            expect((children[0] as vscode.TreeItem).contextValue).toBe('history-job');
        });

        it('should have appropriate icons for different states', async () => {
            const historyJobs = [
                createMockHistoryEntry({ jobId: '1', state: 'COMPLETED' }),
                createMockHistoryEntry({ jobId: '2', state: 'FAILED' }),
                createMockHistoryEntry({ jobId: '3', state: 'CANCELLED' })
            ];
            mockSlurmService.getJobHistory.mockResolvedValue(historyJobs);

            await provider.refresh();
            const children = await provider.getChildren();

            expect((children[0].iconPath as vscode.ThemeIcon).id).toBe('pass');
            expect((children[1].iconPath as vscode.ThemeIcon).id).toBe('error');
            expect((children[2].iconPath as vscode.ThemeIcon).id).toBe('circle-slash');
        });

        it('should include tooltip with job details', async () => {
            const historyJobs = [
                createMockHistoryEntry({
                    name: 'test_job',
                    jobId: '12345',
                    state: 'COMPLETED',
                    partition: 'gpu',
                    elapsed: '01:30:00',
                    exitCode: '0:0',
                    maxRSS: '4G'
                })
            ];
            mockSlurmService.getJobHistory.mockResolvedValue(historyJobs);

            await provider.refresh();
            const children = await provider.getChildren();

            const tooltipValue = (children[0].tooltip as vscode.MarkdownString).value;
            expect(tooltipValue).toContain('test_job');
            expect(tooltipValue).toContain('12345');
            expect(tooltipValue).toContain('COMPLETED');
            expect(tooltipValue).toContain('gpu');
            expect(tooltipValue).toContain('Exit Code');
            expect(tooltipValue).toContain('Max Memory');
        });

        it('should return empty array for child elements', async () => {
            const historyJobs = [createMockHistoryEntry()];
            mockSlurmService.getJobHistory.mockResolvedValue(historyJobs);

            await provider.refresh();
            const children = await provider.getChildren();
            const grandChildren = await provider.getChildren(children[0]);

            expect(grandChildren).toHaveLength(0);
        });
    });

    describe('setLimit', () => {
        it('should update the limit parameter', async () => {
            mockSlurmService.getJobHistory.mockResolvedValue([]);

            provider.setLimit(25);
            await provider.refresh();

            expect(mockSlurmService.getJobHistory).toHaveBeenCalledWith(25);
        });
    });
});
