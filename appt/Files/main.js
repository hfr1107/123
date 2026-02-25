// main.js - 初始化及事件绑定

// 初始化 Token 管理
function loadTokens() {
    const saved = localStorage.getItem('github_tokens');
    if (saved) {
        try {
            window.tokens = JSON.parse(saved);
        } catch (e) {
            window.tokens = [];
        }
    } else {
        if (window.currentToken) {
            window.tokens.push({ alias: '默认', token: window.currentToken });
        }
    }
    renderTokenList();
}
loadTokens();

function saveTokens() {
    localStorage.setItem('github_tokens', JSON.stringify(window.tokens));
}

function renderTokenList() {
    const tokenListDiv = document.getElementById('tokenList');
    tokenListDiv.innerHTML = '';
    window.tokens.forEach((t, index) => {
        const div = document.createElement('div');
        div.className = 'token-item';
        div.innerHTML = `
            <input type="text" placeholder="别名" value="${t.alias || ''}" class="token-alias p-2 border rounded text-sm flex-1">
            <input type="password" placeholder="Token" value="${t.token}" class="token-value p-2 border rounded text-sm flex-1">
            <button class="text-red-600 hover:text-red-800 remove-token" data-index="${index}"><i class="fas fa-times"></i></button>
        `;
        tokenListDiv.appendChild(div);
    });
    document.querySelectorAll('.remove-token').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = e.currentTarget.dataset.index;
            window.tokens.splice(index, 1);
            renderTokenList();
        });
    });
}

// Token 管理按钮事件
document.getElementById('addTokenBtn').addEventListener('click', () => {
    window.tokens.push({ alias: '', token: '' });
    renderTokenList();
});

document.getElementById('tokenModalCancelBtn').addEventListener('click', () => {
    document.getElementById('tokenModal').classList.add('hidden');
    document.getElementById('tokenModal').classList.remove('flex');
    loadTokens();
});

document.getElementById('tokenModalSaveBtn').addEventListener('click', () => {
    const aliasInputs = document.querySelectorAll('.token-alias');
    const tokenInputs = document.querySelectorAll('.token-value');
    const newTokens = [];
    for (let i = 0; i < aliasInputs.length; i++) {
        const alias = aliasInputs[i].value.trim();
        const token = tokenInputs[i].value.trim();
        if (token) {
            newTokens.push({ alias: alias || '未命名', token });
        }
    }
    window.tokens = newTokens;
    saveTokens();
    document.getElementById('tokenModal').classList.add('hidden');
    document.getElementById('tokenModal').classList.remove('flex');
    loadAllRepos();
});

document.getElementById('manageTokensBtn').addEventListener('click', () => {
    renderTokenList();
    document.getElementById('tokenModal').classList.remove('hidden');
    document.getElementById('tokenModal').classList.add('flex');
});

// 过滤按钮
document.getElementById('filterAllBtn').addEventListener('click', () => {
    window.repoFilterType = 'all';
    [filterAllBtn, filterPrivateBtn, filterPublicBtn].forEach(btn => btn.classList.remove('active'));
    filterAllBtn.classList.add('active');
    renderRepoList();
});
document.getElementById('filterPrivateBtn').addEventListener('click', () => {
    window.repoFilterType = 'private';
    [filterAllBtn, filterPrivateBtn, filterPublicBtn].forEach(btn => btn.classList.remove('active'));
    filterPrivateBtn.classList.add('active');
    renderRepoList();
});
document.getElementById('filterPublicBtn').addEventListener('click', () => {
    window.repoFilterType = 'public';
    [filterAllBtn, filterPrivateBtn, filterPublicBtn].forEach(btn => btn.classList.remove('active'));
    filterPublicBtn.classList.add('active');
    renderRepoList();
});

