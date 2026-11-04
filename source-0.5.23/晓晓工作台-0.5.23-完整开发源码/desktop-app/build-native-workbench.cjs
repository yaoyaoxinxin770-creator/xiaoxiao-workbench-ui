// Personal tools are mounted in the upstream React application, without frames or the old shell.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const web = path.join(root, 'infinite-canvas/web');
const dest = path.join(web, 'public/xiaoxiao');
fs.mkdirSync(dest, {recursive:true});
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('jimeng-canvas-extension/workbench.html');
const workspace = html.slice(html.indexOf('<div id="workspaceView"'), html.indexOf('<section id="infiniteCanvasView"'));
const actions = html.match(/<div class="top-actions">.*?<\/div><\/header>/)[0].replace(/<\/header>$/, '');
const compatibility = '<div hidden id="projectView"><div id="projectPage"><div id="projectList"></div><div id="projectEmpty"></div><button id="createProject"></button></div></div>';
fs.writeFileSync(path.join(dest, 'panels.html'), actions + compatibility + workspace + '<section id="typetaleView" class="view-container typetale-workbench" hidden></section>');
const sources = ['desktop-app/browser-bridge.js','jimeng-canvas-extension/workbench.js','jimeng-canvas-extension/typetale-model-family.js','jimeng-canvas-extension/typetale-core.js','jimeng-canvas-extension/typetale-workbench.js','desktop-app/asset-workspace.js','desktop-app/cdp-controls.js'];
for (const file of sources) fs.copyFileSync(path.join(root,file), path.join(dest,path.basename(file)));
const postcss = require(path.join(web, 'node_modules/postcss'));
const styles = ['jimeng-canvas-extension/workbench.css','jimeng-canvas-extension/asset-index.css','desktop-app/asset-workspace.css','desktop-app/asset-audio-picker.css','desktop-app/prompt-preview.css','jimeng-canvas-extension/typetale-workbench.css'];
let css = '';
for (const file of styles) {
  const sheet = postcss.parse(read(file));
  sheet.walkRules(rule => { rule.selector = rule.selector.replace(/:root|\bbody\b/g, ':scope'); });
  sheet.walkDecls(decl => {
    // Keep semantic success/error colors; translate the former fixed pink/light palette into app tokens.
    decl.value = decl.value.replace(/#([\da-f]{3,8})\b/gi, (match, hex) => {
      if (![3,4,6,8].includes(hex.length)) return match;
      const full = hex.length < 5 ? [...hex].map(c=>c+c).join('') : hex;
      const [r,g,b] = [0,2,4].map(i=>parseInt(full.slice(i,i+2),16));
      if (r>150 && b>g*1.2 && r>g*1.2) return /background/.test(decl.prop) ? 'var(--secondary)' : 'var(--muted-foreground)';
      if ((g > r*1.15 && g>b*1.05) || (r>180 && r>g*1.5 && r>b*1.35)) return match;
      if (/border/.test(decl.prop)) return 'var(--border)';
      if (/background|shadow/.test(decl.prop)) { const avg=(r+g+b)/3; return avg>230 ? 'var(--card)' : avg>210 ? 'var(--background)' : 'var(--secondary)'; }
      return (r+g+b)/3<105 ? 'var(--foreground)' : 'var(--muted-foreground)';
    });
  });
  css += sheet.toString() + '\n';
}
css += `
.legacy-slot .asset-head #addAsset{display:none!important}
:scope{--ink:var(--foreground);--line:var(--border);--muted:var(--muted-foreground);--purple:var(--primary);background:transparent;color:var(--foreground);font:13px/1.5 system-ui,"Microsoft YaHei",sans-serif;min-height:100%;position:relative;-webkit-font-smoothing:antialiased}
.top-actions{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px;padding:14px 24px;border-bottom:1px solid var(--border);justify-content:flex-end;background:color-mix(in srgb,var(--background) 78%,transparent);backdrop-filter:blur(16px) saturate(1.3)}
.workspace-meta{padding:12px 24px;height:auto;min-height:60px;flex-wrap:wrap;gap:12px}
.layout{grid-template-columns:250px minmax(360px,1fr) 280px;padding:0 24px 24px;gap:16px}
.panel,.tt-shell{background:var(--card);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-sm);transition:box-shadow .22s}
.panel:hover{box-shadow:var(--shadow-md)}
button,input,textarea,select{color:var(--foreground)!important;background:var(--background)!important;border-color:var(--border)!important}
button{border-radius:10px;transition:color .18s,background-color .18s,border-color .18s,box-shadow .18s,transform .18s}
button:not(:disabled):hover{transform:translateY(-1px);box-shadow:var(--shadow-sm)}
button:not(:disabled):active{transform:none}
input,textarea,select{border-radius:10px;transition:border-color .18s,box-shadow .18s}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--primary)!important;box-shadow:var(--glow)}
button.primary,button.tt-primary,button.aw-primary{background:var(--primary)!important;color:var(--primary-foreground)!important;box-shadow:0 6px 16px -6px color-mix(in srgb,var(--primary) 55%,transparent)}
.connection,.browser-btn{color:var(--muted-foreground)!important;background:var(--secondary)!important;border-radius:999px}
.queue-item{border-radius:12px;transition:background-color .18s,border-color .18s}
.queue-item.selected{background:var(--accent)!important;border-color:color-mix(in srgb,var(--primary) 50%,var(--border))!important}
.aw-card{border-radius:14px;transition:transform .18s,box-shadow .18s}
.aw-card:hover{transform:translateY(-2px);box-shadow:var(--shadow-md)}
.typetale-workbench{padding:16px;min-height:100%}.tt-shell{min-height:calc(100vh - 98px)}
.tt-topbar{border-color:var(--border)}.tt-main{min-width:0}.tt-table{grid-template-columns:240px minmax(350px,1fr) 240px}
.view-container[hidden],[hidden]{display:none!important}.stepper,.selection-card,.mode-tabs{display:none!important}
.legacy-slot .top-actions{position:static;display:flex;flex-wrap:wrap;gap:8px;padding:0;border:0;background:transparent;backdrop-filter:none;justify-content:flex-start}
@media(max-width:1250px){.layout{grid-template-columns:220px minmax(320px,1fr)}.activity-panel{grid-column:1/-1}.tt-table{grid-template-columns:220px minmax(320px,1fr)}.tt-side-panel{display:none}}
`;
fs.writeFileSync(path.join(dest,'modules.css'), '@scope (.xiaoxiao-module) {\n'+css+'\n}');
console.log('Prepared native personal modules: '+sources.length+' scripts, scoped theme, no iframe.');
