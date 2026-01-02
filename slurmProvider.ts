import * as vscode from 'vscode';
import { SlurmService } from './slurmService';
import { SlurmJob, JobState, JobFilter, JobHistoryEntry } from './types';

const ICONS: Record<string, string> = {
    RUNNING: 'sync~spin', PENDING: 'watch', COMPLETED: 'pass', FAILED: 'error',
    CANCELLED: 'circle-slash', TIMEOUT: 'clock', OUT_OF_MEMORY: 'warning',
    NODE_FAIL: 'flame', COMPLETING: 'loading~spin', SUSPENDED: 'debug-pause', PREEMPTED: 'zap'
};

const EMOJIS: Record<string, string> = {
    RUNNING: '🟢', PENDING: '🟡', COMPLETED: '✅', FAILED: '❌', CANCELLED: '⛔',
    TIMEOUT: '⏰', OUT_OF_MEMORY: '💾', NODE_FAIL: '🔥', COMPLETING: '🔄', SUSPENDED: '⏸️', PREEMPTED: '⚡'
};

export class JobTreeItem extends vscode.TreeItem {
    constructor(
        public readonly job: SlurmJob,
        collapsibleState = vscode.TreeItemCollapsibleState.None,
        public readonly isArrayParent = false,
        public readonly arrayTasks: SlurmJob[] = []
    ) {
        super(job.name || job.jobId, collapsibleState);
        this.id = isArrayParent ? `array-${job.arrayJobId || job.jobId}` : job.jobId;
        this.iconPath = new vscode.ThemeIcon(this.getIconId());
        this.contextValue = this.getContextValue();
        this.description = this.getDescription();
        this.tooltip = this.getTooltip();
    }

    private getStateCounts(): Record<string, number> {
        return this.arrayTasks.reduce((acc, t) => ({ ...acc, [t.state]: (acc[t.state] || 0) + 1 }), {} as Record<string, number>);
    }

    private getIconId(): string {
        if (!this.isArrayParent) return ICONS[this.job.state] || 'question';
        const counts = this.getStateCounts();
        if (counts['RUNNING']) return 'layers-active';
        if (counts['PENDING']) return 'layers';
        if (counts['FAILED'] || counts['NODE_FAIL']) return 'layers-dot';
        return 'layers';
    }

    private getContextValue(): string {
        if (this.isArrayParent) {
            return this.arrayTasks.some(t => t.state === 'RUNNING' || t.state === 'PENDING') ? 'array-job-cancellable' : 'array-job';
        }
        return (this.job.state === 'RUNNING' || this.job.state === 'PENDING') ? `job-${this.job.state.toLowerCase()}` : 'job';
    }

    private getDescription(): string {
        if (this.isArrayParent) {
            const counts = this.getStateCounts();
            const stateStr = Object.entries(counts).map(([s, c]) => `${c}${s[0]}`).join('/');
            return `[${this.job.arrayJobId || this.job.jobId.split('_')[0]}] ${this.arrayTasks.length} tasks | ${stateStr}`;
        }
        const parts = [this.job.jobId, this.job.partition, this.job.stateRaw].filter(Boolean);
        if (this.job.state === 'RUNNING' && this.job.timeUsed) parts.push(this.job.timeUsed);
        return parts.join(' | ');
    }

    private getTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        if (this.isArrayParent) {
            const counts = this.getStateCounts();
            md.appendMarkdown(`## Array: ${this.job.name}\n\n**Tasks:** ${this.arrayTasks.length}\n\n`);
            md.appendMarkdown(`| State | Count |\n|:---|---:|\n`);
            Object.entries(counts).forEach(([s, c]) => md.appendMarkdown(`| ${s} | ${c} |\n`));
        } else {
            const rows = [
                ['Job ID', this.job.jobId], ['State', `${EMOJIS[this.job.state] || '❓'} ${this.job.state}`],
                ['Partition', this.job.partition], ['Nodes', this.job.nodes], ['Time', this.job.timeUsed || 'N/A'],
                ['Limit', this.job.timeLimit || 'N/A']
            ];
            if (this.job.arrayTaskId) rows.push(['Array Task', this.job.arrayTaskId]);
            if (this.job.state === 'RUNNING') rows.push(['Node List', this.job.nodelist], ['Start', this.job.startTime]);
            else if (this.job.state === 'PENDING') rows.push(['Reason', this.job.nodelist]);
            md.appendMarkdown(`## ${this.job.name}\n\n| | |\n|:--|:--|\n`);
            rows.forEach(([k, v]) => md.appendMarkdown(`| **${k}** | ${v} |\n`));
        }
        return md;
    }
}

