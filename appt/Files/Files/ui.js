// ui.js - 用户界面渲染和交互

// 渲染日志面板
function renderLogs() {
    const logContent = document.getElementById('logContent');
    logContent.innerHTML = window.operationLogs.length ? window.operationLogs.map(op => `
        <details class="log-entry" ${op.id === window.currentOperation?.id ? 'open' : ''}>
            <summary><span class="font-medium">${op.title}</span> <span class="text-xs text-gray-500 ml-2">${op.steps.length}步</span></summary>
            <div class="log-details">
                ${op.steps.map(s => `<div><span class="text-gray-500">[${s.timestamp}]</span> <span class="${s.type === 'ERROR' ? 'text-red-600' : s.type === 'API' ? 'text-purple-600' : 'text-green-600'}">${s.type}</span> ${s.message} ${s.details ? '<br><span class="text-xs text-gray-400">'+s.details+'</span>' : ''}</div>`).join('')}
            </div>
        </details>
    `).join('') : '<div class="text-gray-400">暂无日志</div>';
}

// 右键菜单
function showContextMenu(e, path, type, isEditable) {
    e.preventDefault();
    window.contextMenuTarget = { path, type, isEditable };
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.style.display = 'block';
    contextMenu.style.left = e.pageX + 'px';
    contextMenu.style.top = e.pageY + 'px';
}

