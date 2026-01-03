# SLURM Job Monitor for VS Code

Monitor and manage SLURM cluster jobs directly from Visual Studio Code. This extension provides a sidebar view of your jobs, status bar integration, and commands for common job operations.

## Features

- **Sidebar Job Views**: See your running, pending, and completed jobs organized by state
- **Cluster Queue View**: Monitor the full cluster queue
- **Job History**: View your recent completed jobs from sacct
- **Status Bar Integration**: Quick overview of running/pending job counts
- **Cluster Dashboard**: View cluster resources, partitions, and account usage
- **Job Details Panel**: View comprehensive job information including resources, timing, and paths
- **Job Management**: Cancel, resubmit jobs, submit scripts, view output/error logs
- **SSH Support**: Connect to remote SLURM clusters via SSH
- **Auto-Refresh**: Configurable automatic job list updates
- **Notifications**: Get notified when jobs start, complete, or fail
- **SLURM Script Support**: Hover hints and completions for #SBATCH directives
- **Quick Filters**: Filter jobs by partition, state, or name pattern

## Installation

### From Source

```bash
# Clone and enter directory
cd slurm-monitor

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Package the extension
vsce package --allow-missing-repository

# Install the .vsix file
code --install-extension slurm-monitor-0.2.0.vsix
```

### Requirements

- VS Code 1.85.0 or higher
- Access to SLURM commands (`squeue`, `scontrol`, `scancel`, `sbatch`, `sacct`)
- For remote clusters: SSH access with key-based authentication

## Configuration

Open VS Code settings (`Ctrl+,` or `Cmd+,`) and search for "SLURM" to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| `slurm.refreshInterval` | `30` | Auto-refresh interval in seconds |
| `slurm.autoRefresh` | `true` | Enable automatic job list updates |
| `slurm.sshHost` | `""` | SSH host for remote cluster (leave empty for local) |
| `slurm.sshUser` | `""` | SSH username (auto-detected if empty) |
| `slurm.sshKeyPath` | `""` | Path to SSH private key |
| `slurm.showAllUsers` | `false` | Show jobs from all users in queue view |
| `slurm.partitionFilter` | `[]` | Filter jobs by partition names |
| `slurm.maxJobsDisplayed` | `100` | Maximum number of jobs to display |
| `slurm.enableNotifications` | `true` | Enable job state change notifications |
| `slurm.notifyOnComplete` | `true` | Notify when jobs complete |
| `slurm.notifyOnFail` | `true` | Notify when jobs fail |
| `slurm.notifyOnStart` | `false` | Notify when jobs start running |

### Remote Cluster Setup

To connect to a remote SLURM cluster:

1. Ensure SSH key-based authentication is configured
2. Set the SSH host in settings:

```json
{
  "slurm.sshHost": "cluster.example.edu",
  "slurm.sshUser": "username"
}
```

The extension will automatically detect your username on the remote cluster if `sshUser` is not set.

## Usage

### Sidebar Views

- **My Jobs**: Shows your jobs grouped by state (Running, Pending, Completed, etc.)
- **Cluster Queue**: Shows all jobs in the cluster queue
- **Job History**: Shows your recently completed jobs

### Commands

Access commands via Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) with the "SLURM:" prefix:

| Command | Description |
|---------|-------------|
| `SLURM: Refresh Jobs` | Manually refresh the job list |
| `SLURM: Cancel Job` | Cancel a running or pending job |
| `SLURM: Resubmit Job` | Resubmit a job using its original submit command |
| `SLURM: Show Job Details` | View detailed job information |
| `SLURM: Submit Job Script` | Submit a SLURM batch script |
| `SLURM: Submit Current File as Job` | Submit the currently open file |
| `SLURM: Open Job Output` | Open the job's stdout file |
| `SLURM: Open Job Error Log` | Open the job's stderr file |
| `SLURM: Show Cluster Dashboard` | Display cluster status, partitions, and resources |
| `SLURM: Filter Jobs` | Filter jobs by partition, state, or name |
| `SLURM: Clear Job Filter` | Remove active filters |
| `SLURM: Toggle Auto-Refresh` | Enable/disable automatic refresh |

### Context Menu

Right-click on a job in the sidebar for quick actions:
- View job details
- Cancel job (for running/pending jobs)
- Resubmit job
- Open output/error files

### Status Bar

The status bar shows a summary: `SLURM: 3R / 5P` indicates 3 running and 5 pending jobs. Click it to refresh.

### SLURM Script Editor

When editing `.slurm`, `.sbatch`, or `.sh` files:
- Hover over `#SBATCH` directives for documentation
- Get completions for common SBATCH options
- Click the play button in the editor title to submit the script

## Job States

| State | Icon | Description |
|-------|------|-------------|
| RUNNING | sync | Job is currently executing |
| PENDING | watch | Job is waiting for resources |
| COMPLETED | pass | Job finished successfully |
| FAILED | error | Job terminated with error |
| CANCELLED | circle-slash | Job was cancelled |
| TIMEOUT | clock | Job exceeded time limit |
| OUT_OF_MEMORY | alert | Job ran out of memory |

## Troubleshooting

### Jobs not loading

1. Check the Output panel (`View > Output`) and select "SLURM Monitor"
2. Verify SLURM commands work in terminal: `squeue -u $USER`
3. For remote clusters, test SSH: `ssh cluster.example.edu squeue --version`

### SSH Connection Issues

- Ensure key-based authentication is configured (no password prompts)
- Check that `BatchMode=yes` works: `ssh -o BatchMode=yes host echo test`
- Verify the SSH key path is correct

### Permission Errors

- Ensure you have permission to view jobs (SLURM ACLs)
- Check if running on a compute node that may have restricted access

## Development

```bash
# Install dependencies
npm install

# Watch for changes during development
npm run watch

# Run tests
npm test

# Package for distribution
vsce package --allow-missing-repository
```

## License

MIT

## Contributing

Issues and pull requests are welcome at https://github.com/mattmuller0/slurm-monitor
