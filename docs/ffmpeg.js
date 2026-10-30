// One shared ffmpeg.wasm instance for audio and video, bundled in ./vendor so nothing is fetched from a third party.
// The ~30 MB engine only loads the first time a media file is processed.
import {FFmpeg} from './vendor/ffmpeg/index.js';
import {extOf} from './engine.js';
let ready;
const asset=name=>new URL(`./vendor/ffmpeg-core/${name}`,import.meta.url).href;
function engine(){
  ready??=(async()=>{const ff=new FFmpeg();await ff.load({coreURL:asset('ffmpeg-core.js'),wasmURL:asset('ffmpeg-core.wasm')});return ff;})().catch(e=>{ready=null;throw Error('The media engine could not load. Check your connection to this site and try again.');});
  return ready;
}
async function resetEngine(){const p=ready;ready=null;try{(await p)?.terminate();}catch{}}
// Runs one file through the engine: progress, temp files and crash recovery. `body` gets an exec() that resets progress per pass
// and returns {extension,mime,note}; the output bytes are read here. `fresh` drops the engine afterwards to free wasm memory.
export async function runJob({bytes,fileName,outExt,label,crashMessage,fresh=false,onLog,onStatus},body){
  onStatus({stage:`Loading ${label} engine (first time only)…`});
  const ff=await engine(),input=`input.${extOf(fileName)||'bin'}`,output=`output.${outExt}`;
  let last=-1;const onProgress=({progress})=>{const pct=Math.max(0,Math.min(99,Math.round(progress*100)));if(pct!==last){last=pct;onStatus({stage:`Compressing ${label} on your device… ${pct}%`});}};
  ff.on('progress',onProgress);if(onLog)ff.on('log',onLog);
  try{
    onStatus({stage:`Compressing ${label} on your device…`});
    await ff.writeFile(input,bytes);
    const result=await body({input,output,exec:args=>{last=-1;return ff.exec(args);}});
    const out=await ff.readFile(output);
    if(!out?.length)throw Error('Compression produced an empty file.');
    return {...result,bytes:out};
  }catch(e){
    // A wasm trap leaves the engine unusable and is thrown as a bare string: reset so the next file starts clean.
    if(typeof e==='string'||e?.name==='RuntimeError'){fresh=true;throw Error(crashMessage);}
    throw e;
  }finally{
    ff.off('progress',onProgress);if(onLog)ff.off('log',onLog);
    if(fresh)await resetEngine();else for(const f of [input,output])try{await ff.deleteFile(f);}catch{}
  }
}
