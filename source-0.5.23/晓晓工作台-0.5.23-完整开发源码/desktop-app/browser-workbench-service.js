const fs = require('fs');
const path = require('path');

const STATIC_FILES = new Set([
  'jimeng-canvas-extension/infinite-canvas-workbench.js',
  'jimeng-canvas-extension/infinite-canvas-workbench.css',
  'desktop-app/cdp-controls.js',
  'jimeng-canvas-extension/workbench.html',
  'jimeng-canvas-extension/workbench.css',
  'jimeng-canvas-extension/asset-index.css',
  'jimeng-canvas-extension/workbench.js',
  'jimeng-canvas-extension/typetale-model-family.js',
  'jimeng-canvas-extension/typetale-core.js',
  'jimeng-canvas-extension/typetale-workbench.js',
  'jimeng-canvas-extension/typetale-workbench.css',
  'jimeng-canvas-extension/project-page.js',
  'jimeng-canvas-extension/project-page.css',
  'desktop-app/browser-bridge.js',
  'desktop-app/typetale-model-family.js',
  'desktop-app/typetale-core.js',
  'desktop-app/asset-workspace.js',
  'desktop-app/asset-workspace.css',
  'desktop-app/asset-audio-picker.css',
  'desktop-app/pink-theme.css',
  'desktop-app/prompt-preview.css',
]);
const TYPES = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const ALLOWED_ORIGINS = new Set(['null', 'http://127.0.0.1:17842', 'http://localhost:17842', 'http://127.0.0.1:17843']);

function json(res, status, value) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(value));
}
function readBody(req, limit = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '', size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { reject(new Error('请求内容过大')); req.destroy(); return; }
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
function allowBrowserOrigin(req, res) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) return false;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return true;
}
function createBrowserWorkbenchHandler({root, actions, appRoot, webRoot}) {
  const workspaceRoot = path.resolve(root);
  const desktopRoot = path.resolve(appRoot || path.join(workspaceRoot, 'desktop-app'));
  const extensionRoot = path.resolve(webRoot || path.join(workspaceRoot, 'jimeng-canvas-extension'));
  return async function handleBrowserWorkbench(req, res) {
    const pathname = new URL(req.url, 'http://127.0.0.1:17842').pathname;
    if (/^\/workbench\/media\/[a-f0-9]{48}$/.test(pathname)) {
      if (!allowBrowserOrigin(req,res)) { json(res,403,{error:'拒绝其他网页访问本地媒体'});return true; }
      if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return true;}
      require('./project-library').serveMedia(req,res,pathname.split('/').pop());return true;
    }
    if (pathname === '/workbench' || pathname === '/workbench/') {
      res.writeHead(302, {Location:'/jimeng-canvas-extension/workbench.html'}); res.end(); return true;
    }
    if (pathname === '/workbench/api') {
      if (!allowBrowserOrigin(req, res)) { json(res, 403, {error:'拒绝其他网页访问本地项目'}); return true; }
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
      if (req.method !== 'POST') { json(res, 405, {error:'仅支持 POST'}); return true; }
      try {
        const body = JSON.parse(await readBody(req) || '{}');
        if (typeof body.method !== 'string' || !Object.hasOwn(actions, body.method)) throw new Error('不支持的工作台操作');
        const args = Array.isArray(body.args) ? body.args : [];
        const result = await actions[body.method](...args);
        json(res, 200, {result});
      } catch (error) {
        json(res, 400, {error:String(error?.message || error)});
      }
      return true;
    }
    if (req.method !== 'GET') return false;
    const relative = decodeURIComponent(pathname).replace(/^\/+/, '').replace(/\\/g, '/');
    if (!STATIC_FILES.has(relative)) return false;
    const desktopPrefix = 'desktop-app/';
    const extensionPrefix = 'jimeng-canvas-extension/';
    const base = relative.startsWith(desktopPrefix) ? desktopRoot : relative.startsWith(extensionPrefix) ? extensionRoot : workspaceRoot;
    const inner = relative.startsWith(desktopPrefix) ? relative.slice(desktopPrefix.length) : relative.startsWith(extensionPrefix) ? relative.slice(extensionPrefix.length) : relative;
    const file = path.resolve(base, ...inner.split('/'));
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return true; }
    res.writeHead(200, {'Content-Type':TYPES[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    fs.createReadStream(file).pipe(res);
    return true;
  };
}

module.exports = {createBrowserWorkbenchHandler, STATIC_FILES};
