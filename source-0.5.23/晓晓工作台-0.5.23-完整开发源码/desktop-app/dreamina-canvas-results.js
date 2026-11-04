// Read only the original node and connected post-processing nodes; never submit generation.
async function interpolatedResult(service, task) {
 const shown = await service.command(['node','show','--project-id',task.projectId,'--node-id',task.nodeId]);
 const source = shown.nodes?.find(n=>n.result==='FOUND'&&n.node?.nodeId===task.nodeId)?.node;
 if(!source)throw Error('原画布视频节点不存在，请在官网核对');
 const ready=source.resources?.some(r=>r.type==='video'&&r.status==='success');
 if(!ready&&!source.downstreamNodeIds?.length)return null;
 const seen=new Set([source.nodeId]),connected=new Set([source.nodeId]),queue=[...(source.downstreamNodeIds||[])],candidates=[];
 while(queue.length){
  const ids=[...new Set(queue.splice(0,10))].filter(id=>!seen.has(id));
  if(!ids.length)continue;
  if(seen.size+ids.length>100)throw Error('原视频后续节点过多，请在画布核对补帧结果');
  const response=await service.command(['node','show','--project-id',task.projectId,...ids.flatMap(id=>['--node-id',id])]);
  for(const id of ids){
   seen.add(id);
   const node=response.nodes?.find(n=>n.result==='FOUND'&&n.node?.nodeId===id)?.node;
   // Ordinary generated successors are separate creative work, not this video's post-processing.
   if(!node||node.type!=='video'||node.generation?.model||!node.upstreamNodeIds?.some(up=>connected.has(up)))continue;
   connected.add(node.nodeId);
   if(/[_－-]补帧(?:[（(]\d+[）)])?$/.test(node.title||''))candidates.push(node);
   queue.push(...(node.downstreamNodeIds||[]));
  }
 }
 const timestamp=n=>Math.max(0,...(n.resources||[]).map(r=>Number(r.createdAt)||0));
 candidates.sort((a,b)=>timestamp(b)-timestamp(a));
 const node=candidates[0];
 if(!node){const resources=(source.resources||[]).filter(r=>r.type==='video'&&r.status==='success');return {waiting:true,hasCandidate:false,sourceReady:ready&&resources.length===1,source:{title:source.title,resourceId:resources.length===1?resources[0].resourceId:undefined},...(resources.length>1?{message:'原视频节点有多份可用视频，无法确认补帧对象，请在官方补帧窗口核对'}:{})};}
 if(candidates[1]&&timestamp(node)===timestamp(candidates[1]))throw Error('存在多份同时补帧的结果，请在画布核对后重试');
 const resources=(node.resources||[]).filter(r=>r.type==='video');
 if(resources.some(r=>r.status==='failed'||r.status==='canceled'))throw Error('画布补帧失败，请在官网处理原补帧节点');
 if(!resources.length||resources.some(r=>r.status!=='success'))return {waiting:true,hasCandidate:true};
 if(resources.length!==1)throw Error('补帧节点包含多份视频，请在官网核对要回传的结果');
 return {nodeId:node.nodeId,resourceId:resources[0].resourceId};
}
module.exports={interpolatedResult};
