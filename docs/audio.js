// Audio compression with the shared ffmpeg.wasm engine.
import {runJob} from './ffmpeg.js';

export const PROFILES={
  mp3:{ext:'mp3',mime:'audio/mpeg',name:'MP3',args:b=>['-c:a','libmp3lame','-b:a',`${b}k`]},
  aac:{ext:'m4a',mime:'audio/mp4',name:'AAC',args:b=>['-c:a','aac','-b:a',`${b}k`,'-movflags','+faststart']},
  opus:{ext:'opus',mime:'audio/ogg',name:'Opus',// compression_level above 4 crashes this wasm build's libopus on stereo input
  args:b=>['-c:a','libopus','-b:a',`${b}k`,'-compression_level','4']},
  flac:{ext:'flac',mime:'audio/flac',name:'FLAC',args:()=>['-c:a','flac','-compression_level','8']}
};
export async function compressAudio(bytes,fileName,{audioFormat='mp3',bitrate=128,mono=false}={},onStatus=()=>{}){
  const profile=PROFILES[audioFormat];if(!profile)throw Error('Unsupported audio output format.');
  return runJob({bytes,fileName,outExt:profile.ext,label:'audio',onStatus,crashMessage:'The audio engine stopped unexpectedly on this file. Try another format or bitrate.'},async({input,output,exec})=>{
    const code=await exec(['-i',input,'-vn','-map_metadata','0',...(mono?['-ac','1']:[]),...profile.args(bitrate),output]);
    if(code!==0)throw Error('This audio file could not be processed. It may be damaged or use an unsupported codec.');
    const detail=audioFormat==='flac'?'FLAC · lossless':`${profile.name} · ${mono?'mono · ':''}${bitrate} kbps`;
    return {extension:profile.ext,mime:profile.mime,note:`${detail} · tags kept, cover art removed`};
  });
}
