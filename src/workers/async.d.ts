declare module 'async' {
    export interface PriorityQueue<T> {
        push(task: T, priority?: number): void;
        drain(handler?: () => void | Promise<void>): void | Promise<void>;
        error(handler?: (err: Error, task: T) => void | Promise<void>): void | Promise<void>;
        kill(): void;
    }

    export function priorityQueue<T>(worker: (task: T) => void | Promise<void>, concurrency: number): PriorityQueue<T>;
    export function retry<T>(opts: number | { times: number, interval?: number | ((retryCount: number) => number) }, task: (callback: (err?: Error | null, result?: T) => void) => void, callback?: (err?: Error | null, result?: T) => void): void;
}
