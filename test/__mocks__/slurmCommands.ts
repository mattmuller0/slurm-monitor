/**
 * Mock SLURM command outputs for testing
 * These fixtures simulate real SLURM command responses
 */

export const MOCK_SQUEUE_OUTPUT = {
    empty: '',

    singleJob: `12345|test_job|gpu|R|01:30:00|04:00:00|1|node01|2024-01-15T10:00:00|2024-01-15T14:00:00`,

    multipleJobs: `12345|job_one|gpu|R|01:30:00|04:00:00|1|node01|2024-01-15T10:00:00|2024-01-15T14:00:00
12346|job_two|cpu|PD|0:00|02:00:00|2|Priority|N/A|N/A
12347|job_three|gpu|R|00:45:00|01:00:00|1|node02|2024-01-15T11:15:00|2024-01-15T12:15:00
12348|job_four|cpu|CD|02:00:00|02:00:00|1|node03|2024-01-15T08:00:00|2024-01-15T10:00:00`,

    arrayJobs: `12345_1|array_job|gpu|R|00:30:00|04:00:00|1|node01|2024-01-15T10:00:00|N/A
12345_2|array_job|gpu|R|00:25:00|04:00:00|1|node02|2024-01-15T10:05:00|N/A
12345_3|array_job|gpu|PD|0:00|04:00:00|1|Resources|N/A|N/A
12345_4|array_job|gpu|PD|0:00|04:00:00|1|Resources|N/A|N/A
12345_5|array_job|gpu|PD|0:00|04:00:00|1|Resources|N/A|N/A`,

    mixedArrayAndRegular: `12345_1|array_job|gpu|R|00:30:00|04:00:00|1|node01|2024-01-15T10:00:00|N/A
12345_2|array_job|gpu|R|00:25:00|04:00:00|1|node02|2024-01-15T10:05:00|N/A
12346|regular_job|cpu|R|01:00:00|02:00:00|1|node03|2024-01-15T09:00:00|N/A
12347|another_regular|gpu|PD|0:00|01:00:00|1|Priority|N/A|N/A`,

    allStates: `12345|running_job|gpu|R|01:30:00|04:00:00|1|node01|2024-01-15T10:00:00|N/A
12346|pending_job|cpu|PD|0:00|02:00:00|1|Priority|N/A|N/A
12347|completing_job|gpu|CG|01:59:00|02:00:00|1|node02|2024-01-15T08:00:00|2024-01-15T10:00:00
12348|completed_job|cpu|CD|02:00:00|02:00:00|1|node03|2024-01-15T08:00:00|2024-01-15T10:00:00
12349|failed_job|gpu|F|00:05:00|01:00:00|1|node04|2024-01-15T11:00:00|2024-01-15T11:05:00
12350|cancelled_job|cpu|CA|00:30:00|01:00:00|1|node05|2024-01-15T12:00:00|2024-01-15T12:30:00
12351|timeout_job|gpu|TO|04:00:00|04:00:00|1|node06|2024-01-15T06:00:00|2024-01-15T10:00:00
12352|oom_job|cpu|OOM|00:15:00|01:00:00|1|node07|2024-01-15T13:00:00|2024-01-15T13:15:00`,

    longRunning: `12345|long_job|gpu|R|7-12:30:00|14-00:00:00|4|node[01-04]|2024-01-08T00:00:00|2024-01-22T00:00:00`
};

