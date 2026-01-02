import * as vscode from 'vscode';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import { SlurmJob, SlurmJobDetails, SlurmConfig, CommandResult, ClusterInfo, SlurmPartition, SubmitOptions, JobFilter, JobState, JobResourceUsage, QueueEstimate, JobHistoryEntry } from './types';

const execAsync = promisify(exec);

const STATE_MAP: Record<string, JobState> = {
    PD: 'PENDING', R: 'RUNNING', S: 'SUSPENDED', CG: 'COMPLETING', CD: 'COMPLETED',
    CA: 'CANCELLED', F: 'FAILED', TO: 'TIMEOUT', NF: 'NODE_FAIL', PR: 'PREEMPTED',
    OOM: 'OUT_OF_MEMORY', BF: 'BOOT_FAIL', DL: 'DEADLINE', RQ: 'REQUEUED',
    RS: 'RESIZING', RV: 'REVOKED', SI: 'SIGNALING', SE: 'SPECIAL_EXIT', SO: 'STAGE_OUT', ST: 'STOPPED'
};

const SUBMIT_OPTIONS: Record<string, string> = {
    jobName: '-J', partition: '-p', nodes: '-N', ntasks: '-n', cpusPerTask: '-c',
    memory: '--mem', time: '-t', output: '-o', error: '-e', array: '-a',
    dependency: '-d', account: '-A', qos: '--qos', gres: '--gres', workdir: '-D', mail: '--mail-user'
};

export class SlurmService {
    private config: SlurmConfig;
    private streamingProcesses: Map<string, ChildProcess> = new Map();