// 加载所有仓库
async function loadAllRepos() {
    if (window.tokens.length === 0) {
        window.allRepos = [];
        renderRepoList();
        return;
    }
    startOperation('加载所有账号的仓库');
    updateProgress(10, '正在获取仓库列表...', '加载仓库');
    try {
        const repoPromises = window.tokens.map(async (t) => {
            try {
                const user = await apiCallWithToken('https://api.github.com/user', {}, t.token);
                const repos = await apiCallWithToken('https://api.github.com/user/repos?per_page=100', {}, t.token);
                return repos.map(r => ({ ...r, accountAlias: t.alias }));
            } catch (e) {
                addLogStep('WARN', `账号 ${t.alias} 加载失败: ${e.message}`);
                return [];
            }
        });
        const results = await Promise.all(repoPromises);
        const flatRepos = results.flat();
        const repoMap = new Map();
        flatRepos.forEach(repo => {
            if (!repoMap.has(repo.full_name)) {
                repoMap.set(repo.full_name, repo);
            }
        });
        window.allRepos = Array.from(repoMap.values());
        renderRepoList();
        endOperation(true);
    } catch (e) {
        showMessage('加载仓库失败: ' + e.message, true);
        abortOperation(e.message);
    } finally {
        hideProgress();
    }
}

// 验证按钮
document.getElementById('validateBtn').addEventListener('click', async () => {
    window.currentToken = document.getElementById('token').value.trim();
    window.workflowRepo = document.getElementById('workflowRepo').value.trim();
    window.branch = document.getElementById('branch').value.trim() || 'main';
    if (!window.currentToken) { showMessage('请输入Token', true); return; }
    await loadAllRepos();
});