export const MOCK_SCONTROL_OUTPUT = {
    basicJob: `JobId=12345 JobName=test_job
   UserId=testuser(1000) GroupId=testgroup(1000)
   MCS_label=N/A
   Priority=4294901758 Nice=0 Account=default QOS=normal
   JobState=RUNNING Reason=None Dependency=(null)
   Requeue=1 Restarts=0 BatchFlag=1 Reboot=0 ExitCode=0:0
   RunTime=01:30:00 TimeLimit=04:00:00 TimeMin=N/A
   SubmitTime=2024-01-15T09:55:00 EligibleTime=2024-01-15T09:55:00
   AccrueTime=2024-01-15T09:55:00
   StartTime=2024-01-15T10:00:00 EndTime=2024-01-15T14:00:00 Deadline=N/A
   SuspendTime=None SecsPreSuspend=0 LastSchedEval=2024-01-15T09:55:00
   Partition=gpu AllocNode:Sid=login01:12345
   ReqNodeList=(null) ExcNodeList=(null)
   NodeList=node01
   BatchHost=node01
   NumNodes=1 NumCPUs=4 NumTasks=1 CPUs/Task=4 ReqB:S:C:T=0:0:*:*
   TRES=cpu=4,mem=16G,node=1,billing=4,gres/gpu=1
   Socks/Node=* NtasksPerN:B:S:C=0:0:*:* CoreSpec=*
   MinCPUsNode=4 MinMemoryNode=16G MinTmpDiskNode=0
   Features=(null) DelayBoot=00:00:00
   OverSubscribe=OK Contiguous=0 Licenses=(null) Network=(null)
   Command=/home/testuser/scripts/run.sh
   WorkDir=/home/testuser/project
   StdErr=/home/testuser/logs/job_%j.err
   StdIn=/dev/null
   StdOut=/home/testuser/logs/job_%j.out
   Power=
   SubmitLine=sbatch --partition=gpu --time=4:00:00 --gres=gpu:1 --mem=16G --cpus-per-task=4 /home/testuser/scripts/run.sh`,

    completedJob: `JobId=12346 JobName=finished_job
   UserId=testuser(1000) GroupId=testgroup(1000)
   Priority=4294901758 Nice=0 Account=default QOS=normal
   JobState=COMPLETED Reason=None Dependency=(null)
   Requeue=1 Restarts=0 BatchFlag=1 Reboot=0 ExitCode=0:0
   DerivedExitCode=0:0
   RunTime=02:00:00 TimeLimit=04:00:00 TimeMin=N/A
   SubmitTime=2024-01-15T07:55:00 EligibleTime=2024-01-15T07:55:00
   StartTime=2024-01-15T08:00:00 EndTime=2024-01-15T10:00:00 Deadline=N/A
   Partition=cpu AllocNode:Sid=login01:12345
   NodeList=node02
   BatchHost=node02
   NumNodes=1 NumCPUs=2 NumTasks=1 CPUs/Task=2
   MinCPUsNode=2 MinMemoryNode=8G MinTmpDiskNode=0
   Command=/home/testuser/scripts/analysis.sh
   WorkDir=/home/testuser/analysis
   StdErr=/home/testuser/logs/analysis.err
   StdOut=/home/testuser/logs/analysis.out
   SubmitLine=sbatch --partition=cpu --time=4:00:00 --mem=8G /home/testuser/scripts/analysis.sh`,

    failedJob: `JobId=12347 JobName=failed_job
   UserId=testuser(1000) GroupId=testgroup(1000)
   Priority=4294901758 Nice=0 Account=default QOS=normal
   JobState=FAILED Reason=NonZeroExitCode Dependency=(null)
   Requeue=0 Restarts=0 BatchFlag=1 Reboot=0 ExitCode=1:0
   DerivedExitCode=1:0
   RunTime=00:05:30 TimeLimit=01:00:00 TimeMin=N/A
   SubmitTime=2024-01-15T10:55:00 EligibleTime=2024-01-15T10:55:00
   StartTime=2024-01-15T11:00:00 EndTime=2024-01-15T11:05:30 Deadline=N/A
   Partition=gpu AllocNode:Sid=login01:12345
   NodeList=node03
   BatchHost=node03
   NumNodes=1 NumCPUs=1 NumTasks=1 CPUs/Task=1
   Command=/home/testuser/scripts/buggy.sh
   WorkDir=/home/testuser/debug
   StdErr=/home/testuser/logs/buggy.err
   StdOut=/home/testuser/logs/buggy.out
   SubmitLine=sbatch /home/testuser/scripts/buggy.sh`,

    arrayJob: `JobId=12345_1 ArrayJobId=12345 ArrayTaskId=1 ArrayTaskThrottle=0
   JobName=array_job
   UserId=testuser(1000) GroupId=testgroup(1000)
   Priority=4294901758 Nice=0 Account=default QOS=normal
   JobState=RUNNING Reason=None Dependency=(null)
   Requeue=1 Restarts=0 BatchFlag=1 Reboot=0 ExitCode=0:0
   RunTime=00:30:00 TimeLimit=04:00:00 TimeMin=N/A
   SubmitTime=2024-01-15T09:25:00 EligibleTime=2024-01-15T09:25:00
   StartTime=2024-01-15T10:00:00 EndTime=2024-01-15T14:00:00 Deadline=N/A
   Partition=gpu AllocNode:Sid=login01:12345
   NodeList=node01
   BatchHost=node01
   NumNodes=1 NumCPUs=2 NumTasks=1 CPUs/Task=2
   Command=/home/testuser/scripts/array.sh
   WorkDir=/home/testuser/array_work
   StdErr=/home/testuser/logs/array_%A_%a.err
   StdOut=/home/testuser/logs/array_%A_%a.out
   SubmitLine=sbatch --array=1-10%5 --partition=gpu /home/testuser/scripts/array.sh`,

    invalidJob: `slurm_load_jobs error: Invalid job id specified`,

    pendingWithDependency: `JobId=12348 JobName=dependent_job
   UserId=testuser(1000) GroupId=testgroup(1000)
   Priority=4294901758 Nice=0 Account=default QOS=normal
   JobState=PENDING Reason=Dependency Dependency=afterok:12345
   Requeue=1 Restarts=0 BatchFlag=1 Reboot=0 ExitCode=0:0
   RunTime=00:00:00 TimeLimit=02:00:00 TimeMin=N/A
   SubmitTime=2024-01-15T10:00:00 EligibleTime=Unknown
   StartTime=Unknown EndTime=Unknown Deadline=N/A
   Partition=cpu AllocNode:Sid=login01:12345
   NodeList=
   NumNodes=1 NumCPUs=1 NumTasks=1 CPUs/Task=1
   Command=/home/testuser/scripts/postprocess.sh
   WorkDir=/home/testuser/project
   StdErr=/home/testuser/logs/postprocess.err
   StdOut=/home/testuser/logs/postprocess.out
   SubmitLine=sbatch --dependency=afterok:12345 /home/testuser/scripts/postprocess.sh`
};

