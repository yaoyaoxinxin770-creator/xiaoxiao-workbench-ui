export function promptDuration(prompt:string):number|null {
 const value=Number(/总时长\s*[:：]\s*(\d+(?:\.\d+)?)\s*(?:秒|s)/i.exec(prompt)?.[1]);
 if(!Number.isFinite(value)||value<=0)return null;
 const base=Math.floor(value);return base+(value-base>0.5+Number.EPSILON*value?1:0);
}
