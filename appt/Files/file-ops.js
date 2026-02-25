// file-ops.js - 文件操作高层逻辑

async function backupFolder(repoFull, path) {
    const [owner, repo] = repoFull.split('/');
    const parent = path.substring(0, path.lastIndexOf('/') + 1);
    const name = path.substring(path.lastIndexOf('/') + 1);
    let backupName = name + '_bak';
    let backupPath = parent + backupName;
    let counter = 1;
    while (await checkDestination(repoFull, backupPath)) {
        backupName = name + '_bak' + counter;
        backupPath = parent + backupName;
        counter++;
    }
    const items = await apiCall(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`);
    for (const item of items) {
        if (item.type === 'file') {
            const newPath = backupPath + '/' + item.name;
            await moveCopyItem(repoFull, item.path, repoFull, newPath, true, `Backup ${item.path} to ${newPath}`, 'overwrite');
        } else {
            await backupFolder(repoFull, item.path);
        }
    }
    return backupPath;
}

async function backupFile(repoFull, path) {
    const [owner, repo] = repoFull.split('/');
    const parent = path.substring(0, path.lastIndexOf('/') + 1);
    const name = path.substring(path.lastIndexOf('/') + 1);
    const lastDot = name.lastIndexOf('.');
    let baseName, ext;
    if (lastDot === -1) {
        baseName = name;
        ext = '';
    } else {
        baseName = name.substring(0, lastDot);
        ext = name.substring(lastDot);
    }
    const timestamp = new Date().getTime();
    const backupName = baseName + '_bak_' + timestamp + ext;
    const backupPath = parent + backupName;
    await moveCopyItem(repoFull, path, repoFull, backupPath, true, `Backup ${path} to ${backupPath}`, 'overwrite');
    return backupPath;
}

async function mergeFolder(srcRepo, srcPath, destRepo, destPath, isMove, mode, messagePrefix) {
    const [srcOwner, srcRepoName] = srcRepo.split('/');
    const items = await apiCall(`https://api.github.com/repos/${srcOwner}/${srcRepoName}/contents/${srcPath}`);
    for (const item of items) {
        const srcItemPath = item.path;
        const relativePath = srcItemPath.substring(srcPath.length + 1);
        const destItemPath = destPath ? `${destPath}/${relativePath}` : relativePath;
        if (item.type === 'dir') {
            const destExists = await checkDestination(destRepo, destItemPath);
            if (destExists) {
                await mergeFolder(srcRepo, srcItemPath, destRepo, destItemPath, isMove, mode, `${messagePrefix}/${relativePath}`);
            } else {
                await copyFolderRecursive(srcRepo, srcItemPath, destRepo, destItemPath, isMove, `${messagePrefix}/${relativePath}`);
            }
        } else {
            const destExists = await checkDestination(destRepo, destItemPath);
            if (destExists) {
                if (mode === 'incremental') {
                    await moveCopyItem(srcRepo, srcItemPath, destRepo, destItemPath, false, `覆盖 ${relativePath}`, 'overwrite');
                } else if (mode === 'incremental_backup') {
                    await backupFile(destRepo, destItemPath);
                    await moveCopyItem(srcRepo, srcItemPath, destRepo, destItemPath, false, `复制 ${relativePath}`, 'overwrite');
                }
            } else {
                await moveCopyItem(srcRepo, srcItemPath, destRepo, destItemPath, false, `复制 ${relativePath}`, 'overwrite');
            }
        }
    }
    if (isMove && mode !== 'incremental_backup') {
        for (const item of items) {
            if (item.type === 'file') {
                await deleteItem(srcRepo, item.path, 'file', `Delete after move ${item.path}`);
            }
        }
    }
}

async function copyFolderRecursive(srcRepo, srcPath, destRepo, destPath, isMove, messagePrefix) {
    const [srcOwner, srcRepoName] = srcRepo.split('/');
    const items = await apiCall(`https://api.github.com/repos/${srcOwner}/${srcRepoName}/contents/${srcPath}`);
    for (const item of items) {
        const srcItemPath = item.path;
        const relativePath = srcItemPath.substring(srcPath.length + 1);
        const destItemPath = destPath ? `${destPath}/${relativePath}` : relativePath;
        if (item.type === 'dir') {
            await copyFolderRecursive(srcRepo, srcItemPath, destRepo, destItemPath, isMove, `${messagePrefix}/${relativePath}`);
        } else {
            await moveCopyItem(srcRepo, srcItemPath, destRepo, destItemPath, false, `复制 ${relativePath}`, 'overwrite');
        }
    }
    if (isMove) {
        for (const item of items) {
            if (item.type === 'file') {
                await deleteItem(srcRepo, item.path, 'file', `Delete after move ${item.path}`);
            }
        }
    }
}

async function moveCopyItem(srcRepo, srcPath, destRepo, destPath, isMove, message, conflictMode) {
    srcPath = normalizePath(srcPath);
    destPath = normalizePath(destPath);
    const [srcOwner, srcRepoName] = srcRepo.split('/');
    const srcData = await apiCall(`https://api.github.com/repos/${srcOwner}/${srcRepoName}/contents/${srcPath}`);

    if (Array.isArray(srcData)) {
        addLogStep('INFO', `开始处理文件夹: ${srcPath}`);
        const destExists = await checkDestination(destRepo, destPath);
        if (destExists) {
            switch (conflictMode) {
                case 'overwrite':
                    await deleteItem(destRepo, destPath, 'dir', `Delete for overwrite ${destPath}`);
                    await copyFolderRecursive(srcRepo, srcPath, destRepo, destPath, isMove, `复制 ${srcPath}`);
                    break;
                case 'backup':
                    const backupPath = await backupFolder(destRepo, destPath);
                    addLogStep('INFO', `已备份到: ${backupPath}`);
                    await copyFolderRecursive(srcRepo, srcPath, destRepo, destPath, isMove, `复制 ${srcPath}`);
                    break;
                case 'incremental':
                    await mergeFolder(srcRepo, srcPath, destRepo, destPath, isMove, 'incremental', `合并 ${srcPath}`);
                    break;
                case 'incremental_backup':
                    await mergeFolder(srcRepo, srcPath, destRepo, destPath, isMove, 'incremental_backup', `合并 ${srcPath}`);
                    break;
            }
        } else {
            await copyFolderRecursive(srcRepo, srcPath, destRepo, destPath, isMove, `复制 ${srcPath}`);
        }
        return;
    }

    const isLarge = !srcData.content || srcData.size > 1024 * 1024;
    if (!isMove) {
        const destExists = await checkDestination(destRepo, destPath);
        if (destExists) {
            if (conflictMode === 'backup' || conflictMode === 'incremental_backup') {
                await backupFile(destRepo, destPath);
            }
        }
    }

    if (isLarge) {
        await copyLargeFile(srcRepo, srcPath, destRepo, destPath, message);
    } else {
        const content = srcData.content;
        const [destOwner, destRepoName] = destRepo.split('/');
        const destSha = await getFileSha(destRepo, destPath);
        const body = {
            message: message || `${isMove ? 'Move' : 'Copy'} ${srcPath} to ${destPath}`,
            content: content,
            branch: window.branch
        };
        if (destSha) body.sha = destSha;
        await apiCall(`https://api.github.com/repos/${destOwner}/${destRepoName}/contents/${destPath}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    if (isMove) {
        await deleteItem(srcRepo, srcPath, 'file', `Delete after move ${srcPath}`);
    }
}

async function downloadMultipleItems() {
    const items = Array.from(window.selectedItems).map(path => ({
        path,
        type: window.contents.find(c => c.path === path)?.type || 'file'
    }));
    if (items.length === 0) return;

    if (items.length === 1 && items[0].type === 'file') {
        const item = window.contents.find(c => c.path === items[0].path);
        window.open(item.download_url, '_blank');
        return;
    }

    startOperation(`打包下载 ${items.length} 个项目`);
    updateProgress(0, '正在收集文件...', '下载进度');
    const zip = new JSZip();

    let totalFiles = 0;
    const processedFiles = [];

    async function addToZip(repoFull, path, zipPath) {
        const [owner, repo] = repoFull.split('/');
        const data = await apiCall(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`);
        if (Array.isArray(data)) {
            for (const item of data) {
                await addToZip(repoFull, item.path, zipPath + '/' + item.name);
            }
        } else {
            const fileContent = await fetch(data.download_url).then(r => r.blob());
            zip.file(zipPath, fileContent);
            processedFiles.push(zipPath);
            updateProgress(Math.round((processedFiles.length / totalFiles) * 100), `已添加 ${processedFiles.length}/${totalFiles} 个文件`, '下载进度');
        }
    }

    async function countFiles(repoFull, path) {
        const [owner, repo] = repoFull.split('/');
        const data = await apiCall(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`);
        if (Array.isArray(data)) {
            let count = 0;
            for (const item of data) {
                count += await countFiles(repoFull, item.path);
            }
            return count;
        } else {
            return 1;
        }
    }

    try {
        for (const item of items) {
            if (item.type === 'dir') {
                totalFiles += await countFiles(window.currentRepo, item.path);
            } else {
                totalFiles++;
            }
        }

        for (const item of items) {
            const baseName = item.path.split('/').pop();
            await addToZip(window.currentRepo, item.path, baseName);
        }

        updateProgress(95, '正在生成ZIP文件...', '下载进度');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `download_${new Date().getTime()}.zip`;
        a.click();
        URL.revokeObjectURL(url);
        updateProgress(100, '下载完成', '下载进度');
        setTimeout(hideProgress, 2000);
        showMessage('下载成功');
        endOperation(true);
    } catch (err) {
        showMessage('打包失败: ' + err.message, true);
        abortOperation(err.message);
    }
}

async function handleExtractConflict(destRepo, destPath, conflictMode) {
    const destExists = await checkDestination(destRepo, destPath);
    if (!destExists) return;

    const [owner, repo] = destRepo.split('/');
    let destType = 'file';
    try {
        const destData = await apiCall(`https://api.github.com/repos/${owner}/${repo}/contents/${destPath}`);
        if (Array.isArray(destData)) {
            destType = 'dir';
        }
    } catch (e) {
        return;
    }

    switch (conflictMode) {
        case 'overwrite':
            if (destType === 'dir') {
                await deleteFolderRecursive(destRepo, destPath);
            } else {
                await deleteItem(destRepo, destPath, 'file', `Delete for overwrite ${destPath}`);
            }
            break;
        case 'backup':
            if (destType === 'dir') {
                await backupFolder(destRepo, destPath);
            } else {
                await backupFile(destRepo, destPath);
            }
            break;
        case 'incremental':
        case 'incremental_backup':
            break;
    }
}