export const MOCK_SINFO_OUTPUT = {
    basic: `gpu*|up|10|100/50/10/160
cpu|up|20|200/100/20/320
himem|up|5|40/10/0/50`,

    withDrain: `gpu*|up|10|100/50/10/160
cpu|up|20|200/100/20/320
maint|drain|2|0/0/16/16`
};

export const MOCK_SCONTROL_CONFIG_OUTPUT = {
    basic: `Configuration data as of 2024-01-15T12:00:00
AccountingStorageBackupHost = (null)
AccountingStorageEnforce = associations,limits,qos
AccountingStorageHost   = slurmdbd01
AccountingStorageLoc    = N/A
AccountingStoragePass   = ****
AccountingStoragePort   = 6819
AccountingStorageType   = accounting_storage/slurmdbd
AccountingStorageUser   = slurm
ClusterName             = testcluster
ControlMachine          = slurmctl01
ControlAddr             = 10.0.0.1
SlurmUser               = slurm(500)
SlurmdUser              = root(0)
SlurmctldPort           = 6817
SlurmdPort              = 6818
SlurmctldTimeout        = 120
SlurmdTimeout           = 300
SlurmctldVersion        = 23.02.0`
};

export const MOCK_SBATCH_OUTPUT = {
    success: 'Submitted batch job 12349',
    successArray: 'Submitted batch job 12350',
    error: {
        invalidPartition: 'sbatch: error: invalid partition specified: badpartition\nsbatch: error: Batch job submission failed: Invalid partition name specified',
        permissionDenied: 'sbatch: error: Unable to open file /path/to/script.sh',
        invalidTimeFormat: 'sbatch: error: Invalid time limit specification'
    }
};

export const MOCK_SCANCEL_OUTPUT = {
    success: '',
    notFound: 'scancel: error: Kill job error on job id 99999: Invalid job id specified'
};

export const MOCK_SACCT_OUTPUT = {
    basic: `12345|test_job|gpu|COMPLETED|02:00:00|04:00:00|1|node01|2024-01-15T08:00:00|2024-01-15T10:00:00|0:0
12346|another_job|cpu|FAILED|00:05:00|01:00:00|1|node02|2024-01-15T11:00:00|2024-01-15T11:05:00|1:0
12347|cancelled_job|gpu|CANCELLED|00:30:00|02:00:00|1|node03|2024-01-15T12:00:00|2024-01-15T12:30:00|0:0`,

    withSteps: `12345|test_job|gpu|COMPLETED|02:00:00|04:00:00|1|node01|2024-01-15T08:00:00|2024-01-15T10:00:00|0:0
12345.batch|batch||COMPLETED|02:00:00||1|node01|2024-01-15T08:00:00|2024-01-15T10:00:00|0:0
12345.0|step1||COMPLETED|00:30:00||1|node01|2024-01-15T08:00:00|2024-01-15T08:30:00|0:0
12345.1|step2||COMPLETED|01:30:00||1|node01|2024-01-15T08:30:00|2024-01-15T10:00:00|0:0`
};

/**
 * Helper to create command mock based on command string
 */
export function createCommandMock(responses: Record<string, { stdout: string; stderr: string }>) {
    return (cmd: string) => {
        for (const [pattern, response] of Object.entries(responses)) {
            if (cmd.includes(pattern)) {
                return { stdout: response.stdout, stderr: response.stderr };
            }
        }
        return { stdout: '', stderr: `Command not mocked: ${cmd}` };
    };
}
