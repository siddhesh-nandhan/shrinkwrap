// Video compression and conversion with the shared ffmpeg.wasm engine (single-threaded, so expect slower than real time).
import {runJob} from './ffmpeg.js';
import {CODECS,CONTAINERS,containerFor,codecsFor} from './video-formats.js';

const LEVELS=['high quality','balanced','small','smallest'];
// Limits the shorter side, so portrait and landscape clips get the same treatment; dimensions stay even for 4:2:0 encoders.
const scale=n=>`scale=w='if(gte(iw,ih),-2,trunc(min(${n},iw)/2)*2)':h='if(gte(iw,ih),trunc(min(${n},ih)/2)*2,-2)'`;

export async function compressVideo(bytes,fileName,{container:choice='mp4',mode='lossy',codec='h264',level=1,maxSize=0,fps=0,mute=false}={},onStatus=()=>{}){
  const container=containerFor(choice,fileName),c=CONTAINERS[container];
  if(!c)throw Error('Unsupported video output format.');
  // Codecs are in preference order: lossless falls through the rest of the list when one cannot hold the input (raw AVI, WMV…).
  const allowed=codecsFor(container,mode),start=Math.max(0,allowed.indexOf(codec)),candidates=mode==='lossless'?allowed.slice(start):[allowed[start]];
  const noAudio=mute||!c.audio,filters=[maxSize&&scale(maxSize),fps&&`fps=fps='min(${fps},source_fps)'`].filter(Boolean);
  let inputAudio=false,sawOutput=false;const onLog=({message})=>{if(/^Output #0/.test(message))sawOutput=true;else if(!sawOutput&&/Stream #0:\d+.*: Audio:/.test(message))inputAudio=true;};
  // wasm memory never shrinks, so each video gets a fresh engine afterwards; long batches (and later audio) don't run out.
  return runJob({bytes,fileName,outExt:c.ext,label:'video',fresh:true,onLog,onStatus,crashMessage:'The video engine ran out of memory or stopped on this file. Try a smaller video, a lower resolution, or H.264.'},async({input,output,exec})=>{
    const run=(codec,audio)=>exec(['-i',input,'-map','0:v:0',...(audio?['-map','0:a:0?',...audio]:['-an']),'-map_metadata','-1','-sn','-dn',...CODECS[codec][mode](level),...(codec!=='copy'&&filters.length?['-vf',filters.join(',')]:[]),...(c.extra||[]),'-y',output]);
    // Lossless keeps the original audio when the container allows it; once that fails, the container's best audio codec is used.
    let audio=noAudio?null:mode==='lossless'?['-c:a','copy']:c.audio,audioNote=noAudio?'audio removed':mode==='lossless'?'audio untouched':'audio re-encoded',code=1;
    for(codec of candidates){
      if(codec!==candidates[0])onStatus({stage:'Re-encoding losslessly to fit the format…'});
      code=await run(codec,audio);
      if(code!==0&&audio?.[1]==='copy'){audio=c.fallbackAudio;audioNote='audio converted to fit the format';code=await run(codec,audio);}
      if(code===0)break;
    }
    if(code!==0)throw Error(candidates.length===1&&codec==='copy'?`These streams cannot be placed in ${c.name} without re-encoding. Choose MP4, MOV or MKV.`:'This video could not be processed. It may be damaged or use an unsupported codec.');
    if(!inputAudio&&!noAudio)audioNote='no audio track';
    const name=CODECS[codec].name,detail=codec==='copy'?`${c.name} · original streams, no quality change`:`${c.name}${name===c.name?'':` · ${name}`} · ${mode==='lossless'?'lossless':LEVELS[level]}${maxSize?` · up to ${maxSize}p`:''}${fps?` · up to ${fps} fps`:''}`;
    return {extension:c.ext,mime:c.mime,note:`${detail} · ${c.audio?audioNote:'no audio in this format'} · metadata removed`};
  });
}
