# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm install                              # Install dependencies
npm run compile                          # Compile TypeScript to out/
npm run watch                            # Watch mode
npm run lint                             # ESLint on source files
npm test                                 # Run Jest unit tests (92 tests)
npm run test:watch                       # Jest in watch mode
npm run test:coverage                    # Jest with coverage report (output: coverage/)
npx jest test/slurmService.test.ts       # Run a single test file
npx jest -t "parses squeue output"       # Run tests matching a name pattern
vsce package --allow-missing-repository  # Build .vsix package
code --install-extension slurm-monitor-0.2.1.vsix --force  # Install locally
```

`npm run test:integration` uses the VSCode Electron runner (`@vscode/test-electron`), not Jest — it requires a running display and is separate from the Jest suite above.

## Architecture

Source files live in the project root (not `src/`), compiled to `out/`:

- **`extension.ts`** — Activation entry point. Registers all commands in a single `commands` object iterated in a loop. Manages the status bar item, webview panels (dashboard, job details, resource usage), job state change notifications, and SLURM language support (hover/completions for `#SBATCH` directives).
- **`slurmService.ts`** — All SLURM command execution. Wraps local or SSH commands via `buildCommand()`. Parses `squeue`, `scontrol`, `sbatch`, `scancel`, `sacct`, `sinfo` output into typed objects. `getUser()` is async — it runs `whoami` on the remote host when `sshUser` is not configured.
- **`slurmProvider.ts`** — VSCode `TreeDataProvider` implementations. `SlurmJobsProvider` groups jobs by state and collapses array job tasks under their parent. `SlurmQueueProvider` shows all cluster jobs. `JobHistoryProvider` pulls from `sacct`.
- **`types.ts`** — All TypeScript interfaces: `SlurmJob`, `SlurmJobDetails`, `SlurmConfig`, `JobFilter`, `SubmitOptions`, `JobHistoryEntry`, etc.

## Testing

Tests use Jest with `ts-jest`. The VSCode API is mocked via `moduleNameMapper` pointing `vscode` → `test/__mocks__/vscode.ts`. `child_process.exec` is mocked to simulate SLURM command output.

**Fixtures** are in `test/__mocks__/slurmCommands.ts` — pre-built strings for `squeue`, `scontrol`, `sacct`, `sbatch`, and `sinfo` output covering all job states, array jobs, and error cases. Use `createCommandMock(responses)` from that file to build per-test `exec` mocks keyed by command substring.

A custom Jest matcher `toBeValidJobId()` (defined in `test/setup.ts`) validates that a string matches `\d+(_\d+)?`.

## Code Patterns

**SSH escaping**: `squeue` format strings containing `|` must be shell-quoted to prevent bash interpretation on the remote side.

**Array jobs**: Identified by `_` in job ID (e.g., `12345_1`). Grouped under a synthetic parent node in the tree view.

**State mapping**: Raw SLURM codes (`PD`, `R`, `CD`, `CG`, etc.) are mapped to full `JobState` strings via `STATE_MAP` in `slurmService.ts`. The `JobState` type in `types.ts` includes `| string` to accommodate unknown states without breaking the type system.

**Webview HTML**: Shared helpers at the bottom of `extension.ts` — `BASE_STYLES`, `html(body)`, `stat()`, `tableRow()`, `section()` — keep panel markup consistent.

**Job history**: `sacct` is called with `-X` to return only top-level job allocations, suppressing `.batch` and step sub-records.

## Configuration

All settings use the `slurm.` prefix:

| Setting | Default | Notes |
|---|---|---|
| `sshHost` | `""` | Empty = local execution |
| `sshUser` | `""` | Auto-detected via `whoami` if empty |
| `sshKeyPath` | `""` | Path to SSH private key |
| `refreshInterval` | `30` | Seconds; minimum 5 |
| `autoRefresh` | `true` | |
| `squeueFormat` | `%i\|%j\|%P\|%T\|%M\|%l\|%D\|%R\|%S\|%e` | Field order must match parser |
| `showAllUsers` | `false` | Queue view scope |
| `partitionFilter` | `[]` | Empty = show all partitions |
| `maxJobsDisplayed` | `100` | |
| `enableNotifications` | `true` | |
| `notifyOnComplete` / `notifyOnFail` | `true` | |
| `notifyOnStart` | `false` | |