// 加载目录内容
async function loadContents(forceRefresh = false) {
    if (!window.currentRepo) return;
    const fileListDiv = document.getElementById('fileList');
    fileListDiv.innerHTML = '<div class="text-center py-10"><span class="loader mr-2"></span>加载中...</div>';
    try {
        const [owner, repo] = window.currentRepo.split('/');
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${window.currentPath}`;
        if (forceRefresh) {
            const cacheKey = 'GET:' + url + ':' + window.currentToken;
            window.cache.delete(cacheKey);
        }
        const data = await apiCall(url, { noCache: forceRefresh }, 3, 120000, true);
        if (!Array.isArray(data)) {
            window.contents = [data];
        } else {
            window.contents = data;
        }
        renderFileList();
        renderBreadcrumb();
    } catch (e) {
        fileListDiv.innerHTML = `<div class="text-center py-10 text-red-600">加载失败: ${e.message}</div>`;
    }
}

// 刷新按钮
document.getElementById('refreshBtn').addEventListener('click', () => { if (window.currentRepo) loadContents(true); });

// 上传文件（多选）
document.getElementById('uploadBtn').addEventListener('click', () => {
    if (!window.currentRepo) { alert('请先选择仓库'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        const targetBase = prompt('输入目标路径（相对于当前目录），留空则上传到当前目录', window.currentPath ? window.currentPath : '');
        if (targetBase === null) return;
        startOperation(`上传 ${files.length} 个文件到 ${window.currentRepo}/${targetBase}`);
        let successCount = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const targetPath = targetBase ? `${targetBase}/${file.name}` : file.name;
            updateProgress(0, `正在处理 (${i+1}/${files.length}): ${file.name}`, '上传进度');
            try {
                if (file.size <= 1024 * 1024) {
                    const reader = new FileReader();
                    const base64 = await new Promise((resolve, reject) => {
                        reader.onload = () => resolve(reader.result.split(',')[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                    await createFileViaContents(window.currentRepo, targetPath, base64, `Upload ${file.name}`);
                } else {
                    await createLargeFile(window.currentRepo, targetPath, file, `Upload ${file.name}`);
                }
                successCount++;
            } catch (err) {
                addLogStep('ERROR', `上传失败 ${file.name}: ${err.message}`);
            }
        }
        updateProgress(100, `完成: ${successCount}/${files.length} 个文件`, '上传进度');
        setTimeout(hideProgress, 2000);
        showMessage(`上传完成，成功 ${successCount}/${files.length} 个文件`);
        endOperation(successCount === files.length);
        loadContents(true);
    };
    input.click();
});

// 上传文件夹
document.getElementById('uploadFolderBtn').addEventListener('click', async () => {
    if (!window.currentRepo) { alert('请先选择仓库'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        const basePath = files[0].webkitRelativePath.split('/')[0];
        const targetBase = prompt('输入目标路径（相对于当前目录），留空则上传到当前目录', window.currentPath ? `${window.currentPath}/${basePath}` : basePath);
        if (targetBase === null) return;
        startOperation(`上传文件夹 ${basePath} (${files.length} 个文件) 到 ${window.currentRepo}/${targetBase}`);
        let successCount = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const relativePath = file.webkitRelativePath;
            const pathParts = relativePath.split('/');
            pathParts.shift();
            const targetPath = targetBase ? `${targetBase}/${pathParts.join('/')}` : pathParts.join('/');
            updateProgress(0, `正在处理 (${i+1}/${files.length}): ${file.name}`, '上传进度');
            try {
                if (file.size <= 1024 * 1024) {
                    const reader = new FileReader();
                    const content = await new Promise((resolve, reject) => {
                        reader.onload = () => resolve(reader.result.split(',')[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                    await createFileViaContents(window.currentRepo, targetPath, content, `Upload ${relativePath}`);
                } else {
                    await createLargeFile(window.currentRepo, targetPath, file, `Upload ${relativePath}`);
                }
                successCount++;
            } catch (err) {
                addLogStep('ERROR', `上传 ${relativePath} 失败: ${err.message}`);
            }
        }
        updateProgress(100, `完成: ${successCount}/${files.length} 个文件`, '上传进度');
        setTimeout(hideProgress, 3000);
        showMessage(`文件夹上传完成，成功 ${successCount}/${files.length} 个文件`);
        endOperation(successCount === files.length);
        loadContents(true);
    };
    input.click();
});

// 新建文件
document.getElementById('newFileBtn').addEventListener('click', async () => {
    if (!window.currentRepo) { alert('请先选择仓库'); return; }
    const fileName = prompt('输入文件名（包括路径，相对于当前目录）', '新文件.txt');
    if (!fileName) return;
    const fullPath = window.currentPath ? `${window.currentPath}/${fileName}` : fileName;
    const content = prompt('输入文件内容（文本）', '');
    if (content === null) return;
    const base64 = btoa(unescape(encodeURIComponent(content)));
    startOperation(`新建文件 ${fullPath} 在 ${window.currentRepo}`);
    try {
        await createFileViaContents(window.currentRepo, fullPath, base64, `Create ${fileName}`);
        showMessage('文件创建成功');
        endOperation(true);
        loadContents(true);
    } catch (e) {
        showMessage('创建失败: ' + e.message, true);
        abortOperation(e.message);
    }
});

// 新建文件夹
document.getElementById('newFolderBtn').addEventListener('click', async () => {
    if (!window.currentRepo) { alert('请先选择仓库'); return; }
    const folderName = prompt('输入文件夹名', '新文件夹');
    if (!folderName) return;
    const fullPath = window.currentPath ? `${window.currentPath}/${folderName}/.gitkeep` : `${folderName}/.gitkeep`;
    const base64 = btoa('');
    startOperation(`新建文件夹 ${folderName} 在 ${window.currentRepo}/${window.currentPath}`);
    try {
        await createFileViaContents(window.currentRepo, fullPath, base64, `Create folder ${folderName}`);
        showMessage('文件夹创建成功');
        endOperation(true);
        loadContents(true);
    } catch (e) {
        showMessage('创建失败: ' + e.message, true);
        abortOperation(e.message);
    }
});

// 重命名
document.getElementById('renameBtn').addEventListener('click', async () => {
    if (window.selectedItems.size !== 1) { alert('请只选中一个项目'); return; }
    const path = Array.from(window.selectedItems)[0];
    const item = window.contents.find(c => c.path === path);
    if (!item) return;
    const newName = prompt('输入新名称（仅文件名，不含路径）', item.name);
    if (!newName || newName === item.name) return;
    const dir = path.substring(0, path.lastIndexOf('/') + 1);
    const newPath = dir + newName;
    startOperation(`重命名 ${path} -> ${newPath} 在 ${window.currentRepo}`);
    try {
        await moveCopyItem(window.currentRepo, path, window.currentRepo, newPath, true, `Rename ${path} to ${newPath}`, 'overwrite');
        showMessage('重命名成功');
        endOperation(true);
        clearSelection();
        loadContents(true);
    } catch (e) {
        showMessage('重命名失败: ' + e.message, true);
        abortOperation(e.message);
    }
});

// 移动
document.getElementById('moveBtn').addEventListener('click', () => {
    if (window.selectedItems.size === 0) return;
    openPathModal('移动文件/文件夹', window.currentRepo, Array.from(window.selectedItems), true, clearSelection);
});

// 复制
document.getElementById('copyBtn').addEventListener('click', () => {
    if (window.selectedItems.size === 0) return;
    openPathModal('复制文件/文件夹', window.currentRepo, Array.from(window.selectedItems), false, clearSelection);
});

// 删除
document.getElementById('deleteBtn').addEventListener('click', async () => {
    if (window.selectedItems.size === 0) return;
    if (!confirm(`确定删除选中的 ${window.selectedItems.size} 个项目吗？`)) return;
    startOperation(`删除 ${window.selectedItems.size} 个项目从 ${window.currentRepo}`);
    for (let path of window.selectedItems) {
        const item = window.contents.find(c => c.path === path);
        if (!item) continue;
        try {
            await deleteItem(window.currentRepo, path, item.type, `Delete ${path}`);
            addLogStep('INFO', `已删除 ${path}`);
        } catch (e) {
            showMessage(`删除 ${path} 失败: ${e.message}`, true);
            abortOperation(e.message);
            return;
        }
    }
    showMessage('删除完成');
    endOperation(true);
    clearSelection();
    loadContents(true);
});

// 下载
document.getElementById('downloadBtn').addEventListener('click', downloadMultipleItems);

// 编辑按钮（工具栏）
document.getElementById('editBtn').addEventListener('click', () => {
    if (window.selectedItems.size !== 1) { alert('请只选中一个文件'); return; }
    const path = Array.from(window.selectedItems)[0];
    const item = window.contents.find(c => c.path === path);
    if (!item || item.type === 'dir') { alert('请选择一个文件'); return; }
    if (!isEditableFile(item.name, item.size)) { alert('该文件类型不可编辑或文件过大'); return; }
    openEditor(window.currentRepo, path);
});

// 编辑器保存取消
document.getElementById('editorCancelBtn').addEventListener('click', () => {
    document.getElementById('editorModal').classList.add('hidden');
    document.getElementById('editorModal').classList.remove('flex');
    window.editor = null;
});

document.getElementById('editorSaveBtn').addEventListener('click', async () => {
    if (!window.editor || !window.currentEditRepo || !window.currentEditPath) return;
    const content = window.editor.getValue();
    const base64 = btoa(unescape(encodeURIComponent(content)));
    const [owner, repo] = window.currentEditRepo.split('/');
    try {
        startOperation(`保存文件 ${window.currentEditPath}`);
        updateProgress(30, '正在保存...', '保存文件');
        const body = {
            message: `Edit ${window.currentEditPath}`,
            content: base64,
            sha: window.currentEditSha,
            branch: window.branch
        };
        await apiCall(`https://api.github.com/repos/${owner}/${repo}/contents/${window.currentEditPath}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        updateProgress(100, '保存成功');
        setTimeout(hideProgress, 1000);
        showMessage('文件保存成功');
        endOperation(true);
        document.getElementById('editorModal').classList.add('hidden');
        document.getElementById('editorModal').classList.remove('flex');
        window.editor = null;
        loadContents(true);
    } catch (err) {
        showMessage('保存失败: ' + err.message, true);
        abortOperation(err.message);
    }
});

