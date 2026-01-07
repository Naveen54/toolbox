export interface GDriveFile {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    path?: string; // Relative path for local storage
}

export const fetchFolderContentsRecursive = async (
    accessToken: string,
    folderId: string,
    currentPath: string = ''
): Promise<GDriveFile[]> => {
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size)`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }
    );
    const data = await response.json();
    if (data.error) {
        console.error(`[Recursive Fetch Error] Folder: ${folderId}`, data.error);
        throw new Error(data.error.message);
    }

    const files: GDriveFile[] = [];
    const items = data.files || [];

    for (const item of items) {
        const itemPath = currentPath ? `${currentPath}/${item.name}` : item.name;
        if (item.mimeType === 'application/vnd.google-apps.folder') {
            const subFolderFiles = await fetchFolderContentsRecursive(accessToken, item.id, itemPath);
            files.push(...subFolderFiles);
        } else {
            files.push({ ...item, path: itemPath });
        }
    }

    return files;
};

export const getFileHandleRecursive = async (
    rootDirHandle: FileSystemDirectoryHandle,
    path: string
): Promise<FileSystemFileHandle> => {
    const parts = path.split('/');
    let currentDir = rootDirHandle;

    for (let i = 0; i < parts.length - 1; i++) {
        currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
    }

    return await currentDir.getFileHandle(parts[parts.length - 1], { create: true });
};
