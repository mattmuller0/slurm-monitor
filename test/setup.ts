/**
 * Jest test setup file
 */

// Export to make this a module (required for declare global)
export {};

// Extend Jest matchers if needed
expect.extend({
    toBeValidJobId(received: string) {
        const pass = /^\d+(_\d+)?$/.test(received);
        return {
            pass,
            message: () => `expected ${received} ${pass ? 'not ' : ''}to be a valid SLURM job ID`
        };
    }
});

// Global test timeout
jest.setTimeout(10000);

declare global {
    namespace jest {
        interface Matchers<R> {
            toBeValidJobId(): R;
        }
    }
}