export class CategoryTreeItem extends vscode.TreeItem {
    constructor(public readonly state: JobState, count: number) {
        super(state.charAt(0) + state.slice(1).toLowerCase(), vscode.TreeItemCollapsibleState.Expanded);
        this.description = `(${count})`;
        this.contextValue = 'category';
        const icons: Record<string, string> = { RUNNING: 'play-circle', PENDING: 'clock', COMPLETED: 'check-all', FAILED: 'error', CANCELLED: 'circle-slash' };
        this.iconPath = new vscode.ThemeIcon(icons[state] || 'symbol-misc');
    }
}

export class SlurmJobsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private jobs: SlurmJob[] = [];
    private groupByState = true;
    private groupArrayJobs = true;
    private lastError: string | null = null;
    private isLoading = false;
    private filter: JobFilter = {};

    constructor(private readonly slurmService: SlurmService, private readonly showOnlyMyJobs = true) {}

    toggleGrouping(): void { this.groupByState = !this.groupByState; this._onDidChangeTreeData.fire(); }
    toggleArrayGrouping(): void { this.groupArrayJobs = !this.groupArrayJobs; this._onDidChangeTreeData.fire(); }
    getJobs(): SlurmJob[] { return this.jobs; }
    getJobCounts(): Map<JobState, number> {
        return this.jobs.reduce((m, j) => m.set(j.state, (m.get(j.state) || 0) + 1), new Map<JobState, number>());
    }

    setFilter(filter: JobFilter): void {
        this.filter = filter;
    }

    async refresh(): Promise<void> {
        this.isLoading = true;
        this._onDidChangeTreeData.fire();
        try {
            const baseFilter = { ...this.filter };
            this.jobs = await (this.showOnlyMyJobs ? this.slurmService.getMyJobs(baseFilter) : this.slurmService.getJobs(baseFilter));
            this.lastError = null;
        } catch (e: any) {
            this.lastError = e.message;
            this.jobs = [];
        }
        this.isLoading = false;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (this.isLoading) {
            const item = new vscode.TreeItem('Loading...');
            item.iconPath = new vscode.ThemeIcon('loading~spin');
            return [item];
        }
        if (this.lastError) {
            const item = new vscode.TreeItem(`Error: ${this.lastError}`);
            item.iconPath = new vscode.ThemeIcon('error');
            return [item];
        }
        if (!element) {
            if (!this.jobs.length) {
                const item = new vscode.TreeItem('No jobs found');
                item.iconPath = new vscode.ThemeIcon('info');
                return [item];
            }
            return this.groupByState ? this.getCategoryItems() : this.getJobItems(this.jobs);
        }
        if (element instanceof JobTreeItem && element.isArrayParent) {
            return element.arrayTasks.map(t => new JobTreeItem(t));
        }
        if (element instanceof CategoryTreeItem) {
            return this.getJobItems(this.jobs.filter(j => j.state === element.state));
        }
        return [];
    }

    private getJobItems(jobs: SlurmJob[]): JobTreeItem[] {
        if (!this.groupArrayJobs) return jobs.map(j => new JobTreeItem(j));

        const groups = new Map<string, SlurmJob[]>();
        const regular: SlurmJob[] = [];

        for (const job of jobs) {
            const arrayId = job.jobId.includes('_') ? job.jobId.split('_')[0] : job.arrayJobId;
            if (arrayId) {
                if (!groups.has(arrayId)) groups.set(arrayId, []);
                groups.get(arrayId)!.push(job);
            } else {
                regular.push(job);
            }
        }

        const items: JobTreeItem[] = [];
        for (const [id, tasks] of groups) {
            if (tasks.length === 1) {
                items.push(new JobTreeItem(tasks[0]));
            } else {
                items.push(new JobTreeItem({ ...tasks[0], arrayJobId: id }, vscode.TreeItemCollapsibleState.Collapsed, true, tasks));
            }
        }
        return [...items, ...regular.map(j => new JobTreeItem(j))];
    }

    private getCategoryItems(): CategoryTreeItem[] {
        const counts = this.getJobCounts();
        const order: JobState[] = ['RUNNING', 'PENDING', 'COMPLETING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT'];
        const items = order.filter(s => counts.get(s)).map(s => new CategoryTreeItem(s, counts.get(s)!));

        const otherCount = Array.from(counts.entries())
            .filter(([s]) => !order.includes(s))
            .reduce((sum, [, c]) => sum + c, 0);
        if (otherCount > 0) items.push(new CategoryTreeItem('OTHER' as JobState, otherCount));

        return items;
    }
}

