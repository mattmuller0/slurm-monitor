/**
 * Unit tests for SlurmService
 */

import { SlurmService } from '../slurmService';
import * as vscode from 'vscode';
import { exec } from 'child_process';

// Mock child_process
jest.mock('child_process', () => ({
    exec: jest.fn()
}));

jest.mock('util', () => ({
    promisify: (fn: any) => fn
}));

const mockExec = exec as jest.MockedFunction<typeof exec>;

describe('SlurmService', () => {
    let service: SlurmService;
    let mockOutputChannel: vscode.OutputChannel;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOutputChannel = vscode.window.createOutputChannel('test');
        service = new SlurmService(mockOutputChannel);
    });

    describe('parseSqueueOutput', () => {
        it('should parse basic squeue output correctly', async () => {
            const squeueOutput = `12345|my_job|gpu|R|1:30:00|4:00:00|1|node01|2024-01-15T10:00:00|2024-01-15T14:00:00
12346|another_job|cpu|PD|0:00|2:00:00|2|Priority|N/A|N/A`;

            mockExec.mockImplementation((cmd: any, opts: any, callback?: any) => {
                if (typeof opts === 'function') {
                    callback = opts;
                }
                return { stdout: squeueOutput, stderr: '' } as any;
            });

            const jobs = await service.getJobs();

            expect(jobs).toHaveLength(2);

            // First job
            expect(jobs[0].jobId).toBe('12345');
            expect(jobs[0].name).toBe('my_job');
            expect(jobs[0].partition).toBe('gpu');
            expect(jobs[0].state).toBe('RUNNING');
            expect(jobs[0].timeUsed).toBe('1:30:00');
            expect(jobs[0].nodes).toBe(1);

            // Second job
            expect(jobs[1].jobId).toBe('12346');
            expect(jobs[1].state).toBe('PENDING');
            expect(jobs[1].nodelist).toBe('Priority');
        });

        it('should handle empty squeue output', async () => {
            mockExec.mockImplementation(() => {
                return { stdout: '', stderr: '' } as any;
            });

            const jobs = await service.getJobs();
            expect(jobs).toHaveLength(0);
        });

        it('should parse array job IDs correctly', async () => {
            const squeueOutput = `12345_1|array_job|gpu|R|0:30:00|4:00:00|1|node01|2024-01-15T10:00:00|N/A
12345_2|array_job|gpu|R|0:25:00|4:00:00|1|node02|2024-01-15T10:05:00|N/A
12345_3|array_job|gpu|PD|0:00|4:00:00|1|Resources|N/A|N/A`;

            mockExec.mockImplementation(() => {
                return { stdout: squeueOutput, stderr: '' } as any;
            });

            const jobs = await service.getJobs();

            expect(jobs).toHaveLength(3);
            expect(jobs[0].jobId).toBe('12345_1');
            expect(jobs[1].jobId).toBe('12345_2');
            expect(jobs[2].jobId).toBe('12345_3');
        });
    });

    describe('parseJobState', () => {
        it('should parse common state codes', async () => {
            const testCases = [
                { output: '1|job|p|R|0:00|1:00|1|n|N/A|N/A', expected: 'RUNNING' },
                { output: '1|job|p|PD|0:00|1:00|1|n|N/A|N/A', expected: 'PENDING' },
                { output: '1|job|p|CD|0:00|1:00|1|n|N/A|N/A', expected: 'COMPLETED' },
                { output: '1|job|p|CA|0:00|1:00|1|n|N/A|N/A', expected: 'CANCELLED' },
                { output: '1|job|p|F|0:00|1:00|1|n|N/A|N/A', expected: 'FAILED' },
                { output: '1|job|p|TO|0:00|1:00|1|n|N/A|N/A', expected: 'TIMEOUT' },
                { output: '1|job|p|NF|0:00|1:00|1|n|N/A|N/A', expected: 'NODE_FAIL' },
                { output: '1|job|p|OOM|0:00|1:00|1|n|N/A|N/A', expected: 'OUT_OF_MEMORY' },
                { output: '1|job|p|CG|0:00|1:00|1|n|N/A|N/A', expected: 'COMPLETING' },
                { output: '1|job|p|S|0:00|1:00|1|n|N/A|N/A', expected: 'SUSPENDED' },
            ];

            for (const { output, expected } of testCases) {
                mockExec.mockImplementation(() => {
                    return { stdout: output, stderr: '' } as any;
                });

                const jobs = await service.getJobs();
                expect(jobs[0].state).toBe(expected);
            }
        });

        it('should handle composite states like "PD (Dependency)"', async () => {
            const output = '1|job|p|PD (Dependency)|0:00|1:00|1|Dependency|N/A|N/A';

            mockExec.mockImplementation(() => {
                return { stdout: output, stderr: '' } as any;
            });

            const jobs = await service.getJobs();
            expect(jobs[0].state).toBe('PENDING');
        });
    });

    describe('parseScontrolOutput', () => {
        it('should parse scontrol show job output', async () => {
            const scontrolOutput = `JobId=12345 JobName=test_job
   UserId=testuser(1000) GroupId=testgroup(1000)
   Partition=gpu Account=default
   JobState=RUNNING Reason=None
   StartTime=2024-01-15T10:00:00 EndTime=2024-01-15T14:00:00
   RunTime=01:30:00 TimeLimit=04:00:00
   NumNodes=1 NumCPUs=4 NumTasks=1
   CPUs/Task=4 MinMemoryNode=16G
   NodeList=node01 BatchHost=node01
   StdOut=/home/testuser/job.out StdErr=/home/testuser/job.err
   WorkDir=/home/testuser/project
   Command=/home/testuser/scripts/run.sh`;

            mockExec.mockImplementation((cmd: any) => {
                if (cmd.includes('scontrol show job')) {
                    return { stdout: scontrolOutput, stderr: '' } as any;
                }
                return { stdout: '', stderr: '' } as any;
            });

            const details = await service.getJobDetails('12345');

            expect(details).not.toBeNull();
            expect(details!.jobId).toBe('12345');
            expect(details!.name).toBe('test_job');
            expect(details!.state).toBe('RUNNING');
            expect(details!.partition).toBe('gpu');
            expect(details!.numCPUs).toBe(4);
            expect(details!.stdoutPath).toBe('/home/testuser/job.out');
            expect(details!.stderrPath).toBe('/home/testuser/job.err');
            expect(details!.workDir).toBe('/home/testuser/project');
        });

        it('should return null for invalid job id', async () => {
            mockExec.mockImplementation(() => {
                return { stdout: 'Invalid job id specified', stderr: '' } as any;
            });

            const details = await service.getJobDetails('99999');
            expect(details).toBeNull();
        });
    });

    describe('SSH command building', () => {
        it('should wrap commands with SSH when host is configured', () => {
            // Access private method through any type
            const serviceWithSsh = new SlurmService(mockOutputChannel);
            (serviceWithSsh as any).config = {
                ...service.getConfig(),
                sshHost: 'cluster.example.com',
                sshUser: 'testuser',
                sshKeyPath: '/home/user/.ssh/id_rsa'
            };

            const command = (serviceWithSsh as any).buildCommand('squeue');

            expect(command).toContain('ssh');
            expect(command).toContain('-i /home/user/.ssh/id_rsa');
            expect(command).toContain('testuser@cluster.example.com');
            expect(command).toContain('BatchMode=yes');
            expect(command).toContain('squeue');
        });

        it('should not wrap commands when no SSH host is configured', () => {
            const command = (service as any).buildCommand('squeue');
            expect(command).toBe('squeue');
            expect(command).not.toContain('ssh');
        });
    });

    describe('cancelJob', () => {
        it('should execute scancel command', async () => {
            mockExec.mockImplementation(() => {
                return { stdout: '', stderr: '' } as any;
            });

            const result = await service.cancelJob('12345');
            expect(result).toBe(true);
        });

        it('should throw error on failure', async () => {
            mockExec.mockImplementation(() => {
                throw { stderr: 'Job not found', code: 1 };
            });

            await expect(service.cancelJob('99999')).rejects.toThrow();
        });
    });

    describe('submitJob', () => {
        it('should submit job and return job ID', async () => {
            mockExec.mockImplementation(() => {
                return { stdout: 'Submitted batch job 12345', stderr: '' } as any;
            });

            const jobId = await service.submitJob({
                scriptPath: '/path/to/script.sh'
            });

            expect(jobId).toBe('12345');
        });

        it('should include optional parameters in sbatch command', async () => {
            let executedCommand = '';
            mockExec.mockImplementation((cmd: any) => {
                executedCommand = cmd;
                return { stdout: 'Submitted batch job 12345', stderr: '' } as any;
            });

            await service.submitJob({
                scriptPath: '/path/to/script.sh',
                jobName: 'test_job',
                partition: 'gpu',
                nodes: 2,
                cpusPerTask: 4,
                memory: '16G',
                time: '4:00:00',
                gres: 'gpu:2'
            });

            expect(executedCommand).toContain('-J test_job');
            expect(executedCommand).toContain('-p gpu');
            expect(executedCommand).toContain('-N 2');
            expect(executedCommand).toContain('-c 4');
            expect(executedCommand).toContain('--mem 16G');
            expect(executedCommand).toContain('-t 4:00:00');
            expect(executedCommand).toContain('--gres gpu:2');
        });

        it('should handle array job submission', async () => {
            let executedCommand = '';
            mockExec.mockImplementation((cmd: any) => {
                executedCommand = cmd;
                return { stdout: 'Submitted batch job 12345', stderr: '' } as any;
            });

            await service.submitJob({
                scriptPath: '/path/to/script.sh',
                array: '1-10%5'
            });

            expect(executedCommand).toContain('-a 1-10%5');
        });
    });

    describe('resubmitJob', () => {
        it('should resubmit job using original submit command', async () => {
            const scontrolOutput = `JobId=12345 JobName=test_job
   SubmitLine=sbatch --partition=gpu --time=4:00:00 /path/to/script.sh
   JobState=COMPLETED`;

            let resubmitCommand = '';
            mockExec.mockImplementation((cmd: any) => {
                if (cmd.includes('scontrol show job')) {
                    return { stdout: scontrolOutput, stderr: '' } as any;
                }
                if (cmd.includes('sbatch')) {
                    resubmitCommand = cmd;
                    return { stdout: 'Submitted batch job 12346', stderr: '' } as any;
                }
                return { stdout: '', stderr: '' } as any;
            });

            const newJobId = await service.resubmitJob('12345');

            expect(newJobId).toBe('12346');
            expect(resubmitCommand).toContain('--partition=gpu');
            expect(resubmitCommand).toContain('--time=4:00:00');
        });

        it('should throw error if no submit command found', async () => {
            mockExec.mockImplementation((cmd: any) => {
                if (cmd.includes('scontrol show job')) {
                    return { stdout: 'JobId=12345 JobName=test', stderr: '' } as any;
                }
                return { stdout: '', stderr: '' } as any;
            });

            await expect(service.resubmitJob('12345')).rejects.toThrow('No submit command found');
        });
    });

    describe('getClusterInfo', () => {
        it('should parse cluster info correctly', async () => {
            mockExec.mockImplementation((cmd: any) => {
                if (cmd.includes('scontrol show config')) {
                    return {
                        stdout: `ClusterName = testcluster
ControlMachine = control01
SlurmctldVersion = 23.02.0`,
                        stderr: ''
                    } as any;
                }
                if (cmd.includes('sinfo')) {
                    return {
                        stdout: `gpu*|up|10|100/50/10/160
cpu|up|20|200/100/20/320`,
                        stderr: ''
                    } as any;
                }
                return { stdout: '', stderr: '' } as any;
            });

            const info = await service.getClusterInfo();

            expect(info.name).toBe('testcluster');
            expect(info.controlMachine).toBe('control01');
            expect(info.slurmVersion).toBe('23.02.0');
            expect(info.partitions).toHaveLength(2);
        });
    });

    describe('testConnection', () => {
        it('should return true when squeue is available', async () => {
            mockExec.mockImplementation(() => {
                return { stdout: 'slurm 23.02.0', stderr: '' } as any;
            });

            const result = await service.testConnection();
            expect(result).toBe(true);
        });

        it('should return false when squeue fails', async () => {
            mockExec.mockImplementation(() => {
                throw new Error('Command not found');
            });

            const result = await service.testConnection();
            expect(result).toBe(false);
        });
    });
});