// 更新工具栏状态
function updateToolbar() {
    const count = window.selectedItems.size;
    const disabled = count === 0;
    const actionDropdownBtn = document.getElementById('actionDropdownBtn');
    const renameBtn = document.getElementById('renameBtn');
    const moveBtn = document.getElementById('moveBtn');
    const copyBtn = document.getElementById('copyBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const selectionInfo = document.getElementById('selectionInfo');
    actionDropdownBtn.disabled = disabled;
    renameBtn.disabled = count !== 1;
    moveBtn.disabled = disabled;
    copyBtn.disabled = disabled;
    deleteBtn.disabled = disabled;
    downloadBtn.disabled = false;
    selectionInfo.innerText = count === 0 ? '未选中任何项' : `已选中 ${count} 项`;
}

function clearSelection() {
    window.selectedItems.clear();
    document.querySelectorAll('.file-row').forEach(row => {
        row.classList.remove('selected');
        const cb = row.querySelector('.file-checkbox');
        if (cb) cb.checked = false;
    });
    updateToolbar();
}

// 渲染仓库列表
function renderRepoList() {
    const repoListDiv = document.getElementById('repoList');
    if (!window.allRepos.length) {
        repoListDiv.innerHTML = '<div class="text-gray-500 text-center py-4">暂无仓库</div>';
        return;
    }
    const filterText = document.getElementById('repoFilter').value.toLowerCase();
    const filtered = window.allRepos.filter(repo => {
        const nameMatch = repo.full_name.toLowerCase().includes(filterText);
        if (window.repoFilterType === 'all') return nameMatch;
        if (window.repoFilterType === 'private') return nameMatch && repo.private;
        if (window.repoFilterType === 'public') return nameMatch && !repo.private;
    });
    let html = '';
    filtered.forEach(repo => {
        const active = window.currentRepo === repo.full_name ? 'bg-blue-100' : '';
        html += `<div class="p-2 rounded cursor-pointer hover:bg-gray-100 ${active}" data-repo="${repo.full_name}">
            <i class="fas fa-${repo.private ? 'lock' : 'lock-open'} text-xs mr-1 ${repo.private ? 'text-yellow-600' : 'text-gray-500'}"></i>
            <span class="font-medium">${repo.name}</span>
            <span class="text-xs text-gray-500 ml-1">${repo.owner.login}</span>
            ${repo.accountAlias ? `<span class="text-xs bg-gray-200 px-1 rounded ml-1">${repo.accountAlias}</span>` : ''}
        </div>`;
    });
    repoListDiv.innerHTML = html;
    repoListDiv.querySelectorAll('[data-repo]').forEach(el => {
        el.addEventListener('click', () => {
            window.currentRepo = el.dataset.repo;
            window.currentPath = '';
            loadContents(true);
            repoListDiv.querySelectorAll('[data-repo]').forEach(e => e.classList.remove('bg-blue-100'));
            el.classList.add('bg-blue-100');
        });
    });
}

// 渲染文件列表
function renderFileList() {
    const fileListDiv = document.getElementById('fileList');
    const fileFilter = document.getElementById('fileFilter');
    if (!window.contents) return;
    const filter = fileFilter.value.toLowerCase();
    const filtered = window.contents.filter(item => item.name.toLowerCase().includes(filter));
    let html = `<table class="w-full text-sm"><thead><tr class="bg-gray-100 border-b"><th class="p-2 text-left w-8"><input type="checkbox" id="selectAll"></th><th class="p-2 text-left">名称</th><th class="p-2 text-left">类型</th><th class="p-2 text-left">大小</th><th class="p-2 text-left time-cell">最后更新</th><th class="p-2 text-left">操作</th></tr></thead><tbody>`;
    filtered.forEach(item => {
        const isDir = item.type === 'dir';
        const name = item.name;
        const path = item.path;
        const size = item.size ? (item.size < 1024 ? item.size + ' B' : (item.size/1024).toFixed(1) + ' KB') : '-';
        const date = formatRelativeTime(item.last_modified || item.updated_at);
        const editable = !isDir && isEditableFile(name, item.size);
        html += `<tr class="file-row border-b hover:bg-gray-50 ${window.selectedItems.has(path) ? 'selected' : ''}" data-path="${path}" data-type="${item.type}" data-editable="${editable}" ondblclick="if(this.dataset.editable === 'true') window.openEditor('${window.currentRepo}', '${path}')" oncontextmenu="window.showContextMenu(event, '${path}', '${item.type}', ${editable})">`;
        html += `<td class="p-2"><input type="checkbox" class="file-checkbox" data-path="${path}" ${window.selectedItems.has(path) ? 'checked' : ''}></td>`;
        html += `<td class="p-2"><i class="fas fa-${isDir ? 'folder' : 'file'} mr-2 ${isDir ? 'text-yellow-500' : 'text-gray-500'}"></i>`;
        if (isDir) {
            html += `<a href="#" class="folder-link text-blue-600 hover:underline">${name}</a>`;
        } else {
            html += `<span>${name}</span>`;
        }
        html += `</td>`;
        html += `<td class="p-2">${isDir ? '文件夹' : '文件'}</td>`;
        html += `<td class="p-2">${size}</td>`;
        html += `<td class="p-2 time-cell">${date}</td>`;
        html += `<td class="p-2">`;
        if (!isDir) {
            if (editable) {
                html += `<button class="edit-btn text-blue-600 hover:text-blue-800 text-xs mr-1" data-path="${path}" data-name="${name}"><i class="fas fa-edit mr-1"></i>编辑</button>`;
            }
            if (isArchiveFile(name) || isMultiPartArchive(name)) {
                html += `<button class="extract-btn text-blue-600 hover:text-blue-800 text-xs" data-path="${path}" data-name="${name}"><i class="fas fa-file-archive mr-1"></i>解压</button>`;
            }
        }
        html += `</td>`;
        html += `</tr>`;
    });
    html += '</tbody></table>';
    fileListDiv.innerHTML = html;

    window.showContextMenu = showContextMenu;
    window.openEditor = openEditor;

    // 编辑按钮
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const path = btn.dataset.path;
            openEditor(window.currentRepo, path);
        });
    });

    // 复选框点击
    document.querySelectorAll('.file-checkbox').forEach(cb => {
        cb.addEventListener('click', (e) => {
            e.stopPropagation();
            const path = cb.dataset.path;
            if (cb.checked) {
                window.selectedItems.add(path);
            } else {
                window.selectedItems.delete(path);
            }
            updateRowSelection();
            updateToolbar();
        });
    });

    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            const checked = e.target.checked;
            if (checked) {
                filtered.forEach(item => window.selectedItems.add(item.path));
            } else {
                window.selectedItems.clear();
            }
            updateRowSelection();
            updateToolbar();
        });
    }

    document.querySelectorAll('.file-row').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.classList.contains('file-checkbox') || e.target.classList.contains('folder-link') || e.target.closest('.edit-btn') || e.target.closest('.extract-btn')) return;
            const cb = row.querySelector('.file-checkbox');
            if (cb) {
                cb.checked = !cb.checked;
                const path = cb.dataset.path;
                if (cb.checked) {
                    window.selectedItems.add(path);
                } else {
                    window.selectedItems.delete(path);
                }
                updateRowSelection();
                updateToolbar();
            }
        });
    });

    fileListDiv.querySelectorAll('.folder-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const path = link.closest('tr').dataset.path;
            window.currentPath = path;
            loadContents(true);
            clearSelection();
        });
    });

    fileListDiv.querySelectorAll('.extract-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const path = btn.dataset.path;
            const name = btn.dataset.name;
            openExtractModal(window.currentRepo, path, name);
        });
    });

    function updateRowSelection() {
        document.querySelectorAll('.file-row').forEach(row => {
            const cb = row.querySelector('.file-checkbox');
            const path = cb?.dataset.path;
            if (path && window.selectedItems.has(path)) {
                row.classList.add('selected');
            } else {
                row.classList.remove('selected');
            }
        });
        if (selectAll) {
            const total = document.querySelectorAll('.file-checkbox').length;
            const checked = window.selectedItems.size;
            selectAll.checked = total === checked && total > 0;
            selectAll.indeterminate = checked > 0 && checked < total;
        }
    }
}

