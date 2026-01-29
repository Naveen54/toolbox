// Web Worker for downloading GDrive files in chunks
// This follows the logic from chunkDownloadAsset.js but adapted for GDrive

import { priorityQueue } from "async";

let PART_SIZE = 4 * 1024 * 1024; // 4MB chunks for GDrive
const CONCURRENCY = 6;

class GDriveAssetDownloader {
    totalParts: number = 0;
    writerRunning: boolean = false;
    downloaderQueue: any;
    totalLoaded: number = 0;
    progressTimer: any = null;
    fileWriter: any;
    fileId: string;
    accessToken: string;
    size: number;

    constructor({ fileWriter, fileId, accessToken, size }: { fileWriter: any, fileId: string, accessToken: string, size: number }) {
        this.fileWriter = fileWriter;
        this.fileId = fileId;
        this.accessToken = accessToken;
        this.size = size;

        this.downloaderQueue = priorityQueue(async (task: any) => {
            let lastError;
            for (let i = 0; i < 5; i++) {
                try {
                    await this.downloadPart(task);
                    return; // Success
                } catch (e) {
                    lastError = e;
                    console.warn(`[Worker] Retrying part ${task.partNumber} (${i + 1}/5) due to error: ${e}`);
                    if (i < 4) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
                    }
                }
            }
            throw lastError;
        }, CONCURRENCY);

        this.downloaderQueue.drain(async () => {
            clearInterval(this.progressTimer);
            postMessage({ type: "PROGRESS", downloaded: this.totalLoaded });
            this.totalLoaded = 0;
            postMessage({ type: "CLOSING_FILE" });
            await this.fileWriter.close();
            postMessage({ type: "DOWNLOAD_COMPLETED" });
        });

        this.downloaderQueue.error(async (err: any) => {
            this.downloaderQueue.kill();
            await this.fileWriter.close();
            clearInterval(this.progressTimer);
            postMessage({ type: "DOWNLOAD_FAILED", error: err.message });
        });
    }

    download = async ({ partsize }: { partsize?: number }) => {
        if (partsize) {
            PART_SIZE = partsize * 1024 * 1024;
        }

        this.totalParts = Math.ceil(this.size / PART_SIZE);
        let offset = 0;

        this.progressTimer = setInterval(() => {
            postMessage({ type: "PROGRESS", downloaded: this.totalLoaded });
            this.totalLoaded = 0;
        }, 1000);

        for (let i = 1; i <= this.totalParts; i++) {
            const end = Math.min(offset + PART_SIZE - 1, this.size - 1);
            this.downloaderQueue.push({ partNumber: i, range: [offset, end] }, i);
            offset = end + 1;
        }
    };

    downloadPart = async ({ range }: { range: [number, number] }) => {
        const url = `https://www.googleapis.com/drive/v3/files/${this.fileId}?alt=media`;
        const headers = {
            'Authorization': `Bearer ${this.accessToken}`,
            'Range': `bytes=${range[0]}-${range[1]}`
        };

        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.arrayBuffer();

        // Ensure sequential writing if necessary, although FileSystemWritableFileStream.seek/write handles offsets
        await this.writeData({ data, offset: range[0] });
        this.totalLoaded += data.byteLength;
    };

    writeData = async ({ data, offset }: { data: ArrayBuffer, offset: number }) => {
        let waitCount = 0;
        while (this.writerRunning) {
            waitCount++;
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        try {
            this.writerRunning = true;
            await this.fileWriter.seek(offset);
            await this.fileWriter.write(data);
        } catch (e) {
            console.error(`[Worker Write Error] Offset ${offset}: ${e}`);
            throw e;
        } finally {
            this.writerRunning = false;
        }
    };
}

onmessage = async (event) => {
    const { fileHandler, fileId, accessToken, size, partsize } = event.data;
    try {
        const fileWriter = await fileHandler.createWritable();
        const downloader = new GDriveAssetDownloader({ fileWriter, fileId, accessToken, size });
        await downloader.download({ partsize });
    } catch (e) {
        console.error(`[Worker Error] ${e}`);
        postMessage({ type: "DOWNLOAD_FAILED", error: (e as Error).message });
    }
};