describe('getJobResourceUsage', () => {
    let service: SlurmService;
    let mockOutputChannel: vscode.OutputChannel;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOutputChannel = vscode.window.createOutputChannel('test');
        service = new SlurmService(mockOutputChannel);
    });

    it('should return resource usage from sstat for running jobs', async () => {
        mockExec.mockImplementation((cmd: any) => {
            if (cmd.includes('sstat')) {
                return { stdout: '12345|01:30:00|100|4G|8G|16G|1G|2G', stderr: '' } as any;
            }
            return { stdout: '', stderr: '' } as any;
        });

        const usage = await service.getJobResourceUsage('12345');

        expect(usage).not.toBeNull();
        expect(usage!.jobId).toBe('12345');
        expect(usage!.cpuTime).toBe('01:30:00');
        expect(usage!.memUsed).toBe('4G');
        expect(usage!.memUsedMax).toBe('8G');
    });

    it('should fall back to sacct for completed jobs', async () => {
        mockExec.mockImplementation((cmd: any) => {
            if (cmd.includes('sstat')) {
                return { stdout: '', stderr: '' } as any;
            }
            if (cmd.includes('sacct')) {
                return { stdout: '12345|02:00:00|0|2G|4G|8G|500M|1G', stderr: '' } as any;
            }
            return { stdout: '', stderr: '' } as any;
        });

        const usage = await service.getJobResourceUsage('12345');

        expect(usage).not.toBeNull();
        expect(usage!.cpuTime).toBe('02:00:00');
    });

    it('should return null when no data available', async () => {
        mockExec.mockImplementation(() => {
            return { stdout: '', stderr: '' } as any;
        });

        const usage = await service.getJobResourceUsage('12345');
        expect(usage).toBeNull();
    });
});

