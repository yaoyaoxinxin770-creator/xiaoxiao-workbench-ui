const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('startup',{
  action:action=>ipcRenderer.invoke('workbench:startup-action',action),
  onState:callback=>ipcRenderer.on('workbench:startup-state',(_event,state)=>callback(state))
});
