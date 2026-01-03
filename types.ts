/**
 * SLURM Job state codes
 * See: https://slurm.schedmd.com/squeue.html#SECTION_JOB-STATE-CODES
 */
export type JobState =
    | 'PENDING'      // PD - Job is awaiting resource allocation
    | 'RUNNING'      // R  - Job currently has an allocation
    | 'SUSPENDED'    // S  - Job has an allocation, but execution has been suspended
    | 'COMPLETING'   // CG - Job is in the process of completing
    | 'COMPLETED'    // CD - Job has terminated all processes on all nodes
    | 'CANCELLED'    // CA - Job was explicitly cancelled
    | 'FAILED'       // F  - Job terminated with non-zero exit code
    | 'TIMEOUT'      // TO - Job terminated upon reaching its time limit
    | 'NODE_FAIL'    // NF - Job terminated due to failure of one or more allocated nodes
    | 'PREEMPTED'    // PR - Job terminated due to preemption
    | 'OUT_OF_MEMORY'// OOM - Job experienced out of memory error
    | 'BOOT_FAIL'    // BF - Job terminated due to launch failure
    | 'DEADLINE'     // DL - Job terminated on deadline
    | 'REQUEUED'     // RQ - Job was requeued
    | 'RESIZING'     // RS - Job is about to change size
    | 'REVOKED'      // RV - Sibling was removed from cluster due to other cluster starting the job
    | 'SIGNALING'    // SI - Job is being signaled
    | 'SPECIAL_EXIT' // SE - Job terminated with special exit code
    | 'STAGE_OUT'    // SO - Job is staging out files
    | 'STOPPED'      // ST - Job has an allocation, but execution has been stopped
    | string;        // Allow unknown states

/**
 * Parsed SLURM job information
 */
export interface SlurmJob {
    jobId: string;
    name: string;
    partition: string;
    state: JobState;
    stateRaw: string;
    timeUsed: string;
    timeLimit: string;
    nodes: number;
    nodelist: string;
    startTime: string;
    endTime: string;
    workDir?: string;
    submitTime?: string;
    user?: string;
    priority?: number;
    cpus?: number;
    memory?: string;
    gres?: string;
    stdout?: string;
    stderr?: string;
    command?: string;
    arrayJobId?: string;
    arrayTaskId?: string;
    dependency?: string;
    account?: string;
    qos?: string;
    exitCode?: string;
}

/**
 * Detailed job information from scontrol
 */
export interface SlurmJobDetails extends SlurmJob {
    submitTime: string;
    eligibleTime: string;
    accruedTime: string;
    suspendTime: string;
    deadline: string;
    preemptTime: string;
    lastSchedEval: string;
    allocNode: string;
    reqNodes: string;
    excludeNodes: string;
    features: string;
    numCPUs: number;
    numNodes: number;
    numTasks: number;
    cpusPerTask: number;
    minMemoryNode: string;
    minMemoryCPU: string;
    minTmpDisk: string;
    tres: string;
    comment: string;
    wckey: string;
    stdinPath: string;
    stdoutPath: string;
    stderrPath: string;
    batchHost: string;
    power: string;
    ntPerNode: string;
    ntPerBoard: string;
    ntPerSocket: string;
    ntPerCore: string;
    coreSpec: string;
    requeue: boolean;
    restarts: number;
    batchFlag: boolean;
    exitCode: string;
    derivedExitCode: string;
    runTime: string;
    timeLimitRaw: number;
    submitLine: string;
}

/**
 * Cluster partition information
 */
export interface SlurmPartition {
    name: string;
    state: 'UP' | 'DOWN' | 'DRAIN' | 'INACTIVE';
    totalNodes: number;
    idleNodes: number;
    allocNodes: number;
    downNodes: number;
    maxTime: string;
    defaultTime: string;
    maxNodes: number;
    minNodes: number;
    default: boolean;
}

/**
 * Cluster node information
 */
export interface SlurmNode {
    name: string;
    state: string;
    cpus: number;
    allocCpus: number;
    freeCpus: number;
    memory: number;
    allocMemory: number;
    freeMemory: number;
    gres: string;
    partitions: string[];
    features: string[];
}

/**
 * Cluster summary information
 */
export interface ClusterInfo {
    name: string;
    controlMachine: string;
    slurmVersion: string;
    totalNodes: number;
    totalCpus: number;
    allocCpus: number;
    idleCpus: number;
    downCpus: number;
    totalMemory: number;
    allocMemory: number;
    partitions: SlurmPartition[];
}

/**
 * Extension configuration
 */
export interface SlurmConfig {
    refreshInterval: number;
    autoRefresh: boolean;
    sshHost: string;
    sshUser: string;
    sshKeyPath: string;
    squeueFormat: string;
    showAllUsers: boolean;
    partitionFilter: string[];
    maxJobsDisplayed: number;
    enableNotifications: boolean;
    notifyOnComplete: boolean;
    notifyOnFail: boolean;
    notifyOnStart: boolean;
}

/**
 * Result of executing a SLURM command
 */
export interface CommandResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
}

/**
 * Job submission options
 */
export interface SubmitOptions {
    scriptPath: string;
    jobName?: string;
    partition?: string;
    nodes?: number;
    ntasks?: number;
    cpusPerTask?: number;
    memory?: string;
    time?: string;
    output?: string;
    error?: string;
    array?: string;
    dependency?: string;
    account?: string;
    qos?: string;
    gres?: string;
    mail?: string;
    mailType?: string[];
    workdir?: string;
    additionalArgs?: string[];
}

/**
 * Job filter options
 */
export interface JobFilter {
    user?: string;
    partition?: string[];
    state?: JobState[];
    name?: string;
    jobIds?: string[];
    startTime?: string;
    endTime?: string;
}

/**
 * Resource usage statistics from sstat
 */
export interface JobResourceUsage {
    jobId: string;
    cpuTime: string;
    cpuPercent: number;
    memUsed: string;
    memUsedMax: string;
    vmSize: string;
    ioRead: string;
    ioWrite: string;
    gpuUtil?: number;
}

/**
 * Job history entry from sacct
 */
export interface JobHistoryEntry extends SlurmJob {
    elapsed: string;
    maxRSS: string;
    maxVMSize: string;
    cpuTime: string;
    exitCode: string;
}