export class SlurmQueueProvider extends SlurmJobsProvider {
    constructor(slurmService: SlurmService) { super(slurmService, false); }
}

// Feature 12: Job History Provider
export class JobHistoryProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private jobs: JobHistoryEntry[] = [];
    private lastError: string | null = null;
    private isLoading = false;
    private limit = 100;

    constructor(private readonly slurmService: SlurmService) {}

    setLimit(limit: number): void { this.limit = limit; }

    async refresh(): Promise<void> {
        this.isLoading = true;
        this._onDidChangeTreeData.fire();
        try {
            this.jobs = await this.slurmService.getJobHistory(this.limit);
            this.lastError = null;
        } catch (e: any) {
            this.lastError = e.message;
            this.jobs = [];
        }
        this.isLoading = false;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element) return [];

        if (this.isLoading) {
            const item = new vscode.TreeItem('Loading history...');
            item.iconPath = new vscode.ThemeIcon('loading~spin');
            return [item];
        }
        if (this.lastError) {
            const item = new vscode.TreeItem(`Error: ${this.lastError}`);
            item.iconPath = new vscode.ThemeIcon('error');
            return [item];
        }
        if (!this.jobs.length) {
            const item = new vscode.TreeItem('No jobs found');
            item.iconPath = new vscode.ThemeIcon('info');
            return [item];
        }

        return this.jobs.map(job => {
            const item = new vscode.TreeItem(job.name || job.jobId);
            item.id = `history-${job.jobId}`;
            item.iconPath = new vscode.ThemeIcon(ICONS[job.state] || 'question');
            item.description = `${job.jobId} | ${job.partition} | ${job.stateRaw} | ${job.elapsed}`;

            const md = new vscode.MarkdownString();
            md.isTrusted = true;
            md.appendMarkdown(`## ${job.name || job.jobId}\n\n`);
            md.appendMarkdown(`| Property | Value |\n|:--|:--|\n`);
            md.appendMarkdown(`| **Job ID** | ${job.jobId} |\n`);
            md.appendMarkdown(`| **State** | ${EMOJIS[job.state] || '❓'} ${job.state} |\n`);
            md.appendMarkdown(`| **Partition** | ${job.partition} |\n`);
            md.appendMarkdown(`| **Elapsed** | ${job.elapsed} |\n`);
            md.appendMarkdown(`| **Start** | ${job.startTime} |\n`);
            md.appendMarkdown(`| **End** | ${job.endTime} |\n`);
            if (job.exitCode) md.appendMarkdown(`| **Exit Code** | ${job.exitCode} |\n`);
            if (job.maxRSS) md.appendMarkdown(`| **Max Memory** | ${job.maxRSS} |\n`);
            if (job.cpuTime) md.appendMarkdown(`| **CPU Time** | ${job.cpuTime} |\n`);
            item.tooltip = md;

            item.contextValue = 'history-job';
            return item;
        });
    }
}
