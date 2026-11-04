export function splitSourceSegments(source: string){
  const lines=String(source||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n').map(line=>/^[ \t]*(?:\\?\x60){3,}/.test(line)?line.replace(/\\(?=\x60)/g,''):line);
  const fenceMark=/^[ \t]*(\x60{3,}|~{3,})(.*)$/;
  let start=0,end=lines.length,level=0,fence='';
  // Only the third section contains importable video prompts; ignore headings inside code blocks.
  for(const [i,line] of lines.entries()){
    const mark=fenceMark.exec(line);
    if(mark){if(!fence)fence=mark[1];else if(mark[1][0]===fence[0]&&mark[1].length>=fence.length&&!mark[2].trim())fence='';continue;}
    if(fence)continue;
    const heading=/^[ \t]{0,3}(#{1,6})[ \t]+(.+)$/.exec(line);
    if(!heading)continue;
    if(!level&&/^第[三3]部分\s*[:：]\s*纯视频生成提示词\s*$/.test(heading[2].replace(/\*/g,'').replace(/\s+#+\s*$/,'').trim())){start=i+1;level=heading[1].length;}
    else if(level&&heading[1].length<=level){end=i;break;}
  }
  const scoped=lines.slice(start,end),blocks: string[]=[],plain: string[]=[];
  let language='',body: string[]=[],hasFences=false;fence='';
  for(const line of scoped){
    const footer=/^\s*#{1,6}\s+(?:想请你确认|请你确认|请确认|补充说明|附录)(?:\s|$|[:：])/.test(line);
    if(footer&&(!fence||/^\s*---+\s*$/.test(body.filter(l=>l.trim()).at(-1)||'')))break;
    const mark=fenceMark.exec(line);
    if(!fence){if(mark){fence=mark[1];language=mark[2].trim();body=[];hasFences=true;}else plain.push(line);continue;}
    if(mark&&mark[1][0]===fence[0]&&mark[1].length>=fence.length&&!mark[2].trim()){
      if(/^(?:plaintext|plain|text|txt|prompt)?$/i.test(language))blocks.push(body.join('\n'));
      fence='';
    }else body.push(line);
  }
  if(fence&&/^(?:plaintext|plain|text|txt|prompt)?$/i.test(language)&&body.length)blocks.push(body.join('\n').replace(/\n[ \t]*(?:---+|\*\*\*+)[ \t]*$/,''));
  const sources=hasFences?blocks:[plain.filter(line=>!/^\s*(?:\*{0,2}#{1,6}\s*|\*{2}\s*)第\d+(?:集第\d+)?组/.test(line)).join('\n')];
  return sources.flatMap(source=>{
    const normalized=source.trim(),videos=[...normalized.matchAll(/^[ \t]*【?[ \t]*视频编号[ \t]*[:：]?[ \t]*([Vv]?\d+(?:-\d+)*)[^\n]*/gm)];
    if(!videos.length)return [];
    const specs=[...normalized.matchAll(/^[ \t]*【项目规格】/gm)].map(match=>match.index!);
    // Retain the specifications-before-number layout used by older plain-text prompts.
    const boundaries=specs.length&&specs[0]<videos[0].index!?specs:videos.map(match=>match.index!);
    return boundaries.map((begin,index)=>{
      const prompt=normalized.slice(begin,boundaries[index+1]??normalized.length).trim().replace(/\n[ \t]*---+[ \t]*$/,'').trim();
      const match=/^[ \t]*【?[ \t]*视频编号[ \t]*[:：]?[ \t]*([Vv]?\d+(?:-\d+)*)[^\n]*/m.exec(prompt);
      return match?{id:match[1],prompt}:null;
    }).filter((item): item is {id:string;prompt:string} => Boolean(item));
  });
}
// 不同模板声明场景的位置不一样：有的写在首行表头“｜场景：庄园花丛｜”，有的只