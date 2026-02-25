// github-api.js - GitHub API 底层操作

// ---------- API 调用（增强：支持多 token 重试）----------
async function apiCall(url, options = {}, retries = 3, timeout = 120000, silent404 = false) {
    if (!window.currentToken) {
        const err = 'Token 不存在，请重新验证';
        abortOperation(err);
        throw new Error(err);
    }
    const headers = {
        'Authorization': `token ${window.currentToken}`,
        'Accept': 'application/vnd.github.v3+json',
        ...options.headers
    };
    const method = options.method || 'GET';
    const cacheKey = method + ':' + url + ':' + window.currentToken;

    if (method === 'GET' && window.cache.has(cacheKey) && !options.noCache) {
        return window.cache.get(cacheKey);
    }

    const isListDir = url.includes('/contents/') && method === 'GET';
    if (window.currentOperation && !isListDir) {
        addLogStep('API', `${method} ${url}`, options.body ? `body: ${options.body.substring(0,200)}...` : '');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const fetchOptions = { ...options, headers, signal: controller.signal };

    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);
            if (!res.ok) {
                let errText = await res.text();
                const error = new Error(`GitHub API ${res.status}: ${errText}`);
                error.status = res.status;
                if (res.status === 401) {
                    // Token 失效，尝试用默认 token 重试
                    if (window.currentToken !== window.DEFAULT_TOKEN && window.DEFAULT_TOKEN) {
                        addLogStep('WARN', 'Token 失效，尝试使用默认 token 重试...');
                        const oldToken = window.currentToken;
                        window.currentToken = window.DEFAULT_TOKEN;
                        document.getElementById('token').value = window.DEFAULT_TOKEN;
                        try {
                            const retryRes = await fetch(url, { ...fetchOptions, headers: { ...headers, 'Authorization': `token ${window.DEFAULT_TOKEN}` } });
                            if (retryRes.ok) {
                                const data = await retryRes.json();
                                if (method === 'GET') window.cache.set(cacheKey, data);
                                if (window.currentOperation && !isListDir) addLogStep('API', `${method} ${url} success (using default token)`);
                                return data;
                            } else {
                                window.currentToken = oldToken;
                                document.getElementById('token').value = oldToken;
                                throw error;
                            }
                        } catch (retryErr) {
                            window.currentToken = oldToken;
                            document.getElementById('token').value = oldToken;
                            throw error;
                        }
                    } else {
                        // 没有默认 token 或已经是默认，弹窗让用户输入
                        return await new Promise((resolve, reject) => {
                            const tokenExpiredModal = document.getElementById('tokenExpiredModal');
                            const newTokenInput = document.getElementById('newTokenInput');
                            const tokenExpiredCancelBtn = document.getElementById('tokenExpiredCancelBtn');
                            const tokenExpiredConfirmBtn = document.getElementById('tokenExpiredConfirmBtn');
                            tokenExpiredModal.classList.remove('hidden');
                            tokenExpiredModal.classList.add('flex');
                            const onConfirm = async () => {
                                const newToken = newTokenInput.value.trim();
                                if (newToken) {
                                    tokenExpiredModal.classList.add('hidden');
                                    tokenExpiredModal.classList.remove('flex');
                                    newTokenInput.value = '';
                                    window.currentToken = newToken;
                                    document.getElementById('token').value = newToken;
                                    try {
                                        const retryRes = await fetch(url, { ...fetchOptions, headers: { ...headers, 'Authorization': `token ${newToken}` } });
                                        if (retryRes.ok) {
                                            const data = await retryRes.json();
                                            if (method === 'GET') window.cache.set(cacheKey, data);
                                            if (window.currentOperation && !isListDir) addLogStep('API', `${method} ${url} success (new token)`);
                                            resolve(data);
                                        } else {
                                            reject(new Error('新 token 无效'));
                                        }
                                    } catch (err) {
                                        reject(err);
                                    }
                                }
                                tokenExpiredCancelBtn.removeEventListener('click', onCancel);
                                tokenExpiredConfirmBtn.removeEventListener('click', onConfirm);
                            };
                            const onCancel = () => {
                                tokenExpiredModal.classList.add('hidden');
                                tokenExpiredModal.classList.remove('flex');
                                newTokenInput.value = '';
                                reject(new Error('用户取消了操作'));
                                tokenExpiredCancelBtn.removeEventListener('click', onCancel);
                                tokenExpiredConfirmBtn.removeEventListener('click', onConfirm);
                            };
                            tokenExpiredConfirmBtn.addEventListener('click', onConfirm);
                            tokenExpiredCancelBtn.addEventListener('click', onCancel);
                        });
                    }
                }
                if (res.status === 404 && silent404) {
                    throw error;
                }
                if (res.status >= 500 && i < retries) {
                    if (window.currentOperation) addLogStep('WARN', `请求失败 (${res.status})，正在重试 (${i+1}/${retries})...`);
                    await new Promise(r => setTimeout(r, 2000 * (i+1)));
                    continue;
                }
                abortOperation(error.message);
                throw error;
            }
            if (res.status === 204) return null;
            const data = await res.json();
            if (method === 'GET') window.cache.set(cacheKey, data);
            if (window.currentOperation && !isListDir) {
                addLogStep('API', `${method} ${url} success`);
            }
            return data;
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                err.message = '请求超时 (超过' + (timeout/1000) + '秒)';
            }
            if (i < retries && err.status >= 500) {
                if (window.currentOperation) addLogStep('WARN', `网络错误，正在重试 (${i+1}/${retries}): ${err.message}`);
                await new Promise(r => setTimeout(r, 2000 * (i+1)));
                continue;
            }
            if (!silent404 || err.status !== 404) {
                abortOperation(err.message);
            }
            throw err;
        }
    }
}