describe('getJobHistory', () => {
    let service: SlurmService;
    let mockOutputChannel: vscode.OutputChannel;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOutputChannel = vscode.window.createOutputChannel('test');
        service = new SlurmService(mockOutputChannel);
    });

    it('should parse job history from sacct', async () => {
        const sacctOutput = `12345|test_job|gpu|COMPLETED|01:30:00|04:00:00|1|node01|2024-01-15T10:00:00|2024-01-15T11:30:00|0:0|4G|8G|01:30:00`;

        mockExec.mockImplementation(() => {
            return { stdout: sacctOutput, stderr: '' } as any;
        });

        const history = await service.getJobHistory(100);

        expect(history).toHaveLength(1);
        expect(history[0].jobId).toBe('12345');
        expect(history[0].name).toBe('test_job');
        expect(history[0].state).toBe('COMPLETED');
        expect(history[0].elapsed).toBe('01:30:00');
        expect(history[0].maxRSS).toBe('4G');
    });

    it('should return empty array when no history', async () => {
        mockExec.mockImplementation(() => {
            return { stdout: '', stderr: '' } as any;
        });

        const history = await service.getJobHistory(100);

        expect(history).toHaveLength(0);
    });
});

describe('readRemoteFile', () => {
    let service: SlurmService;
    let mockOutputChannel: vscode.OutputChannel;

    beforeEach(() => {
        jest.clearAllMocks();
        mockOutputChannel = vscode.window.createOutputChannel('test');
        service = new SlurmService(mockOutputChannel);
    });

    it('should read file content from remote', async () => {
        mockExec.mockImplementation(() => {
            return { stdout: 'Line 1\nLine 2\nLine 3', stderr: '' } as any;
        });

        const content = await service.readRemoteFile('/path/to/file.out');

        expect(content).toBe('Line 1\nLine 2\nLine 3');
    });
});