// 模态框按钮事件
document.getElementById('modalBrowseBtn').addEventListener('click', () => {
    const targetRepo = document.getElementById('modalTargetRepo').value;
    if (!targetRepo) return;
    browseTree(targetRepo, '');
});

document.getElementById('modalNewFolderBtn').addEventListener('click', async () => {
    const targetRepo = document.getElementById('modalTargetRepo').value;
    let basePath = document.getElementById('modalTargetPath').value.trim();
    const folderName = prompt('请输入新文件夹名称');
    if (!folderName) return;
    const newFolderPath = basePath ? `${basePath}/${folderName}` : folderName;
    try {
        await createFileViaContents(targetRepo, `${newFolderPath}/.gitkeep`, btoa(''), `Create folder ${newFolderPath}`);
        showMessage('文件夹创建成功');
        if (window.browsingRepo === targetRepo) {
            browseTree(targetRepo, basePath);
        }
    } catch (err) {
        showMessage('创建文件夹失败: ' + err.message, true);
    }
});

document.getElementById('modalConfirmBtn').addEventListener('click', async () => {
    const destRepo = document.getElementById('modalTargetRepo').value;
    let destPathBase = document.getElementById('modalTargetPath').value.trim();
    destPathBase = normalizePath(destPathBase);
    if (!destRepo) {
        alert('请选择目标仓库');
        return;
    }

    if (window.modalIsExtract) {
        const sourcePath = window.modalSourcePaths[0];
        const sourceFolder = sourcePath.substring(0, sourcePath.lastIndexOf('/') + 1) || '';
        const pattern = document.getElementById('modalSplitPattern').value.trim();

        let extractConflictMode = 'incremental';
        for (const radio of document.querySelectorAll('input[name="extractConflictMode"]')) {
            if (radio.checked) {
                extractConflictMode = radio.value;
                break;
            }
        }

        const destFullPath = destPathBase ? destPathBase : '';
        await handleExtractConflict(destRepo, destFullPath, extractConflictMode);

        const wfRepo = document.getElementById('workflowRepo').value.trim();
        const wfBranch = document.getElementById('branch').value.trim() || 'main';
        if (!wfRepo) {
            alert('请在工作流仓库输入框中填写正确的仓库');
            return;
        }
        const [wfOwner, wfRepoName] = wfRepo.split('/');
        const url = `https://api.github.com/repos/${wfOwner}/${wfRepoName}/actions/workflows/分卷压缩包合并解压.yml/dispatches`;
        const inputs = {
            source_repo: window.modalSourceRepo,
            source_folder: sourceFolder,
            target_repo: destRepo,
            target_folder: destPathBase,
            first_part_pattern: pattern
        };
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Authorization': `token ${window.currentToken}`, 'Accept': 'application/vnd.github.v3+json' },
                body: JSON.stringify({ ref: wfBranch, inputs })
            });
            if (res.status === 204) {
                showMessage('✅ 解压工作流已触发！');
            } else {
                const err = await res.text();
                showMessage('❌ 触发失败: ' + err, true);
            }
        } catch (err) {
            showMessage('网络错误', true);
        }

        document.getElementById('pathModal').classList.add('hidden');
        document.getElementById('pathModal').classList.remove('flex');
        if (window.modalCallback) window.modalCallback();
        return;
    }

    const isMove = window.modalIsMove;
    const sourcePaths = window.modalSourcePaths;

    let anyExists = false;
    for (let srcPath of sourcePaths) {
        const fileName = srcPath.split('/').pop();
        const destPath = destPathBase ? `${destPathBase}/${fileName}` : fileName;
        if (await checkDestination(destRepo, destPath)) {
            anyExists = true;
            break;
        }
    }

    const modalConflictFields = document.getElementById('modalConflictFields');
    if (anyExists && modalConflictFields.classList.contains('hidden')) {
        modalConflictFields.classList.remove('hidden');
        return;
    }

    let conflictMode = 'incremental';
    for (const radio of document.querySelectorAll('input[name="conflictMode"]')) {
        if (radio.checked) {
            conflictMode = radio.value;
            break;
        }
    }

    document.getElementById('pathModal').classList.add('hidden');
    document.getElementById('pathModal').classList.remove('flex');

    startOperation(`${isMove ? '移动' : '复制'} ${sourcePaths.length} 个项目 从 ${window.modalSourceRepo} 到 ${destRepo}/${destPathBase} (模式: ${conflictMode})`);
    for (let srcPath of sourcePaths) {
        const fileName = srcPath.split('/').pop();
        const destPath = destPathBase ? `${destPathBase}/${fileName}` : fileName;
        try {
            await moveCopyItem(window.modalSourceRepo, srcPath, destRepo, destPath, isMove, `${isMove ? 'Move' : 'Copy'} ${srcPath} to ${destPath}`, conflictMode);
            addLogStep('INFO', `成功 ${isMove ? '移动' : '复制'} ${srcPath} -> ${destPath}`);
        } catch (err) {
            showMessage(`操作 ${srcPath} 失败: ${err.message}`, true);
            abortOperation(err.message);
            break;
        }
    }
    showMessage('操作完成');
    endOperation(true);
    loadContents(true);
    if (window.modalCallback) window.modalCallback();
});

