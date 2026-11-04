'use strict';
// Only visible official-page controls are used. This function is serialized into an isolated web page.
function inspectInterpolationPage(input={}){
 const visible=e=>Boolean(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
 const name=e=>(e.getAttribute('aria-label')||e.textContent||'').trim().replace(/\s+/g,' ');
 const point=e=>{const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};};
 const button=(label,scope=document)=>[...scope.querySelectorAll('button,[role=button],[role=menuitem]')].filter(visible).filter(e=>name(e)===label);
 const target=(items,kind)=>{
  if(items.length!==1)return {kind:'unavailable',message:items.length?'官网出现多个同名操作，已停止':'官网尚未出现所需操作（'+kind+'）'};
  const element=items[0],p=point(element),hit=document.elementFromPoint(p.x,p.y);
  // The canvas toolbar animates into view after selection. Rects alone also match
  // controls outside the viewport; clicking those coordinates silently does nothing.
  if(p.x<0||p.y<0||p.x>=innerWidth||p.y>=innerHeight||!hit||!element.contains(hit))return {kind:'unavailable',message:'正在等待官网操作按钮进入可点击位置（'+kind+'）'};
  return {kind,point:p};
 };
 const targetFps=input.fps===60?60:30;
 const toolbar=document.querySelector('[role=toolbar][aria-label="Video frame interpolation settings"]');
 const canvas=document.querySelector('main[aria-label="Canvas workspace"]');
 const userMenu=button('用户菜单');
 if(input.step==='ready')return {kind:canvas&&userMenu.length===1?'ready':'needs_login',message:'请在独立网页登录窗口完成即梦登录，再回到工作台确认同一账号'};
 if(!canvas||userMenu.length!==1)return {kind:'needs_login',message:'官方补帧网页未登录，请在即梦 CLI 的官方补帧设置中登录'};
 const groups=[...document.querySelectorAll('[role=group][aria-label]')].filter(e=>/^视频 node:/.test(e.getAttribute('aria-label')||''));
 const hasId=e=>{for(let p=e,i=0;p&&i<4;p=p.parentElement,i++)if(['id','data-id','data-node-id'].some(k=>p.getAttribute(k)===input.nodeId))return true;return false;};
 let nodes=groups.filter(hasId);if(!nodes.length&&input.title)nodes=groups.filter(e=>e.getAttribute('aria-label')==='视频 node: '+input.title);
 if(nodes.length!==1)return {kind:'unavailable',message:nodes.length?'原视频标题重复且官网未提供节点标识，已停止以免补错视频':'原视频节点尚未显示，无法安全执行补帧'};
 const node=nodes[0];
 if(input.step==='select'){const r=node.getBoundingClientRect();if(r.width<=0||r.height<=0||r.right<=0||r.bottom<=0||r.left>=innerWidth||r.top>=innerHeight)return {kind:'unavailable',message:'原节点不在官方网页视区内，暂停补帧；请在官方补帧窗口核对画布定位'};return {kind:'select',point:{x:Math.max(0,Math.min(innerWidth-1,r.left+r.width/2)),y:Math.max(0,Math.min(innerHeight-1,r.top+r.height/2))}};}
 const selected=Boolean(node.querySelector('button[aria-label^="Rename "]'))||/Selected\./.test(node.textContent||'');
 if(input.step==='tools')return selected?target(button('工具'),'tools'):{kind:'unavailable',message:'官网尚未确认选中了原视频'};
 if(input.step==='interpolate')return selected?target([...document.querySelectorAll('[role=menuitem]')].filter(visible).filter(e=>name(e)==='补帧'),'interpolate'):{kind:'unavailable',message:'原视频选择已变化，未执行补帧'};
 if(input.step==='fps'){
  if(!toolbar||!visible(toolbar))return {kind:'unavailable',message:'正在等待官方补帧设置'};
  const fps=[...toolbar.querySelectorAll('button')].filter(visible).filter(e=>e.textContent.replace(/\s+/g,'')===targetFps+'FPS');
  return target(fps,'fps');
 }
 if(input.step==='confirm'){
  if(!selected||!toolbar||!visible(toolbar))return {kind:'unavailable',message:'原视频或官方补帧设置已变化，未提交'};
  const chosen=[...toolbar.querySelectorAll('button')].find(e=>e.getAttribute('aria-pressed')==='true');
  if(!chosen||chosen.textContent.replace(/\s+/g,'')!==targetFps+'FPS')return {kind:'unavailable',message:'官网未确认 '+targetFps+' FPS，未提交'};
  if(/积分|credits|[¥￥]/i.test(toolbar.textContent||''))return {kind:'approval_required',message:'官方补帧出现积分提示，请在独立官方窗口核对，本机不会自动批准未知费用'};
  return target(button('确认',toolbar).filter(e=>!e.disabled),'confirm');
 }
 return {kind:'unavailable',message:'未知的补帧操作'};
}
module.exports={inspectInterpolationPage};
