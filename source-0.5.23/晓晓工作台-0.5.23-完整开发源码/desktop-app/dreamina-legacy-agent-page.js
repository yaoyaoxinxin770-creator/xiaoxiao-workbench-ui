'use strict';

// Only public, rendered conversation cards are read. Loading animations are not results.
function inspectAgentTurn({turnId,prompt,baselineIds=[]}) {
  const normalize=text=>String(text||'').replace(/\s+/g,'');
  const turns=[...document.querySelectorAll('[id^="item_"][data-id]')];
  const matches=turns.filter(turn=>{
    if(turnId)return turn.dataset.id===turnId;
    if(baselineIds.includes(turn.dataset.id))return false;
    const bubble=turn.querySelector('[class*="user-message-"] [class*="bubble-"]');
    const fragments=[...(bubble?.querySelectorAll('[class*="prompt-value-container-"]')||[])];
    return fragments.length&&normalize(fragments.map(n=>n.textContent).join(''))===normalize(prompt);
  });
  if(matches.length!==1)return {status:'unknown',detail:matches.length?'找到多条同名任务，请在官网核对':'请打开此任务原来的官网对话，再同步结果'};
  const turn=matches[0],group=turn.querySelector('[class*="video-nodes-container-"]');
  if(!group)return {status:'processing',turnId:turn.dataset.id,detail:'Agent 正在处理请求'};
  const text=group.textContent||'',result={turnId:turn.dataset.id};
  if(/生成失败|任务失败|失败重试|审核未通过|不符合.*规范/.test(text))return {...result,status:'failed',detail:text.trim().slice(0,300)};
  if(/排队|生成中|加载中|\d+%/.test(text))return {...result,status:'processing',detail:text.trim().slice(0,100)};
  const buttons=[...group.querySelectorAll('[aria-label="预览 · 视频"]')];
  if(buttons.length!==1)return {...result,status:'unknown',detail:'Agent 未返回唯一视频，请在原画布核对'};
  const button=buttons[0];
  if(button.getAttribute('aria-disabled')==='true'||button.getAttribute('aria-busy')==='true')return {...result,status:'processing',detail:'等待即梦生成视频'};
  const videos=[...group.querySelectorAll('video[src]')].filter(v=>!/(?:loading|static\/media)/i.test(v.className+' '+v.getAttribute('src')));
  if(videos.length===1)return {...result,status:'ready',url:videos[0].src,duration:Number.isFinite(videos[0].duration)?videos[0].duration:null};
  return {...result,status:'ready',previewElementId:turn.id};
}

function inspectAgentPreview() {
  const videos=[...document.querySelectorAll('[class*="video-node-wrapper-"] video[src]')];
  if(videos.length!==1)return null;
  const v=videos[0];
  if(/(?:loading|static\/media)/i.test(v.className+' '+v.getAttribute('src')))return null;
  return {url:v.src,duration:Number.isFinite(v.duration)?v.duration:null};
}

function assertMediaUrl(raw) {
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!/(^|\.)vlabvod\.com$/i.test(url.hostname))throw Error('官网视频地址不属于已验证的即梦媒体域名，请在原画布下载');
  return url.href;
}

module.exports={inspectAgentTurn,inspectAgentPreview,assertMediaUrl};