async function apiCallWithToken(url, options, token) {
    const headers = {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        ...options.headers
    };
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`GitHub API ${res.status}: ${errText}`);
    }
    return res.json();
}

async function getFileSha(repoFull, path) {
    const [owner, repo] = repoFull.split('/');
    try {
        const data = await apiCall(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {}, 3, 120000, true);
        return data.sha;
    } catch (e) {
        return null;
    }
}

async function createFileViaContents(repoFull, path, contentBase64, message) {
    const [owner, repo] = repoFull.split('/');
    path = normalizePath(path);
    const sha = await getFileSha(repoFull, path);
    const body = {
        message: message || `Create/update ${path}`,
        content: contentBase64,
        branch: window.branch
    };
    if (sha) body.sha = sha;
    return apiCall(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify(body)
    });
}

async function readFileAsBase64(fileBlob, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const result = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = (err) => reject(new Error('FileReader 失败: ' + err));
                reader.readAsDataURL(fileBlob);
            });
            const base64 = result.split(',')[1];
            if (!base64) throw new Error('Base64 编码为空');
            return base64;
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

async function copyLargeFile(srcRepo, srcPath, destRepo, destPath, message) {
    const [srcOwner, srcRepoName] = srcRepo.split('/');
    const srcData = await apiCall(`https://api.github.com/repos/${srcOwner}/${srcRepoName}/contents/${srcPath}`);
    if (!srcData.download_url) {
        throw new Error('无法获取文件下载链接');
    }
    let response;
    for (let i = 0; i < 3; i++) {
        try {
            response = await fetch(srcData.download_url);
            if (response.ok) break;
        } catch (e) {
            if (i === 2) throw e;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    if (!response || !response.ok) throw new Error('下载文件失败');
    const blob = await response.blob();
    return createLargeFile(destRepo, destPath, blob, message);
}

async function createLargeFile(repoFull, path, fileBlob, message) {
    const [owner, repo] = repoFull.split('/');
    path = normalizePath(path);
    updateProgress(0, `正在处理: ${path}`, '上传进度');
    updateProgress(10, '读取文件...');

    if (!fileBlob || fileBlob.size === 0) {
        throw new Error('文件内容为空');
    }

    const fullBase64 = await readFileAsBase64(fileBlob);

    updateProgress(40, '创建 Git Blob...');
    const blobData = await apiCall(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content: fullBase64, encoding: 'base64' })
    }, 3, 300000);
    const blobSha = blobData.sha;

    updateProgress(60, '获取最新提交...');
    const refData = await apiCall(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${window.branch}`);
    const latestCommitSha = refData.object.sha;
    const commitData = await apiCall(`https://api.github.com/repos/${owner}/${repo}/git/commits/${latestCommitSha}`);
    const baseTreeSha = commitData.tree.sha;

    updateProgress(70, '创建目录树...');
    const treeData = await apiCall(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({
            base_tree: baseTreeSha,
            tree: [{
                path: path,
                mode: '100644',
                type: 'blob',
                sha: blobSha
            }]
        })
    });
    const newTreeSha = treeData.sha;

    updateProgress(80, '创建提交...');
    const newCommit = await apiCall(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({
            message: message || `Upload ${path}`,
            tree: newTreeSha,
            parents: [latestCommitSha]
        })
    });
    const newCommitSha = newCommit.sha;

    updateProgress(90, '更新分支引用...');
    await apiCall(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${window.branch}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: newCommitSha, force: true })
    });

    updateProgress(100, `完成: ${path}`);
    setTimeout(hideProgress, 1000);
    return newCommit;
}

async function deleteFolderRecursive(repoFull, path) {
    const [owner, repo] = repoFull.split('/');
    const items = await apiCall(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`);
    for (const item of items) {
        if (item.type === 'dir') {
            await deleteFolderRecursive(repoFull, item.path);
        } else {
            await deleteItem(repoFull, item.path, 'file', `Delete ${item.path}`);
        }
    }
}

async function deleteItem(repoFull, path, type, message) {
    path = normalizePath(path);
    if (type === 'dir') {
        await deleteFolderRecursive(repoFull, path);
        return null;
    } else {
        const sha = await getFileSha(repoFull, path);
        if (!sha) throw new Error('文件不存在');
        const [owner, repo] = repoFull.split('/');
        return apiCall(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
            method: 'DELETE',
            body: JSON.stringify({
                message: message || `Delete ${path}`,
                sha: sha,
                branch: window.branch
            })
        });
    }
}

async function checkDestination(repoFull, path) {
    try {
        const [owner, repo] = repoFull.split('/');
        await apiCall(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {}, 1, 120000, true);
        return true;
    } catch (e) {
        return false;
    }
}