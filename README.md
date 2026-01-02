# SLURM Job Monitor for VS Code

Monitor and manage SLURM cluster jobs directly from Visual Studio Code. This extension provides a sidebar view of your jobs, status bar integration, and commands for common job operations.

## Features

- **Sidebar Job View**: See all your running, pending, and completed jobs organized by state
- **Cluster Queue View**: Monitor the full cluster queue (optional)
- **Status Bar Integration**: Quick overview of running/pending job counts
- **Job Details Panel**: View comprehensive job information including resources, timing, and paths
- **Job Management**: Cancel jobs, submit scripts, view output/error logs
- **SSH Support**: Connect to remote SLURM clusters via SSH
- **Auto-Refresh**: Configurable automatic job list updates

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
npm run package

# Install the .vsix file
code --install-extension slurm-monitor-0.1.0.vsix
```

### Requirements

- VS Code 1.85.0 or higher
- Access to SLURM commands (`squeue`, `scontrol`, `scancel`, `sbatch`)
- For remote clusters: SSH access with key-based authentication

## Configuration

Open VS Code settings (`Ctrl+,`) and search for "SLURM" to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| `slurm.refreshInterval` | `30` | Auto-refresh interval in seconds |
| `slurm.autoRefresh` | `true` | Enable automatic job list updates |
| `slurm.sshHost` | `""` | SSH host for remote cluster (leave empty for local) |
| `slurm.sshUser` | `""` | SSH username (defaults to current user) |
| `slurm.sshKeyPath` | `""` | Path to SSH private key |
| `slurm.showAllUsers` | `false` | Show jobs from all users in queue view |
| `slurm.partitionFilter` | `[]` | Filter jobs by partition names |
| `slurm.maxJobsDisplayed` | `100` | Maximum number of jobs to display |

### Remote Cluster Setup

To connect to a remote SLURM cluster:

1. Ensure SSH key-based authentication is configured
2. Set the SSH host in settings:

```json
{
  "slurm.sshHost": "cluster.example.edu",
  "slurm.sshUser": "username",
  "slurm.sshKeyPath": "~/.ssh/id_rsa"
}
```

## Usage

### Sidebar Views

- **My Jobs**: Shows your jobs grouped by state (Running, Pending, Completed, etc.)
- **Cluster Queue**: Shows all jobs in the cluster queue (when enabled)

### Commands

Access commands via Command Palette (`Ctrl+Shift+P`) with the "SLURM:" prefix:

| Command | Description |
|---------|-------------|
| `SLURM: Refresh Jobs` | Manually refresh the job list |
| `SLURM: Cancel Job` | Cancel a running or pending job |
| `SLURM: Show Job Details` | View detailed job information |
| `SLURM: Submit Job Script` | Submit a SLURM batch script |
| `SLURM: Open Job Output` | Open the job's stdout file |
| `SLURM: Open Job Error Log` | Open the job's stderr file |
| `SLURM: Toggle Auto-Refresh` | Enable/disable automatic refresh |
| `SLURM: Show Cluster Info` | Display cluster status and partitions |

### Context Menu

Right-click on a job in the sidebar for quick actions:
- View job details
- Cancel job (for running/pending jobs)
- Open output/error files

### Status Bar

The status bar shows a summary: `SLURM: 3R / 5P` indicates 3 running and 5 pending jobs.

## Job States

| State | Icon | Description |
|-------|------|-------------|
| RUNNING | 🟢 | Job is currently executing |
| PENDING | 🟡 | Job is waiting for resources |
| COMPLETED | ✅ | Job finished successfully |
| FAILED | ❌ | Job terminated with error |
| CANCELLED | ⛔ | Job was cancelled |
| TIMEOUT | ⏰ | Job exceeded time limit |
| OUT_OF_MEMORY | 💾 | Job ran out of memory |

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

# Run linter
npm run lint

# Package for distribution
npm run package
```

## License

MIT

## Contributing

Issues and pull requests are welcome!