// 渲染面包屑
function renderBreadcrumb() {
    const breadcrumbDiv = document.getElementById('breadcrumb');
    if (!window.currentRepo) return;
    const parts = window.currentPath.split('/').filter(p => p);
    let html = `<a href="#" data-path="" class="text-blue-600 hover:underline">${window.currentRepo}</a>`;
    let accum = '';
    parts.forEach((part, idx) => {
        accum += (accum ? '/' : '') + part;
        html += ` <span class="text-gray-400">/</span> <a href="#" data-path="${accum}" class="text-blue-600 hover:underline">${part}</a>`;
    });
    breadcrumbDiv.innerHTML = html;
    breadcrumbDiv.querySelectorAll('a[data-path]').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            window.currentPath = a.dataset.path;
            loadContents(true);
            clearSelection();
        });
    });
}

// 编辑器
async function openEditor(repo, path) {
    if (!repo || !path) return;
    const [owner, repoName] = repo.split('/');
    try {
        const data = await apiCall(`https://api.github.com/repos/${owner}/${repoName}/contents/${path}`);
        if (!data.content) {
            showMessage('无法读取文件内容', true);
            return;
        }
        const content = atob(data.content.replace(/\n/g, ''));
        window.currentEditPath = path;
        window.currentEditRepo = repo;
        window.currentEditSha = data.sha;
        const editorTitle = document.getElementById('editorTitle');
        const editorContainer = document.getElementById('editorContainer');
        editorTitle.textContent = `编辑: ${path}`;
        editorContainer.innerHTML = '';
        window.editor = CodeMirror(editorContainer, {
            value: content,
            lineNumbers: true,
            mode: guessMode(path),
            theme: 'monokai',
            lineWrapping: true
        });
        const editorModal = document.getElementById('editorModal');
        editorModal.classList.remove('hidden');
        editorModal.classList.add('flex');
    } catch (err) {
        showMessage('加载文件失败: ' + err.message, true);
    }
}

// 模态框函数
async function openPathModal(title, sourceRepo, sourcePaths, isMove, callback) {
    const modalTitle = document.getElementById('modalTitle');
    const currentPathInfo = document.getElementById('currentPathInfo');
    const modalTargetRepo = document.getElementById('modalTargetRepo');
    const modalTargetPath = document.getElementById('modalTargetPath');
    const modalTree = document.getElementById('modalTree');
    const treeContent = document.getElementById('treeContent');
    const extractFields = document.getElementById('extractFields');
    const modalConflictFields = document.getElementById('modalConflictFields');
    const pathModal = document.getElementById('pathModal');
    modalTitle.innerText = title;
    window.modalSourceRepo = sourceRepo;
    window.modalSourcePaths = sourcePaths;
    window.modalIsMove = isMove;
    window.modalIsExtract = false;
    extractFields.classList.add('hidden');
    modalConflictFields.classList.add('hidden');
    window.modalCallback = callback;

    currentPathInfo.innerHTML = `当前仓库: <strong>${sourceRepo}</strong><br>当前路径: <strong>/${window.currentPath}</strong>`;

    modalTargetRepo.innerHTML = '';
    window.allRepos.forEach(r => {
        const option = document.createElement('option');
        option.value = r.full_name;
        option.textContent = r.full_name;
        if (r.full_name === sourceRepo) option.selected = true;
        modalTargetRepo.appendChild(option);
    });

    modalTargetPath.value = '';
    modalTree.classList.add('hidden');
    treeContent.innerHTML = '';
    pathModal.classList.remove('hidden');
    pathModal.classList.add('flex');
}

