"use client";
import {useRef,useState} from 'react';
import {App,Button} from 'antd';
export async function readMarkdownFile(file:File){
 if(!/\.(md|markdown)$/i.test(file.name))throw Error('请选择 MD 文件');
 if(file.size>5*1024*1024)throw Error('MD 文件不能超过 5 MB');
 const text=(await file.text()).replace(/^\uFEFF/,'');
 if(!text.trim())throw Error('文件内容为空');
 return text;
}
export function MarkdownFileImport({onImport,label='导入 MD 文件'}:{onImport:(text:string)=>void;label?:string}){
 const input=useRef<HTMLInputElement>(null),[loading,setLoading]=useState(false),{message}=App.useApp();
 return <><input ref={input} hidden type="file" accept=".md,.markdown,text/markdown,text/plain" aria-label={label} onChange={async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;setLoading(true);try{onImport(await readMarkdownFile(file));message.success('已读取 '+file.name);}catch(error){message.error(error instanceof Error?error.message:'读取 MD 文件失败');}finally{setLoading(false);}}}/><Button loading={loading} onClick={()=>input.current?.click()}>{label}</Button></>;
}
