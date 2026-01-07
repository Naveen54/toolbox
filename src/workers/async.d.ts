declare module 'async' {
    export function priorityQueue<T, R>(worker: (task: T, callback: (err?: Error | null, result?: R) => void) => void, concurrency: number): any;
    export function retry<T>(opts: number | { times: number, interval?: number | ((retryCount: number) => number) }, task: (callback: (err?: Error | null, result?: T) => void) => void, callback?: (err?: Error | null, result?: T) => void): void;
}
