/**
 * VSCode API mock for unit testing
 */

export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2
}

export class TreeItem {
    label: string;
    id?: string;
    description?: string;
    tooltip?: any;
    iconPath?: any;
    contextValue?: string;
    collapsibleState: TreeItemCollapsibleState;

    constructor(label: string, collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None) {
        this.label = label;
        this.collapsibleState = collapsibleState;
    }
}

export class ThemeIcon {
    id: string;
    constructor(id: string) {
        this.id = id;
    }
}

export class MarkdownString {
    value: string = '';
    isTrusted: boolean = false;

    appendMarkdown(value: string): MarkdownString {
        this.value += value;
        return this;
    }
}

export class EventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];

    event = (listener: (e: T) => void) => {
        this.listeners.push(listener);
        return { dispose: () => this.listeners = this.listeners.filter(l => l !== listener) };
    };

    fire(data: T): void {
        this.listeners.forEach(l => l(data));
    }

    dispose(): void {
        this.listeners = [];
    }
}

export class Uri {
    static file(path: string): Uri {
        return new Uri(path);
    }

    constructor(public fsPath: string) {}
}

export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3
}

// Mock workspace configuration
const mockConfig: Record<string, any> = {
    refreshInterval: 30,
    autoRefresh: true,
    sshHost: '',
    sshUser: '',
    sshKeyPath: '',
    squeueFormat: '%i|%j|%P|%T|%M|%l|%D|%R|%S|%e',
    showAllUsers: false,
    partitionFilter: [],
    maxJobsDisplayed: 100
};

export const workspace = {
    getConfiguration: (section?: string) => ({
        get: <T>(key: string, defaultValue?: T): T => {
            const value = mockConfig[key];
            return (value !== undefined ? value : defaultValue) as T;
        },
        update: jest.fn().mockResolvedValue(undefined),
        has: (key: string) => key in mockConfig,
        inspect: jest.fn()
    }),
    onDidChangeConfiguration: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    openTextDocument: jest.fn().mockResolvedValue({ getText: () => '' })
};

export const window = {
    createOutputChannel: jest.fn().mockReturnValue({
        appendLine: jest.fn(),
        append: jest.fn(),
        clear: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
        dispose: jest.fn()
    }),
    createTreeView: jest.fn().mockReturnValue({
        reveal: jest.fn(),
        dispose: jest.fn()
    }),
    createStatusBarItem: jest.fn().mockReturnValue({
        text: '',
        tooltip: '',
        command: '',
        show: jest.fn(),
        hide: jest.fn(),
        dispose: jest.fn()
    }),
    showInformationMessage: jest.fn().mockResolvedValue(undefined),
    showWarningMessage: jest.fn().mockResolvedValue(undefined),
    showErrorMessage: jest.fn().mockResolvedValue(undefined),
    showInputBox: jest.fn().mockResolvedValue(undefined),
    showOpenDialog: jest.fn().mockResolvedValue(undefined),
    showTextDocument: jest.fn().mockResolvedValue(undefined),
    createWebviewPanel: jest.fn().mockReturnValue({
        webview: { html: '' },
        dispose: jest.fn()
    }),
    activeTextEditor: undefined
};

export const commands = {
    registerCommand: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    executeCommand: jest.fn().mockResolvedValue(undefined)
};

export const env = {
    clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
        readText: jest.fn().mockResolvedValue('')
    }
};

export enum StatusBarAlignment {
    Left = 1,
    Right = 2
}

export enum ViewColumn {
    One = 1,
    Two = 2,
    Three = 3
}

// Helper to reset mocks between tests
export function resetMocks(): void {
    jest.clearAllMocks();
}

// Helper to update mock config
export function setMockConfig(key: string, value: any): void {
    mockConfig[key] = value;
}
