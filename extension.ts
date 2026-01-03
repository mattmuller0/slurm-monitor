import * as vscode from 'vscode';
import { SlurmService } from './slurmService';
import { SlurmJobsProvider, SlurmQueueProvider, JobTreeItem, JobHistoryProvider } from './slurmProvider';
import { SlurmJob, SlurmJobDetails, JobState } from './types';

let statusBarItem: vscode.StatusBarItem;
let refreshInterval: ReturnType<typeof setInterval> | undefined;
let slurmService: SlurmService;
let jobsProvider: SlurmJobsProvider;
let queueProvider: SlurmQueueProvider;
let historyProvider: JobHistoryProvider;
let previousJobStates: Map<string, JobState> = new Map();

export function activate(context: vscode.ExtensionContext): void {
    const outputChannel = vscode.window.createOutputChannel('SLURM Monitor');
    slurmService = new SlurmService(outputChannel);
    jobsProvider = new SlurmJobsProvider(slurmService, true);
    queueProvider = new SlurmQueueProvider(slurmService);
    historyProvider = new JobHistoryProvider(slurmService);

    // Register tree views
    context.subscriptions.push(
        outputChannel,
        vscode.window.createTreeView('slurmJobs', { treeDataProvider: jobsProvider, showCollapseAll: true }),
        vscode.window.createTreeView('slurmQueue', { treeDataProvider: queueProvider, showCollapseAll: true }),
        vscode.window.createTreeView('slurmHistory', { treeDataProvider: historyProvider, showCollapseAll: true })
    );

    // Status bar
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'slurm.refresh';
    context.subscriptions.push(statusBarItem);

    // Register commands
    const commands: Record<string, (item?: JobTreeItem) => Promise<void>> = {
        'slurm.refresh': async () => { await refreshJobs(); vscode.window.showInformationMessage('SLURM jobs refreshed'); },
        'slurm.cancelJob': async (item) => {
            const jobId = item?.job?.jobId || await promptForJobId('Enter job ID to cancel');
            if (!jobId) return;
            if (await vscode.window.showWarningMessage(`Cancel job ${jobId}?`, { modal: true }, 'Cancel Job') === 'Cancel Job') {
                await runWithErrorHandling(() => slurmService.cancelJob(jobId), `Job ${jobId} cancelled`);
            }
        },
        'slurm.showJobDetails': async (item) => {
            const jobId = item?.job?.jobId || await promptForJobId('Enter job ID');
            if (!jobId) return;
            const details = await slurmService.getJobDetails(jobId);
            details ? showJobDetailsPanel(details) : vscode.window.showWarningMessage(`Job ${jobId} not found`);
        },
        'slurm.submitJob': async () => {
            const editor = vscode.window.activeTextEditor;
            const defaultUri = editor?.document.fileName.match(/\.(sh|slurm|sbatch)$/) ? editor.document.uri : undefined;
            const fileUri = await vscode.window.showOpenDialog({
                canSelectFiles: true, canSelectMany: false, defaultUri,
                filters: { 'SLURM Scripts': ['sh', 'slurm', 'sbatch'], 'All Files': ['*'] },
                title: 'Select SLURM Job Script'
            });
            if (fileUri?.[0]) {
                await runWithErrorHandling(
                    async () => `Job submitted: ${await slurmService.submitJob({ scriptPath: fileUri[0].fsPath })}`
                );
            }
        },
        'slurm.submitCurrentFile': async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) { vscode.window.showWarningMessage('No file open'); return; }
            const filePath = editor.document.fileName;
            if (!filePath.match(/\.(sh|slurm|sbatch)$/)) {
                const confirm = await vscode.window.showWarningMessage(
                    'File does not have a SLURM extension. Submit anyway?', 'Submit', 'Cancel'
                );
                if (confirm !== 'Submit') return;
            }
            await editor.document.save();
            await runWithErrorHandling(
                async () => `Job submitted: ${await slurmService.submitJob({ scriptPath: filePath })}`
            );
        },
        'slurm.openOutput': async (item) => openJobFile(item, 'stdoutPath', 'output'),
        'slurm.openError': async (item) => openJobFile(item, 'stderrPath', 'error'),
        'slurm.toggleAutoRefresh': async () => {
            const config = vscode.workspace.getConfiguration('slurm');
            const current = config.get<boolean>('autoRefresh', true);
            await config.update('autoRefresh', !current, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Auto-refresh ${!current ? 'enabled' : 'disabled'}`);
        },
        'slurm.showDashboard': async () => { await showDashboard(); },
        'slurm.showResourceUsage': async (item) => {
            const jobId = item?.job?.jobId || await promptForJobId('Enter job ID');
            if (!jobId) return;
            await showResourceUsagePanel(jobId);
        },
        'slurm.refreshHistory': async () => { await historyProvider.refresh(); vscode.window.showInformationMessage('Job history refreshed'); },
        'slurm.filterJobs': async () => { await showFilterDialog(); },
        'slurm.clearFilter': async () => { jobsProvider.setFilter({}); queueProvider.setFilter({}); await refreshJobs(); },
        'slurm.resubmitJob': async (item) => {
            const jobId = item?.job?.jobId || await promptForJobId('Enter job ID to resubmit');
            if (!jobId) return;
            const baseJobId = jobId.split('_')[0];
            if (await vscode.window.showInformationMessage(`Resubmit job ${baseJobId}?`, { modal: true }, 'Resubmit') === 'Resubmit') {
                await runWithErrorHandling(async () => `Job resubmitted: ${await slurmService.resubmitJob(baseJobId)}`);
            }
        },
    };

    for (const [cmd, handler] of Object.entries(commands)) {
        context.subscriptions.push(vscode.commands.registerCommand(cmd, handler));
    }

    // Config watcher and initial setup
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('slurm.autoRefresh') || e.affectsConfiguration('slurm.refreshInterval')) {
                setupAutoRefresh();
            }
        })
    );

    // Register SLURM language support
    registerSlurmLanguageSupport(context);

    refreshJobs();
    setupAutoRefresh();
}

async function runWithErrorHandling(fn: () => Promise<unknown>, successMsg?: string): Promise<void> {
    try {
        const result = await fn();
        const msg = typeof result === 'string' ? result : successMsg;
        if (msg) vscode.window.showInformationMessage(msg);
        await refreshJobs();
    } catch (error: any) {
        vscode.window.showErrorMessage(error.message);
    }
}

async function openJobFile(item: JobTreeItem | undefined, pathKey: 'stdoutPath' | 'stderrPath', type: string): Promise<void> {
    const jobId = item?.job?.jobId || await promptForJobId('Enter job ID');
    if (!jobId) return;
    try {
        const details = await slurmService.getJobDetails(jobId);
        const path = details?.[pathKey];
        if (!path || path === '/dev/null') {
            vscode.window.showWarningMessage(`No ${type} file configured for this job`);
            return;
        }
        const resolvedPath = resolveJobPath(path, details);
        if (slurmService.getConfig().sshHost) {
            const content = await slurmService.readRemoteFile(resolvedPath);
            const doc = await vscode.workspace.openTextDocument({ content, language: 'log' });
            await vscode.window.showTextDocument(doc);
        } else {
            await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(resolvedPath)));
        }
    } catch { vscode.window.showWarningMessage(`Failed to open ${type} file`); }
}

async function refreshJobs(): Promise<void> {
    try {
        const oldJobs = jobsProvider.getJobs();
        await Promise.all([jobsProvider.refresh(), queueProvider.refresh()]);
        updateStatusBar();
        checkJobStateChanges(oldJobs, jobsProvider.getJobs());
    } catch (error: any) {
        statusBarItem.text = '$(error) SLURM: Error';
        statusBarItem.show();
    }
}

function checkJobStateChanges(oldJobs: SlurmJob[], newJobs: SlurmJob[]): void {
    const config = slurmService.getConfig();
    if (!config.enableNotifications) return;

    const oldJobMap = new Map(oldJobs.map(j => [j.jobId, j]));
    const newJobMap = new Map(newJobs.map(j => [j.jobId, j]));

    for (const [jobId, newJob] of newJobMap) {
        const oldJob = oldJobMap.get(jobId);
        const prevState = previousJobStates.get(jobId);

        if (config.notifyOnStart && newJob.state === 'RUNNING' && (prevState === 'PENDING' || oldJob?.state === 'PENDING')) {
            vscode.window.showInformationMessage(`Job ${jobId} (${newJob.name}) started running`);
        }
    }

    for (const [jobId, oldJob] of oldJobMap) {
        if (!newJobMap.has(jobId)) {
            // Job completed/disappeared
            if (config.notifyOnComplete && (oldJob.state === 'RUNNING' || oldJob.state === 'COMPLETING')) {
                vscode.window.showInformationMessage(`Job ${jobId} (${oldJob.name}) completed`);
            }
        }
    }

    // Check for failed jobs in new results
    for (const job of newJobs) {
        const prevState = previousJobStates.get(job.jobId);
        if (config.notifyOnFail && (job.state === 'FAILED' || job.state === 'TIMEOUT' || job.state === 'OUT_OF_MEMORY' || job.state === 'NODE_FAIL')) {
            if (prevState && prevState !== job.state) {
                vscode.window.showWarningMessage(`Job ${job.jobId} (${job.name}) ${job.state.toLowerCase()}`);
            }
        }
        previousJobStates.set(job.jobId, job.state);
    }
}

function updateStatusBar(): void {
    const jobs = jobsProvider.getJobs();
    const running = jobs.filter(j => j.state === 'RUNNING');
    const pending = jobs.filter(j => j.state === 'PENDING').length;

    if (jobs.length === 0) {
        statusBarItem.text = '$(server-process) SLURM: No jobs';
    } else {
        statusBarItem.text = `$(server-process) SLURM: ${running.length}R / ${pending}P`;
    }

    const tooltip = [`**SLURM Jobs**`, `- Running: ${running.length}`, `- Pending: ${pending}`, `- Total: ${jobs.length}`];
    if (running.length > 0) {
        tooltip.push('', '**Running:**', ...running.slice(0, 5).map(j => `- ${j.name}: ${j.timeUsed || 'N/A'}`));
        if (running.length > 5) tooltip.push(`- ...and ${running.length - 5} more`);
    }
    statusBarItem.tooltip = new vscode.MarkdownString(tooltip.join('\n'));
    statusBarItem.show();
}

function setupAutoRefresh(): void {
    if (refreshInterval) clearInterval(refreshInterval);
    const config = vscode.workspace.getConfiguration('slurm');
    if (config.get<boolean>('autoRefresh', true)) {
        refreshInterval = setInterval(refreshJobs, config.get<number>('refreshInterval', 30) * 1000);
    }
}

async function promptForJobId(prompt: string): Promise<string | undefined> {
    return vscode.window.showInputBox({
        prompt, placeHolder: 'e.g., 12345',
        validateInput: (v: string) => !v ? 'Job ID required' : !/^\d+(_\d+)?$/.test(v) ? 'Invalid format' : null
    });
}

function resolveJobPath(path: string, job: SlurmJobDetails): string {
    return path.replace(/%j/g, job.jobId).replace(/%x/g, job.name).replace(/%u/g, job.user || '')
        .replace(/%A/g, job.arrayJobId || job.jobId).replace(/%a/g, job.arrayTaskId || '0').replace(/%N/g, job.batchHost || '');
}

// Feature 6: Filter Dialog
async function showFilterDialog(): Promise<void> {
    const partitions = await slurmService.getPartitions();
    const partitionItems = partitions.map(p => ({ label: p.name, picked: false }));

    const stateItems = [
        { label: 'RUNNING', picked: false },
        { label: 'PENDING', picked: false },
        { label: 'COMPLETED', picked: false },
        { label: 'FAILED', picked: false },
        { label: 'CANCELLED', picked: false },
    ];

    const filterType = await vscode.window.showQuickPick([
        { label: 'Filter by Partition', value: 'partition' },
        { label: 'Filter by State', value: 'state' },
        { label: 'Filter by Job Name', value: 'name' },
    ], { placeHolder: 'Select filter type' });

    if (!filterType) return;

    if (filterType.value === 'partition') {
        const selected = await vscode.window.showQuickPick(partitionItems, {
            canPickMany: true, placeHolder: 'Select partitions to show'
        });
        if (selected) {
            const partitionFilter = selected.map(s => s.label);
            jobsProvider.setFilter({ partition: partitionFilter });
            queueProvider.setFilter({ partition: partitionFilter });
            await refreshJobs();
        }
    } else if (filterType.value === 'state') {
        const selected = await vscode.window.showQuickPick(stateItems, {
            canPickMany: true, placeHolder: 'Select states to show'
        });
        if (selected) {
            const stateFilter = selected.map(s => s.label as JobState);
            jobsProvider.setFilter({ state: stateFilter });
            queueProvider.setFilter({ state: stateFilter });
            await refreshJobs();
        }
    } else if (filterType.value === 'name') {
        const pattern = await vscode.window.showInputBox({
            prompt: 'Enter job name pattern (regex)',
            placeHolder: 'e.g., training.*'
        });
        if (pattern) {
            jobsProvider.setFilter({ name: pattern });
            queueProvider.setFilter({ name: pattern });
            await refreshJobs();
        }
    }
}

// Feature 9: SLURM Language Support
function registerSlurmLanguageSupport(context: vscode.ExtensionContext): void {
    // Register document symbol provider for SLURM scripts
    const slurmSelector = [
        { scheme: 'file', pattern: '**/*.slurm' },
        { scheme: 'file', pattern: '**/*.sbatch' },
        { scheme: 'file', language: 'shellscript' }
    ];

    // Hover provider for SBATCH directives
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(slurmSelector, {
            provideHover(document, position) {
                const line = document.lineAt(position.line).text;
                if (!line.trim().startsWith('#SBATCH')) return null;

                const directives: Record<string, string> = {
                    '-J': '**--job-name**: Specify a name for the job allocation',
                    '--job-name': '**--job-name**: Specify a name for the job allocation',
                    '-p': '**--partition**: Request a specific partition for the resource allocation',
                    '--partition': '**--partition**: Request a specific partition for the resource allocation',
                    '-N': '**--nodes**: Request a minimum number of nodes',
                    '--nodes': '**--nodes**: Request a minimum number of nodes',
                    '-n': '**--ntasks**: Request a number of tasks',
                    '--ntasks': '**--ntasks**: Request a number of tasks',
                    '-c': '**--cpus-per-task**: Request a number of CPUs per task',
                    '--cpus-per-task': '**--cpus-per-task**: Request a number of CPUs per task',
                    '--mem': '**--mem**: Specify the real memory required per node (e.g., 4G, 4096M)',
                    '--mem-per-cpu': '**--mem-per-cpu**: Minimum memory required per allocated CPU',
                    '-t': '**--time**: Set a limit on the total run time (format: days-hours:minutes:seconds)',
                    '--time': '**--time**: Set a limit on the total run time (format: days-hours:minutes:seconds)',
                    '-o': '**--output**: File for batch script standard output (%j=jobid, %x=jobname)',
                    '--output': '**--output**: File for batch script standard output (%j=jobid, %x=jobname)',
                    '-e': '**--error**: File for batch script standard error',
                    '--error': '**--error**: File for batch script standard error',
                    '-a': '**--array**: Submit a job array (e.g., 1-10, 1-100%5)',
                    '--array': '**--array**: Submit a job array (e.g., 1-10, 1-100%5)',
                    '-d': '**--dependency**: Defer job until specified dependencies satisfied',
                    '--dependency': '**--dependency**: Defer job until specified dependencies satisfied',
                    '--gres': '**--gres**: Generic resources (e.g., gpu:1, gpu:v100:2)',
                    '-A': '**--account**: Charge resources to specified account',
                    '--account': '**--account**: Charge resources to specified account',
                    '--qos': '**--qos**: Request a quality of service for the job',
                    '--mail-user': '**--mail-user**: Email address for job notifications',
                    '--mail-type': '**--mail-type**: When to send email (BEGIN, END, FAIL, ALL)',
                    '-D': '**--chdir**: Set the working directory of the batch script',
                    '--chdir': '**--chdir**: Set the working directory of the batch script',
                    '--exclusive': '**--exclusive**: Request exclusive node access',
                    '--constraint': '**--constraint**: Specify node features required',
                };

                for (const [flag, description] of Object.entries(directives)) {
                    if (line.includes(flag)) {
                        return new vscode.Hover(new vscode.MarkdownString(description));
                    }
                }
                return null;
            }
        })
    );

    // Completion provider for SBATCH directives
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(slurmSelector, {
            provideCompletionItems(document, position) {
                const line = document.lineAt(position.line).text;
                if (!line.trim().startsWith('#SBATCH')) return [];

                const completions = [
                    { label: '--job-name=', detail: 'Job name', insertText: '--job-name=${1:name}' },
                    { label: '--partition=', detail: 'Partition', insertText: '--partition=${1:partition}' },
                    { label: '--nodes=', detail: 'Number of nodes', insertText: '--nodes=${1:1}' },
                    { label: '--ntasks=', detail: 'Number of tasks', insertText: '--ntasks=${1:1}' },
                    { label: '--cpus-per-task=', detail: 'CPUs per task', insertText: '--cpus-per-task=${1:1}' },
                    { label: '--mem=', detail: 'Memory per node', insertText: '--mem=${1:4G}' },
                    { label: '--time=', detail: 'Time limit', insertText: '--time=${1:1:00:00}' },
                    { label: '--output=', detail: 'Output file', insertText: '--output=${1:%x_%j.out}' },
                    { label: '--error=', detail: 'Error file', insertText: '--error=${1:%x_%j.err}' },
                    { label: '--array=', detail: 'Job array', insertText: '--array=${1:1-10}' },
                    { label: '--gres=', detail: 'Generic resources', insertText: '--gres=${1:gpu:1}' },
                    { label: '--mail-user=', detail: 'Email address', insertText: '--mail-user=${1:email@example.com}' },
                    { label: '--mail-type=', detail: 'Mail events', insertText: '--mail-type=${1|BEGIN,END,FAIL,ALL|}' },
                ];

                return completions.map(c => {
                    const item = new vscode.CompletionItem(c.label, vscode.CompletionItemKind.Property);
                    item.detail = c.detail;
                    item.insertText = new vscode.SnippetString(c.insertText);
                    return item;
                });
            }
        }, '-')
    );
}

// HTML Panel Helpers
const BASE_STYLES = `
    body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    h1, h2 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid var(--vscode-panel-border); }
    th { background: var(--vscode-textCodeBlock-background); }
    .stats { display: flex; gap: 20px; flex-wrap: wrap; margin: 20px 0; }
    .note { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-top: 20px; }
    .bar { width: 100%; height: 20px; background: var(--vscode-input-background); border-radius: 10px; overflow: hidden; margin: 10px 0; }
    .fill { height: 100%; transition: width 0.3s; }
    .green { background: #28a745; } .yellow { background: #ffc107; } .red { background: #dc3545; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: bold; color: white; }
    .code { font-family: monospace; background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; white-space: pre-wrap; }
`;

const html = (body: string, extraStyles = '') =>
    `<!DOCTYPE html><html><head><style>${BASE_STYLES}${extraStyles}</style></head><body>${body}</body></html>`;

const stat = (value: string | number, label: string, color = 'var(--vscode-textLink-foreground)') => `
    <div style="background:var(--vscode-textCodeBlock-background);padding:15px 25px;border-radius:8px;text-align:center;min-width:100px">
        <div style="font-size:1.8em;font-weight:bold;color:${color}">${typeof value === 'string' ? esc(value) : value}</div>
        <div style="color:var(--vscode-descriptionForeground)">${label}</div>
    </div>`;

const tableRow = (label: string, value: any) => value ? `<tr><td><b>${label}</b></td><td>${esc(String(value))}</td></tr>` : '';
const section = (title: string, rows: string) => rows ? `<h2>${title}</h2><table>${rows}</table>` : '';

// Resource Usage Panel
async function showResourceUsagePanel(jobId: string): Promise<void> {
    const [usage, details] = await Promise.all([
        slurmService.getJobResourceUsage(jobId),
        slurmService.getJobDetails(jobId)
    ]);

    const panel = vscode.window.createWebviewPanel('slurmResourceUsage', `Resource Usage: ${jobId}`, vscode.ViewColumn.One, {});
    const info = details ? `<p><b>Job:</b> ${esc(details.name)} | <b>State:</b> ${details.state} | <b>Runtime:</b> ${details.runTime || 'N/A'}</p>` : '';
    const stats = usage
        ? `<div class="stats">${stat(usage.cpuTime, 'CPU Time')}${stat(usage.memUsed, 'Memory Used')}${stat(usage.memUsedMax, 'Max Memory')}${stat(usage.vmSize, 'VM Size')}${stat(usage.ioRead, 'I/O Read')}${stat(usage.ioWrite, 'I/O Write')}</div>`
        : '<p>No resource usage data available. Job may not have started yet.</p>';

    panel.webview.html = html(`<h1>Resource Usage: Job ${esc(jobId)}</h1>${info}${stats}`);
}

// Cluster Dashboard
async function showDashboard(): Promise<void> {
    const [clusterInfo, partitions, quotas] = await Promise.all([
        slurmService.getClusterInfo(),
        slurmService.getDetailedPartitionInfo(),
        slurmService.getQuotaInfo()
    ]);

    const panel = vscode.window.createWebviewPanel('slurmDashboard', `SLURM Dashboard: ${clusterInfo.name}`, vscode.ViewColumn.One, {});
    const cpuPct = clusterInfo.totalCpus > 0 ? Math.round((clusterInfo.allocCpus / clusterInfo.totalCpus) * 100) : 0;

    const partitionRows = partitions.map(p =>
        `<tr><td>${esc(p.name)}${p.default ? ' (default)' : ''}</td><td>${p.state}</td><td>${p.totalNodes}</td><td>${p.allocNodes}</td><td>${p.idleNodes}</td><td>${esc(p.maxTime)}</td></tr>`
    ).join('');

    const quotaSection = quotas.length > 0
        ? `<h2>Your Account Usage</h2><table><tr><th>Account</th><th>Usage</th><th>Limit</th></tr>${quotas.map(q => `<tr><td>${esc(q.account)}</td><td>${esc(q.usage)}</td><td>${esc(q.limit)}</td></tr>`).join('')}</table>`
        : '';

    panel.webview.html = html(`
        <h1>${esc(clusterInfo.name)} Dashboard</h1>
        <p><b>SLURM Version:</b> ${esc(clusterInfo.slurmVersion)} | <b>Controller:</b> ${esc(clusterInfo.controlMachine)}</p>
        <h2>Cluster Resources</h2>
        <div class="stats">${stat(clusterInfo.totalNodes, 'Total Nodes')}${stat(clusterInfo.totalCpus, 'Total CPUs')}${stat(clusterInfo.allocCpus, 'Allocated', '#ffc107')}${stat(clusterInfo.idleCpus, 'Idle', '#28a745')}${stat(clusterInfo.downCpus, 'Down', '#dc3545')}</div>
        <p><b>CPU Utilization:</b> ${cpuPct}%</p>
        <div class="bar"><div class="fill ${cpuPct > 80 ? 'red' : cpuPct > 50 ? 'yellow' : 'green'}" style="width:${cpuPct}%"></div></div>
        <h2>Partitions</h2>
        <table><tr><th>Name</th><th>State</th><th>Nodes</th><th>Allocated</th><th>Idle</th><th>Max Time</th></tr>${partitionRows}</table>
        ${quotaSection}
    `);
}

// Job Details Panel
function showJobDetailsPanel(job: SlurmJobDetails): void {
    const panel = vscode.window.createWebviewPanel('slurmJobDetails', `Job ${job.jobId}: ${job.name}`, vscode.ViewColumn.One, {});

    panel.webview.html = html(`
        <h1>${esc(job.name)} <span class="badge" style="background:${STATE_COLORS[job.state] || '#6c757d'}">${job.state}</span></h1>
        ${section('Basic', tableRow('Job ID', job.jobId) + tableRow('User', job.user) + tableRow('Account', job.account) + tableRow('Partition', job.partition) + tableRow('QoS', job.qos))}
        ${section('Resources', tableRow('Nodes', job.numNodes) + tableRow('CPUs', job.numCPUs) + tableRow('Memory', job.memory) + tableRow('GRES', job.gres) + tableRow('Node List', job.nodelist))}
        ${section('Time', tableRow('Submit', job.submitTime) + tableRow('Start', job.startTime) + tableRow('End', job.endTime) + tableRow('Runtime', job.runTime) + tableRow('Limit', job.timeLimit))}
        ${section('Paths', tableRow('WorkDir', job.workDir) + tableRow('Stdout', job.stdoutPath) + tableRow('Stderr', job.stderrPath))}
        ${job.dependency ? section('Dependencies', tableRow('Dependency', job.dependency)) : ''}
        ${job.exitCode ? section('Exit', tableRow('Exit Code', job.exitCode)) : ''}
        ${job.submitLine ? `<h2>Submit Command</h2><div class="code">${esc(job.submitLine)}</div>` : ''}
    `);
}

const STATE_COLORS: Record<string, string> = {
    RUNNING: '#28a745', PENDING: '#ffc107', COMPLETED: '#17a2b8', FAILED: '#dc3545',
    CANCELLED: '#6c757d', TIMEOUT: '#fd7e14', OUT_OF_MEMORY: '#e83e8c', NODE_FAIL: '#dc3545'
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function deactivate(): void {
    if (refreshInterval) clearInterval(refreshInterval);
}