function openExtractModal(sourceRepo, filePath, fileName) {
    const modalTitle = document.getElementById('modalTitle');
    const currentPathInfo = document.getElementById('currentPathInfo');
    const modalTargetRepo = document.getElementById('modalTargetRepo');
    const modalTargetPath = document.getElementById('modalTargetPath');
    const modalTree = document.getElementById('modalTree');
    const treeContent = document.getElementById('treeContent');
    const extractFields = document.getElementById('extractFields');
    const modalConflictFields = document.getElementById('modalConflictFields');
    const modalSplitPattern = document.getElementById('modalSplitPattern');
    const pathModal = document.getElementById('pathModal');
    modalTitle.innerText = '解压压缩包';
    window.modalSourceRepo = sourceRepo;
    window.modalSourcePaths = [filePath];
    window.modalIsExtract = true;
    extractFields.classList.remove('hidden');
    modalConflictFields.classList.add('hidden');
    currentPathInfo.innerHTML = `当前仓库: <strong>${sourceRepo}</strong><br>当前路径: <strong>/${window.currentPath}</strong>`;

    let pattern = fileName;
    if (isMultiPartArchive(fileName)) {
        if (fileName.includes('.part1.rar')) pattern = '*.part1.rar';
        else if (fileName.includes('.zip.001')) pattern = '*.zip.001';
        else if (fileName.includes('.7z.001')) pattern = '*.7z.001';
    }
    modalSplitPattern.value = pattern;

    document.querySelectorAll('input[name="extractConflictMode"]').forEach(r => {
        if (r.value === 'incremental') r.checked = true;
    });

    modalTargetRepo.innerHTML = '';
    window.allRepos.forEach(r => {
        const option = document.createElement('option');
        option.value = r.full_name;
        option.textContent = r.full_name;
        if (r.full_name === sourceRepo) option.selected = true;
        modalTargetRepo.appendChild(option);
    });
    const dir = filePath.substring(0, filePath.lastIndexOf('/') + 1);
    modalTargetPath.value = dir;
    modalTree.classList.add('hidden');
    treeContent.innerHTML = '';
    pathModal.classList.remove('hidden');
    pathModal.classList.add('flex');
}

async function browseTree(repoFull, path) {
    window.browsingRepo = repoFull;
    window.browsingPath = path;
    const [owner, repo] = repoFull.split('/');
    const modalTargetPath = document.getElementById('modalTargetPath');
    const modalTree = document.getElementById('modalTree');
    const treeContent = document.getElementById('treeContent');
    try {
        const data = await apiCall(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {}, 3, 120000, true);
        if (!Array.isArray(data)) return;
        const dirs = data.filter(item => item.type === 'dir');
        let html = '';
        if (path) {
            const parent = path.split('/').slice(0, -1).join('/');
            html += `<div class="tree-item text-blue-600" data-path="${parent}"><i class="fas fa-level-up-alt mr-1"></i> ..</div>`;
        }
        dirs.forEach(dir => {
            html += `<div class="tree-item pl-4" data-path="${dir.path}"><i class="fas fa-folder text-yellow-500 mr-1"></i> ${dir.name}</div>`;
        });
        treeContent.innerHTML = html;
        modalTree.classList.remove('hidden');
        treeContent.querySelectorAll('.tree-item').forEach(el => {
            el.addEventListener('click', (e) => {
                const newPath = el.dataset.path;
                browseTree(repoFull, newPath);
                modalTargetPath.value = newPath;
            });
        });
    } catch (err) {
        showMessage('加载目录失败: ' + err.message, true);
    }
}