    constructor(private readonly outputChannel: vscode.OutputChannel) {
        this.config = this.loadConfig();
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('slurm')) {
                this.config = this.loadConfig();
                this.log('Configuration updated');
            }
        });
    }

    private loadConfig(): SlurmConfig {
        const c = vscode.workspace.getConfiguration('slurm');
        return {
            refreshInterval: c.get('refreshInterval', 30),
            autoRefresh: c.get('autoRefresh', true),
            sshHost: c.get('sshHost', ''),
            sshUser: c.get('sshUser', ''),
            sshKeyPath: c.get('sshKeyPath', ''),
            squeueFormat: c.get('squeueFormat', '%i|%j|%P|%T|%M|%l|%D|%R|%S|%e'),
            showAllUsers: c.get('showAllUsers', false),
            partitionFilter: c.get('partitionFilter', []),
            maxJobsDisplayed: c.get('maxJobsDisplayed', 100),
            enableNotifications: c.get('enableNotifications', true),
            notifyOnComplete: c.get('notifyOnComplete', true),
            notifyOnFail: c.get('notifyOnFail', true),
            notifyOnStart: c.get('notifyOnStart', false),
        };
    }

    public getConfig(): SlurmConfig { return this.config; }
    private log(msg: string): void { this.outputChannel.appendLine(`[${new Date().toISOString()}] ${msg}`); }

    private remoteUser: string | null = null;
    private async getUser(): Promise<string> {
        if (this.config.sshUser) return this.config.sshUser;
        if (this.config.sshHost) {
            if (!this.remoteUser) {
                const result = await this.executeCommand('whoami');
                this.remoteUser = result.success ? result.stdout : os.userInfo().username;
            }
            return this.remoteUser;
        }
        return os.userInfo().username;
    }

    private async executeCommand(command: string): Promise<CommandResult> {
        const fullCommand = this.buildCommand(command);
        this.log(`Executing: ${fullCommand}`);
        try {
            const { stdout, stderr } = await execAsync(fullCommand, { maxBuffer: 10 * 1024 * 1024, timeout: 30000 });
            return { success: true, stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
        } catch (error: any) {
            this.log(`Command failed: ${error.message}`);
            return { success: false, stdout: error.stdout?.trim() || '', stderr: error.stderr?.trim() || error.message, exitCode: error.code || 1 };
        }
    }

    private buildCommand(command: string): string {
        if (!this.config.sshHost) return command;
        const args = ['ssh'];
        if (this.config.sshKeyPath) args.push('-i', this.config.sshKeyPath);
        args.push('-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=10');
        args.push(this.config.sshUser ? `${this.config.sshUser}@${this.config.sshHost}` : this.config.sshHost);
        args.push(`'${command.replace(/'/g, "'\\''")}'`);
        return args.join(' ');
    }

    private parseJobState(code: string): JobState {
        return STATE_MAP[code.split(/[^A-Z]/)[0]] || code;
    }

    public async getMyJobs(filter?: JobFilter): Promise<SlurmJob[]> {
        return this.getJobs({ ...filter, user: filter?.user || await this.getUser() });
    }

    public async getJobs(filter?: JobFilter): Promise<SlurmJob[]> {
        const args = ['squeue', '--noheader', '-o', `"${this.config.squeueFormat}"`];

        if (filter?.user) args.push('-u', filter.user);
        else if (!this.config.showAllUsers) args.push('-u', await this.getUser());

        if (filter?.partition?.length) args.push('-p', filter.partition.join(','));
        else if (this.config.partitionFilter.length) args.push('-p', this.config.partitionFilter.join(','));

        if (filter?.state?.length) args.push('-t', filter.state.join(','));
        if (filter?.jobIds?.length) args.push('-j', filter.jobIds.join(','));

        const result = await this.executeCommand(args.join(' '));
        if (!result.success) throw new Error(`Failed to get jobs: ${result.stderr}`);
        if (!result.stdout) return [];

        let jobs = result.stdout.split('\n').filter(l => l.trim()).map(line => {
            const f = line.split('|');
            return {
                jobId: f[0]?.trim() || '', name: f[1]?.trim() || '', partition: f[2]?.trim() || '',
                state: this.parseJobState(f[3]?.trim() || ''), stateRaw: f[3]?.trim() || '',
                timeUsed: f[4]?.trim() || '', timeLimit: f[5]?.trim() || '',
                nodes: parseInt(f[6]?.trim() || '0', 10), nodelist: f[7]?.trim() || '',
                startTime: f[8]?.trim() || '', endTime: f[9]?.trim() || ''
            };
        });

        if (filter?.name) {
            const pattern = new RegExp(filter.name, 'i');
            jobs = jobs.filter(j => pattern.test(j.name));
        }
        return jobs.slice(0, this.config.maxJobsDisplayed);
    }

    public async getJobDetails(jobId: string): Promise<SlurmJobDetails | null> {
        const result = await this.executeCommand(`scontrol show job ${jobId}`);
        if (!result.success || !result.stdout || result.stdout.includes('Invalid job id')) return null;

        const o = result.stdout;
        const get = (k: string) => o.match(new RegExp(`${k}=([^\\s]+)`, 'i'))?.[1] || '';
        const getSpaces = (k: string) => o.match(new RegExp(`${k}=(.+?)(?=\\s+\\w+=|$)`, 'i'))?.[1]?.trim() || '';
        const getInt = (k: string) => parseInt(get(k), 10) || 0;
        const stateRaw = get('JobState');

        return {
            jobId: get('JobId'), name: get('JobName'), partition: get('Partition'),
            state: this.parseJobState(stateRaw), stateRaw,
            user: get('UserId').split('(')[0], account: get('Account'), qos: get('QOS'),
            priority: getInt('Priority'), dependency: get('Dependency'),
            submitTime: get('SubmitTime'), eligibleTime: get('EligibleTime'),
            startTime: get('StartTime'), endTime: get('EndTime'),
            deadline: get('Deadline'), preemptTime: get('PreemptTime'),
            suspendTime: get('SuspendTime'), accruedTime: get('AccrueTime'),
            lastSchedEval: get('LastSchedEval'),
            timeUsed: get('RunTime'), runTime: get('RunTime'),
            timeLimit: get('TimeLimit'), timeLimitRaw: getInt('TimeLimitRaw'),
            nodes: getInt('NumNodes'), numNodes: getInt('NumNodes'),
            numCPUs: getInt('NumCPUs'), numTasks: getInt('NumTasks'),
            cpusPerTask: getInt('CPUs/Task') || 1, cpus: getInt('NumCPUs'),
            nodelist: get('NodeList'), allocNode: get('AllocNode:Sid').split(':')[0],
            reqNodes: get('ReqNodes'), excludeNodes: get('ExcNodeList'),
            features: get('Features'),
            minMemoryNode: get('MinMemoryNode'), minMemoryCPU: get('MinMemoryCPU'),
            minTmpDisk: get('MinTmpDiskNode'),
            memory: get('MinMemoryNode') || get('MinMemoryCPU'),
            gres: get('Gres') || get('TresPerNode'), tres: get('TRES'),
            workDir: getSpaces('WorkDir'), command: getSpaces('Command'),
            stdinPath: getSpaces('StdIn'), stdoutPath: getSpaces('StdOut'), stderrPath: getSpaces('StdErr'),
            stdout: getSpaces('StdOut'), stderr: getSpaces('StdErr'),
            batchHost: get('BatchHost'), batchFlag: get('BatchFlag') === '1',
            requeue: get('Requeue') === '1', restarts: getInt('Restarts'),
            exitCode: get('ExitCode'), derivedExitCode: get('DerivedExitCode'),
            comment: get('Comment'), wckey: get('WcKey'), power: get('Power'),
            ntPerNode: get('NtasksPerN:B:S:C'), ntPerBoard: '', ntPerSocket: '', ntPerCore: '',
            coreSpec: get('CoreSpec'),
            submitLine: getSpaces('SubmitLine') || getSpaces('Command'),
            arrayJobId: get('ArrayJobId'), arrayTaskId: get('ArrayTaskId'),
        };
    }

    public async cancelJob(jobId: string): Promise<boolean> {
        const result = await this.executeCommand(`scancel ${jobId}`);
        if (!result.success && result.stderr) throw new Error(`Failed to cancel job ${jobId}: ${result.stderr}`);
        this.log(`Job ${jobId} cancelled successfully`);
        return true;
    }

    public async cancelJobs(jobIds: string[]): Promise<boolean> {
        const result = await this.executeCommand(`scancel ${jobIds.join(' ')}`);
        if (!result.success && result.stderr) throw new Error(`Failed to cancel jobs: ${result.stderr}`);
        this.log(`Jobs cancelled: ${jobIds.join(', ')}`);
        return true;
    }

    public async submitJob(options: SubmitOptions): Promise<string> {
        const args = ['sbatch'];

        for (const [key, flag] of Object.entries(SUBMIT_OPTIONS)) {
            const val = (options as any)[key];
            if (val != null) args.push(flag, String(val));
        }
        if (options.mailType?.length) args.push('--mail-type', options.mailType.join(','));
        if (options.additionalArgs) args.push(...options.additionalArgs);
        args.push(options.scriptPath);

        const result = await this.executeCommand(args.join(' '));
        if (!result.success) throw new Error(`Failed to submit job: ${result.stderr}`);

        const match = result.stdout.match(/Submitted batch job (\d+)/);
        if (!match) throw new Error(`Unexpected sbatch output: ${result.stdout}`);
        this.log(`Job submitted successfully: ${match[1]}`);
        return match[1];
    }

    public async resubmitJob(jobId: string): Promise<string> {
        const details = await this.getJobDetails(jobId);
        if (!details) throw new Error(`Job ${jobId} not found`);

        let cmd = details.submitLine || details.command;
        if (!cmd) throw new Error(`No submit command found for job ${jobId}`);
        if (!cmd.startsWith('sbatch')) cmd = `sbatch ${cmd}`;

        this.log(`Resubmitting job ${jobId} with command: ${cmd}`);
        const result = await this.executeCommand(cmd);
        if (!result.success) throw new Error(`Failed to resubmit job: ${result.stderr}`);

        const match = result.stdout.match(/Submitted batch job (\d+)/);
        if (!match) throw new Error(`Unexpected sbatch output: ${result.stdout}`);
        this.log(`Job resubmitted successfully: ${match[1]} (original: ${jobId})`);
        return match[1];
    }

    public async getClusterInfo(): Promise<ClusterInfo> {
        const [ctrlResult, partResult] = await Promise.all([
            this.executeCommand('scontrol show config | grep -E "ClusterName|ControlMachine|SlurmctldVersion"'),
            this.executeCommand('sinfo -o "%P|%a|%D|%C" --noheader')
        ]);

        const getMatch = (r: RegExp) => ctrlResult.stdout.match(r)?.[1] || 'Unknown';
        const partitions: SlurmPartition[] = [];
        let totalCpus = 0, allocCpus = 0, idleCpus = 0, downCpus = 0;

        if (partResult.success && partResult.stdout) {
            for (const line of partResult.stdout.split('\n')) {
                const [name, state, nodes, cpuInfo] = line.split('|');
                if (!name) continue;
                const cpu = cpuInfo?.split('/').map(n => parseInt(n, 10) || 0) || [0, 0, 0, 0];
                partitions.push({
                    name: name.replace('*', ''), state: (state?.toUpperCase() || 'UNKNOWN') as any,
                    totalNodes: parseInt(nodes, 10) || 0, idleNodes: 0, allocNodes: 0, downNodes: 0,
                    maxTime: '', defaultTime: '', maxNodes: 0, minNodes: 0, default: name.includes('*')
                });
                totalCpus += cpu[3]; allocCpus += cpu[0]; idleCpus += cpu[1]; downCpus += cpu[2];
            }
        }

        return {
            name: getMatch(/ClusterName\s*=\s*(\S+)/),
            controlMachine: getMatch(/ControlMachine\s*=\s*(\S+)/),
            slurmVersion: getMatch(/SlurmctldVersion\s*=\s*(\S+)/),
            totalNodes: partitions.reduce((s, p) => s + p.totalNodes, 0),
            totalCpus, allocCpus, idleCpus, downCpus, totalMemory: 0, allocMemory: 0, partitions
        };
    }

    public async getPartitions(): Promise<SlurmPartition[]> {
        const result = await this.executeCommand('sinfo -o "%P|%a|%l|%D|%C|%m|%f" --noheader');
        if (!result.success) throw new Error(`Failed to get partitions: ${result.stderr}`);

        return result.stdout.split('\n').filter(l => l.split('|').length >= 5).map(line => {
            const f = line.split('|');
            return {
                name: f[0].trim().replace('*', ''), state: (f[1]?.trim().toUpperCase() || 'UNKNOWN') as any,
                maxTime: f[2]?.trim() || '', defaultTime: '', totalNodes: parseInt(f[3], 10) || 0,
                idleNodes: 0, allocNodes: 0, downNodes: 0, maxNodes: 0, minNodes: 0, default: f[0].includes('*')
            };
        });
    }

    public async holdJob(jobId: string): Promise<boolean> {
        const result = await this.executeCommand(`scontrol hold ${jobId}`);
        if (!result.success && result.stderr) throw new Error(`Failed to hold job: ${result.stderr}`);
        return true;
    }

    public async releaseJob(jobId: string): Promise<boolean> {
        const result = await this.executeCommand(`scontrol release ${jobId}`);
        if (!result.success && result.stderr) throw new Error(`Failed to release job: ${result.stderr}`);
        return true;
    }

    public async testConnection(): Promise<boolean> {
        return (await this.executeCommand('squeue --version')).success;
    }

    public async getJobAccounting(jobId?: string, startTime?: string, endTime?: string): Promise<SlurmJob[]> {
        const args = ['sacct', '-n', '-P', '-o', 'JobID,JobName,Partition,State,Elapsed,Timelimit,NNodes,NodeList,Start,End,ExitCode'];
        if (jobId) args.push('-j', jobId);
        if (startTime) args.push('-S', startTime);
        if (endTime) args.push('-E', endTime);
        args.push('-u', await this.getUser());

        const result = await this.executeCommand(args.join(' '));
        if (!result.success) throw new Error(`Failed to get accounting data: ${result.stderr}`);

        return result.stdout.split('\n')
            .filter(l => l.split('|').length >= 10 && !l.split('|')[0].includes('.'))
            .map(line => {
                const f = line.split('|');
                return {
                    jobId: f[0], name: f[1], partition: f[2],
                    state: this.parseJobState(f[3]), stateRaw: f[3],
                    timeUsed: f[4], timeLimit: f[5], nodes: parseInt(f[6], 10) || 0,
                    nodelist: f[7], startTime: f[8], endTime: f[9], exitCode: f[10]
                };
            });
    }

    // Feature 1: Job Output Streaming
    public async streamJobOutput(jobId: string, filePath: string, onData: (data: string) => void, onError: (err: string) => void): Promise<() => void> {
        const tailCmd = `tail -f "${filePath}"`;
        const fullCommand = this.buildCommand(tailCmd);

        this.log(`Starting output stream for job ${jobId}: ${fullCommand}`);

        const parts = fullCommand.split(' ');
        const proc = spawn(parts[0], parts.slice(1), { shell: true });

        this.streamingProcesses.set(jobId, proc);

        proc.stdout.on('data', (data: Buffer) => onData(data.toString()));
        proc.stderr.on('data', (data: Buffer) => onError(data.toString()));
        proc.on('error', (err: Error) => onError(err.message));
        proc.on('close', () => this.streamingProcesses.delete(jobId));

        return () => {
            proc.kill();
            this.streamingProcesses.delete(jobId);
        };
    }

    public stopStreamingOutput(jobId: string): void {
        const proc = this.streamingProcesses.get(jobId);
        if (proc) {
            proc.kill();
            this.streamingProcesses.delete(jobId);
        }
    }

    // Feature 3: Resource Usage (sstat for running jobs, sacct for completed)
    public async getJobResourceUsage(jobId: string): Promise<JobResourceUsage | null> {
        // Try sstat first (for running jobs)
        let result = await this.executeCommand(
            `sstat -j ${jobId} -o JobID,AveCPU,AveCPUFreq,AveRSS,MaxRSS,AveVMSize,AveDiskRead,AveDiskWrite -P --noheader 2>/dev/null || true`
        );

        if (result.success && result.stdout.trim()) {
            const lines = result.stdout.split('\n').filter(l => l.trim() && !l.includes('.batch') && !l.includes('.extern'));
            if (lines.length > 0) {
                const f = lines[0].split('|');
                return {
                    jobId: f[0] || jobId,
                    cpuTime: f[1] || '0',
                    cpuPercent: parseFloat(f[2]) || 0,
                    memUsed: f[3] || '0',
                    memUsedMax: f[4] || '0',
                    vmSize: f[5] || '0',
                    ioRead: f[6] || '0',
                    ioWrite: f[7] || '0',
                };
            }
        }

        // Fall back to sacct (for completed jobs)
        result = await this.executeCommand(
            `sacct -j ${jobId} -o JobID,CPUTime,AveCPU,AveRSS,MaxRSS,AveVMSize,AveDiskRead,AveDiskWrite -P --noheader`
        );

        if (result.success && result.stdout.trim()) {
            const lines = result.stdout.split('\n').filter(l => l.trim() && !l.includes('.batch') && !l.includes('.extern'));
            if (lines.length > 0) {
                const f = lines[0].split('|');
                return {
                    jobId: f[0] || jobId,
                    cpuTime: f[1] || '0',
                    cpuPercent: 0,
                    memUsed: f[3] || '0',
                    memUsedMax: f[4] || '0',
                    vmSize: f[5] || '0',
                    ioRead: f[6] || '0',
                    ioWrite: f[7] || '0',
                };
            }
        }

        return null;
    }

    // Feature 10: Queue Wait Time Estimates
    public async getQueueEstimates(): Promise<QueueEstimate[]> {
        const partitions = await this.getPartitions();
        const estimates: QueueEstimate[] = [];

        // Get pending jobs count per partition
        const pendingResult = await this.executeCommand(
            'squeue -t PENDING -o "%P" --noheader | sort | uniq -c'
        );

        const pendingByPartition: Record<string, number> = {};
        if (pendingResult.success && pendingResult.stdout) {
            for (const line of pendingResult.stdout.split('\n')) {
                const match = line.trim().match(/(\d+)\s+(\S+)/);
                if (match) pendingByPartition[match[2]] = parseInt(match[1], 10);
            }
        }

        // Get average wait time from recent jobs using sacct
        const avgWaitResult = await this.executeCommand(
            `sacct -S $(date -d '7 days ago' +%Y-%m-%d 2>/dev/null || date -v-7d +%Y-%m-%d) -o Partition,Elapsed,Start,Submit -P --noheader -s CD,CA,F,TO | head -500`
        );

        const waitTimesByPartition: Record<string, number[]> = {};
        if (avgWaitResult.success && avgWaitResult.stdout) {
            for (const line of avgWaitResult.stdout.split('\n')) {
                const f = line.split('|');
                if (f.length >= 4 && f[2] && f[3]) {
                    const partition = f[0];
                    const start = new Date(f[2]).getTime();
                    const submit = new Date(f[3]).getTime();
                    if (!isNaN(start) && !isNaN(submit)) {
                        const waitMs = start - submit;
                        if (waitMs >= 0) {
                            if (!waitTimesByPartition[partition]) waitTimesByPartition[partition] = [];
                            waitTimesByPartition[partition].push(waitMs);
                        }
                    }
                }
            }
        }

        for (const partition of partitions) {
            const waitTimes = waitTimesByPartition[partition.name] || [];
            const avgWaitMs = waitTimes.length > 0
                ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
                : 0;

            estimates.push({
                partition: partition.name,
                pendingJobs: pendingByPartition[partition.name] || 0,
                avgWaitTime: this.formatDuration(avgWaitMs),
            });
        }

        return estimates;
    }

    private formatDuration(ms: number): string {
        if (ms <= 0) return 'N/A';
        const hours = Math.floor(ms / 3600000);
        const mins = Math.floor((ms % 3600000) / 60000);
        if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${mins}m`;
    }

    // Feature 12: Job History - get last X jobs for the user
    public async getJobHistory(limit: number = 100): Promise<JobHistoryEntry[]> {
        const user = await this.getUser();

        // Get the last X jobs for the user, sorted by submit time descending
        const result = await this.executeCommand(
            `sacct -u ${user} -o JobID,JobName,Partition,State,Elapsed,Timelimit,NNodes,NodeList,Start,End,ExitCode,MaxRSS,MaxVMSize,CPUTime -P --noheader -X | head -${limit}`
        );

        if (!result.success) throw new Error(`Failed to get job history: ${result.stderr}`);
        if (!result.stdout.trim()) return [];

        return result.stdout.split('\n')
            .filter(l => l.trim() && l.split('|').length >= 14)
            .map(line => {
                const f = line.split('|');
                return {
                    jobId: f[0], name: f[1], partition: f[2],
                    state: this.parseJobState(f[3]), stateRaw: f[3],
                    elapsed: f[4], timeUsed: f[4], timeLimit: f[5],
                    nodes: parseInt(f[6], 10) || 0, nodelist: f[7],
                    startTime: f[8], endTime: f[9], exitCode: f[10],
                    maxRSS: f[11] || '', maxVMSize: f[12] || '', cpuTime: f[13] || ''
                };
            });
    }

    // Feature 11: Get quota information
    public async getQuotaInfo(): Promise<{ user: string; account: string; usage: string; limit: string }[]> {
        const result = await this.executeCommand(
            'sacctmgr show assoc where user=$(whoami) format=User,Account,GrpTRESMins,MaxTRESMins -P --noheader 2>/dev/null || echo ""'
        );

        if (!result.success || !result.stdout.trim()) return [];

        return result.stdout.split('\n').filter(l => l.trim()).map(line => {
            const f = line.split('|');
            return {
                user: f[0] || '',
                account: f[1] || '',
                usage: f[2] || 'N/A',
                limit: f[3] || 'N/A',
            };
        });
    }

    // Get detailed partition info for dashboard
    public async getDetailedPartitionInfo(): Promise<SlurmPartition[]> {
        const result = await this.executeCommand(
            'sinfo -o "%P|%a|%l|%D|%A|%c|%m|%G" --noheader'
        );

        if (!result.success) throw new Error(`Failed to get partition info: ${result.stderr}`);

        return result.stdout.split('\n').filter(l => l.trim()).map(line => {
            const f = line.split('|');
            const nodeInfo = f[4]?.split('/') || ['0', '0'];
            return {
                name: f[0].replace('*', '').trim(),
                state: (f[1]?.trim().toUpperCase() || 'UNKNOWN') as any,
                maxTime: f[2]?.trim() || '',
                defaultTime: '',
                totalNodes: parseInt(f[3], 10) || 0,
                allocNodes: parseInt(nodeInfo[0], 10) || 0,
                idleNodes: parseInt(nodeInfo[1], 10) || 0,
                downNodes: 0,
                maxNodes: 0,
                minNodes: 0,
                default: f[0].includes('*'),
            };
        });
    }

    // Read file content (for viewing output files)
    public async readRemoteFile(filePath: string, lines: number = 100): Promise<string> {
        const result = await this.executeCommand(`tail -n ${lines} "${filePath}" 2>/dev/null || cat "${filePath}" 2>/dev/null || echo "File not found or not readable"`);
        return result.stdout;
    }
}