document.getElementById('modalCancelBtn').addEventListener('click', () => {
    document.getElementById('pathModal').classList.add('hidden');
    document.getElementById('pathModal').classList.remove('flex');
});

document.getElementById('pathModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('pathModal')) {
        document.getElementById('pathModal').classList.add('hidden');
        document.getElementById('pathModal').classList.remove('flex');
    }
});

// 日志面板
document.getElementById('viewLogBtn').addEventListener('click', () => {
    document.getElementById('logPanel').classList.toggle('hidden');
    renderLogs();
});

document.getElementById('closeLogBtn').addEventListener('click', () => {
    document.getElementById('logPanel').classList.add('hidden');
});

document.getElementById('clearLogBtn').addEventListener('click', () => {
    window.operationLogs = [];
    renderLogs();
});

document.getElementById('copyLogBtn').addEventListener('click', () => {
    const text = window.operationLogs.map(op => {
        return `## ${op.title}\n` + op.steps.map(s => `[${s.timestamp}] ${s.type} ${s.message} ${s.details}`).join('\n');
    }).join('\n\n');
    navigator.clipboard.writeText(text).then(() => alert('日志已复制到剪贴板'));
});

// 仓库刷新和创建
document.getElementById('refreshReposBtn').addEventListener('click', loadAllRepos);
document.getElementById('createRepoBtn').addEventListener('click', async () => {
    if (!await ensureValidToken()) return;
    const name = prompt('请输入新仓库名称（只能包含字母、数字、下划线、连字符）');
    if (!name) return;
    const description = prompt('请输入仓库描述（可选）', '');
    const isPrivate = confirm('是否设为私有仓库？点击确定=私有，取消=公开');
    startOperation(`创建仓库 ${name}`);
    try {
        await apiCall('https://api.github.com/user/repos', {
            method: 'POST',
            body: JSON.stringify({
                name: name,
                description: description,
                private: isPrivate,
                auto_init: true
            })
        });
        showMessage('仓库创建成功');
        await loadAllRepos();
        endOperation(true);
    } catch (e) {
        showMessage('创建失败: ' + e.message, true);
        abortOperation(e.message);
    }
});

// 自动验证
setTimeout(() => document.getElementById('validateBtn').click(), 500);