describe('Time parsing utilities', () => {
    // Test the time parsing that's used in extension.ts
    function parseTimeToSeconds(timeStr: string | undefined): number {
        if (!timeStr) {return 0;}

        let days = 0;
        let timePart = timeStr;

        if (timeStr.includes('-')) {
            const [dayPart, rest] = timeStr.split('-');
            days = parseInt(dayPart, 10) || 0;
            timePart = rest;
        }

        const parts = timePart.split(':').map(p => parseInt(p, 10) || 0);

        if (parts.length === 3) {
            return days * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            return days * 86400 + parts[0] * 60 + parts[1];
        }

        return 0;
    }

    it('should parse HH:MM:SS format', () => {
        expect(parseTimeToSeconds('01:30:00')).toBe(5400);
        expect(parseTimeToSeconds('00:05:30')).toBe(330);
        expect(parseTimeToSeconds('12:00:00')).toBe(43200);
    });

    it('should parse MM:SS format', () => {
        expect(parseTimeToSeconds('30:00')).toBe(1800);
        expect(parseTimeToSeconds('05:30')).toBe(330);
    });

    it('should parse D-HH:MM:SS format', () => {
        expect(parseTimeToSeconds('1-00:00:00')).toBe(86400);
        expect(parseTimeToSeconds('2-12:30:00')).toBe(2 * 86400 + 12 * 3600 + 30 * 60);
        expect(parseTimeToSeconds('7-00:00:00')).toBe(7 * 86400);
    });

    it('should handle undefined/empty input', () => {
        expect(parseTimeToSeconds(undefined)).toBe(0);
        expect(parseTimeToSeconds('')).toBe(0);
    });
});
