import {Modal} from 'antd';
export async function confirmCliVideoGeneration(provider:string,mode?:string){
 if(mode!=="confirm")return;
 const accepted=await new Promise<boolean>(resolve=>Modal.confirm({title:provider+"生成确认",content:"确认后将创建视频并提交生成，消耗平台积分。实际积分以官网为准。",okText:"确认生成",cancelText:"取消",onOk:()=>{resolve(true);},onCancel:()=>{resolve(false);}}));
 if(!accepted)throw Error("已取消生成，未提交扣费");
}
