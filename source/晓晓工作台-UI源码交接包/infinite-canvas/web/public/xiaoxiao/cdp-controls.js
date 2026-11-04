(() => {
  const init=()=>{
    const bridge=window.desktopBridge;
    if(!bridge?.cdpSettings)return;
    const openButton=document.createElement('button');openButton.className='primary';openButton.type='button';openButton.textContent='打开并连接即梦浏览器';openButton.id='cdpOpenBrowserButton';
    openButton.title='使用之前保存登录状态的即梦专用浏览器，连接上次使用的画布';
    document.querySelector('.top-actions')?.insertBefore(openButton,document.getElementById('checkBrowser'));
    const projectOpenButton=openButton.cloneNode(true);projectOpenButton.id='cdpProjectOpenBrowserButton';
    document.querySelector('.project-page-actions')?.prepend(projectOpenButton);
    const style=document.createElement('style');style.textContent='.topbar{height:auto;min-height:84px;flex-wrap:wrap;gap:16px;padding-top:12px;padding-bottom:12px}.top-actions{flex-wrap:wrap;justify-content:flex-end}.brand{flex-shrink:0}';document.head.append(style);
    const button=document.createElement('button');button.className='ghost';button.textContent='即梦直连设置';button.id='cdpSettingsButton';
    document.querySelector('.top-actions')?.append(button);
    const projectButton=button.cloneNode(true);projectButton.id='cdpProjectSettingsButton';
    document.querySelector('.project-page-actions')?.prepend(projectButton);
    const panel=document.createElement('dialog');panel.id='cdpSettingsDialog';
    Object.assign(panel.style,{width:'min(680px,90vw)',border:'1px solid #e5bfd0',borderRadius:'18px',padding:'24px',color:'#493a43',background:'#fff9fc'});
    panel.innerHTML='<form method="dialog"><button style="float:right" aria-label="关闭直连设置">关闭</button><h2>即梦浏览器桥接</h2></form>'+
      '<p>使用原专用浏览器保存的登录资料，并连接上次使用的画布。首次使用或登录过期时，需要在即梦登录。</p>'+
      '<label>连接方式 <select id="cdpMode"><option value="cdp">CDP 直连（推荐）</option><option value="extension">原扩展连接</option></select></label> '+
      '<label>本机端口 <input id="cdpPort" type="number" min="1024" max="65535" value="9333" style="width:85px"></label>'+
      '<p><button type="button" id="cdpApply">保存方式与端口</button> <button type="button" id="cdpLaunch">打开并连接浏览器</button> <button type="button" id="cdpRefreshTargets">刷新画布列表</button></p>'+
      '<label>目标画布 <select id="cdpTarget" style="max-width:100%"><option value="">自动选择唯一画布</option></select></label> <button type="button" id="cdpSelectTarget">连接此画布</button>'+
      '<p><button type="button" id="cdpRecover">核对原任务（不重发）</button> <button type="button" id="cdpAcknowledge">人工核对后结束本条</button></p>'+
      '<p style="font-size:13px">每组只发送一次，只有真实积分余额下降才标记已发送。打开浏览器不会发送任务。<br>你点了发送就会发送；只有两种情况例外：即梦输入框里还留着没清理的文字或图片（会提示你清理），或者同一条提示词上次已经点过发送（避免重复扣费，可在此处“人工核对后结束本条”解除）。</p>'+
      '<pre id="cdpDetail" role="status" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto"></pre>';
    document.body.append(panel);
    const $=id=>panel.querySelector('#'+id),show=text=>{$('cdpDetail').textContent=String(text);};
    const run=action=>async event=>{
      const control=event?.currentTarget;if(control)control.disabled=true;
      try{const result=await action();if(result!==undefined)show(typeof result==='string'?result:JSON.stringify(result,null,2));}
      catch(error){show(error.message||error);}
      finally{if(control)control.disabled=false;}
    };
    const settings=async()=>{
      const config=await bridge.cdpSettings();
      $('cdpMode').value=config.mode;$('cdpPort').value=config.port;
      show(config.pending
        ?'上一条记录还没有扣费确认：分镜 '+((config.pending.videoNumbers||[]).join('、')||'未知')+'（'+(config.pending.detail||config.pending.phase||'状态未知')+'）\n原画布：'+config.pending.url+
          '\n\n它不会挡住别的视频组；只有同一条提示词再点发送时才会拦下来，避免重复扣费。'
        :'当前方式：'+(config.mode==='cdp'?'CDP 直连':'原扩展连接')+'，端口 '+config.port);
      return config;
    };
    const targets=async()=>{
      const config=await bridge.cdpSettings(),items=await bridge.cdpTargets();
      $('cdpTarget').replaceChildren(new Option('自动选择唯一画布',''));
      items.forEach(t=>$('cdpTarget').add(new Option((t.title||'即梦画布')+' · '+t.url,t.id)));
      $('cdpTarget').value=config.targetId||'';
      return '找到 '+items.length+' 个画布；请选择要投放的目标。';
    };
    let opening=false;
    const openAndConnect=async()=>{
      if(opening)return;
      opening=true;
      const controls=[openButton,projectOpenButton,$('cdpLaunch')];
      controls.forEach(control=>{control.disabled=true;});
      openButton.textContent=projectOpenButton.textContent='正在打开并连接…';
      const connection=document.getElementById('bridgeStatus');
      if(connection){connection.textContent='正在打开即梦浏览器';connection.className='connection checking';}
      try{
        const result=await bridge.cdpOpenAndConnect();
        if(result.online){
          const text='已连接即梦画布';
          if(connection){connection.textContent=text;connection.className='connection';connection.title=result.connector?.url||text;}
          show(text+'：'+(result.connector?.url||'')+'\n已使用原专用浏览器的登录资料。'+(result.pendingNotice?'\n\n'+result.pendingNotice:''));
          if(result.pendingNotice&&!panel.open)panel.showModal();
        }else{
          if(connection){connection.textContent='浏览器已打开，等待画布连接';connection.className='connection offline';connection.title=result.error||'';}
          if(!panel.open)panel.showModal();
          await settings();
          if(result.needsTargetSelection)await targets();
          show(result.error||'浏览器已打开，请打开即梦画布后重试。');
        }
      }catch(error){
        if(connection){connection.textContent='即梦浏览器未连接';connection.className='connection offline';connection.title=String(error.message||error);}
        if(!panel.open)panel.showModal();
        show(error.message||error);
      }finally{
        opening=false;controls.forEach(control=>{control.disabled=false;});
        openButton.textContent=projectOpenButton.textContent='打开并连接即梦浏览器';
      }
    };
    openButton.onclick=projectOpenButton.onclick=openAndConnect;
    button.onclick=projectButton.onclick=async()=>{panel.showModal();try{await settings();}catch(error){show(error.message);}};
    $('cdpApply').onclick=run(async()=>{await bridge.cdpConfigure({mode:$('cdpMode').value,port:Number($('cdpPort').value)});await settings();return '已保存。请启动专用浏览器或刷新画布列表。';});
    $('cdpLaunch').onclick=openAndConnect;
    $('cdpRefreshTargets').onclick=run(targets);
    $('cdpSelectTarget').onclick=run(async()=>{await bridge.cdpConfigure({mode:'cdp',port:Number($('cdpPort').value),targetId:$('cdpTarget').value});const result=await bridge.connectorStatus();return result.online?'已连接：'+result.connector.url:result.error;});
    $('cdpRecover').onclick=run(async()=>{const result=await bridge.cdpRecover();return result.ok?'原任务核对完成。请返回队列查看，已成功的分镜不要再次执行。':result.error||result.detail||'原任务仍在运行，请稍后核对。';});
    $('cdpAcknowledge').onclick=run(async()=>{
      if(!window.confirm('请先在即梦核对本条是否已经提交、是否扣费。结束本条只解除锁定，不会重发，也不会把队列标记成功。确认已人工核对并停止本条后再继续？'))return '保留原任务记录。';
      await bridge.cdpAcknowledge();return '已保存人工核对记录并结束本条。请按即梦实际结果处理队列，避免重复执行已成功的分镜。';
    });
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
