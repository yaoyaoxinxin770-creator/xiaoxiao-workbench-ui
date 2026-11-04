import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

function settingsFile() {
    const dir = process.env.WORKBENCH_AGENT_SETTINGS_DIR || process.env.WORKBENCH_PROFILE_DIR || (process.env.WORKBENCH_HOME_DIR ? path.join(process.env.WORKBENCH_HOME_DIR, '工作台数据') : '');
    if (!path.isAbsolute(dir)) throw Error('Agent本机配置目录未就绪');
    return path.join(dir, 'agent-api-protected.json');
}

export function protect(text: string, decrypt = false): Promise<string> {
    return new Promise((resolve, reject) => {
        if (process.platform !== 'win32') { reject(Error('本机密钥保护仅支持Windows')); return; }
        const script = 'Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($s); $r=[Security.Cryptography.ProtectedData]::' + (decrypt ? 'Unprotect' : 'Protect') + '($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($r))';
        const child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        let output = '', settled = false;
        const finish = (error?: Error, value?: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) reject(error); else resolve(value!);
        };
        const timer = setTimeout(() => { finish(Error('Windows密钥保护超时，请重试')); child.kill(); }, 15000);
        child.stdout.on('data', chunk => output += chunk);
        child.stderr.resume();
        child.stdin.on('error', () => finish(Error('Windows密钥保护不可用')));
        child.on('error', () => finish(Error('Windows密钥保护不可用')));
        child.on('close', code => code ? finish(Error('Windows密钥保护失败')) : finish(undefined, decrypt ? Buffer.from(output.trim(), 'base64').toString('utf8') : output.trim()));
        child.stdin.end(decrypt ? text : Buffer.from(text).toString('base64'));
    });
}

export async function loadAgentSettings(secret = false) {
    try {
        const raw = JSON.parse(await fs.readFile(settingsFile(), 'utf8'));
        const api = raw.customApi;
        return { ...raw, customApi: api ? { ...api, apiKey: secret && api.protectedKey ? await protect(api.protectedKey, true) : '', protectedKey: undefined, hasKey: Boolean(api.protectedKey) } : undefined };
    } catch (error: any) {
        if (error.code === 'ENOENT') return null;
        throw Error('Agent密钥配置无法读取，请在设置中重新保存');
    }
}

let saveQueue: Promise<unknown> = Promise.resolve();
export function saveAgentSettings(input: any) {
    const operation = saveQueue.then(async () => {
        const file = settingsFile();
        const previous = await fs.readFile(file, 'utf8').then(JSON.parse).catch((error: any) => { if (error.code === 'ENOENT') return null; throw error; });
        const api = input.customApi || {}, url = new URL(api.baseUrl || 'https://api.deepseek.com');
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('无效的API地址');
        const baseUrl = url.href.replace(/\/$/, '');
        const same = previous?.customApi?.baseUrl === baseUrl;
        const protectedKey = api.apiKey ? await protect(String(api.apiKey)) : same ? previous.customApi.protectedKey : undefined;
        const value = { provider: input.provider === 'custom' ? 'custom' : 'codex', codexModel: String(input.codexModel || ''), customApi: { baseUrl, model: String(api.model || 'deepseek-flash'), protectedKey } };
        await fs.mkdir(path.dirname(file), { recursive: true });
        const temp = file + '.' + randomUUID() + '.tmp';
        try { await fs.writeFile(temp, JSON.stringify(value), { mode: 0o600 }); await fs.rename(temp, file); }
        finally { await fs.rm(temp, { force: true }); }
        return loadAgentSettings();
    });
    saveQueue = operation.catch(() => {});
    return operation;
}
