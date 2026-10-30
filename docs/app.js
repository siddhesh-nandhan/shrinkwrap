import {join,crc32,extOf} from './engine.js';
import * as vf from './video-formats.js?v=7';
const $=id=>document.getElementById(id),items=[];let worker,sequence=0,refreshTimer=null;
const size=n=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(2)} MB`;
// File kinds: images and GLB models run in the worker lane; audio and video share the ffmpeg.wasm media lane so the two never block each other.
// Media kinds name their extensions once; the drop test and the picker's accept list are both built from them.
const byExt=(type,exts)=>({test:f=>exts.includes(extOf(f.name))||f.type.startsWith(type+'/'),accept:[type+'/*',...exts.map(e=>'.'+e)].join(',')});
const KINDS={
  image:{test:f=>/\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name),limit:30,formats:'PNG, JPEG, WebP, BMP & GIF input · 30 MB per file',verb:'Drop images here',accept:'image/png,image/jpeg,image/webp,image/bmp,image/gif,.png,.jpg,.jpeg,.webp,.bmp,.gif'},
  glb:{test:f=>/\.glb$/i.test(f.name),limit:150,formats:'GLB (binary glTF) 3D models · 150 MB per file',verb:'Drop .glb models here',accept:'.glb,model/gltf-binary'},
  video:{...byExt('video',['mp4','m4v','mov','mkv','webm','avi','wmv','flv','f4v','mpg','mpeg','m2v','ts','mts','m2ts','3gp','3g2','ogv','vob','asf','divx','mxf']),limit:500,formats:'MP4, MOV, MKV, WebM, AVI, WMV, FLV, MPEG, 3GP & more · 500 MB per file',verb:'Drop videos here',media:()=>import('./video.js?v=7').then(m=>m.compressVideo)},
  audio:{...byExt('audio',['mp3','mp2','wav','flac','ogg','oga','opus','m4a','aac','aif','aiff','wma','amr','caf','ac3','mka']),limit:200,formats:'MP3, WAV, FLAC, AAC, M4A, OGG, Opus, AIFF & more · 200 MB per file',verb:'Drop audio files here',media:()=>import('./audio.js?v=7').then(m=>m.compressAudio)}
};
const media=kind=>!!KINDS[kind].media;
const kindOf=file=>Object.keys(KINDS).find(k=>KINDS[k].test(file))||null;
const ICONS={video:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3z"/></svg>',glb:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>',audio:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg>'};
let workerRev=0,workerBusy=false,mediaBusy=false,activeKind='image';const workerQueue=[],mediaQueue=[];
function complete(item,data){item.output=data.bytes;item.note=data.note;item.extension=data.extension;item.url=URL.createObjectURL(new Blob([item.output],{type:data.mime||item.file.type||'application/octet-stream'}));item.status='done';}
function startWorker(){const rev=workerRev;worker=new Worker(new URL('./worker.js?v=5',import.meta.url),{type:'module'});worker.onmessage=({data})=>{if(rev!==workerRev)return;const item=items.find(x=>x.id===data.id);if(item){if(data.error){item.error=data.error;item.status='error';}else complete(item,data);}workerBusy=false;render();pump();};worker.onerror=()=>{if(rev!==workerRev)return;const item=items.find(x=>x.status==='working'&&!media(x.kind));if(item){item.status='error';item.error='Compression worker stopped. Reload the page and try a smaller file.';}workerBusy=false;worker.terminate();worker=null;workerQueue.length=0;for(const i of items.filter(x=>x.status==='queued'&&!media(x.kind))){i.status='error';i.error='Queue stopped. Please try again.';}render();};}
function pump(){if(refreshTimer)return;pumpWorker();pumpMedia();}
function pumpWorker(){if(workerBusy||!workerQueue.length)return;if(!worker)startWorker();const rev=workerRev;workerBusy=true;const item=workerQueue.shift();item.status='working';item.stage='';render();item.file.arrayBuffer().then(buffer=>{if(rev!==workerRev)return;worker.postMessage({id:item.id,buffer,options:item.options},[buffer]);}).catch(e=>{if(rev!==workerRev)return;item.error=e.message;item.status='error';workerBusy=false;render();pump();});}
async function pumpMedia(){if(mediaBusy||!mediaQueue.length)return;mediaBusy=true;const item=mediaQueue.shift(),run=item.run;item.status='working';item.stage='';render();try{const compress=await KINDS[item.kind].media(),input=new Uint8Array(await item.file.arrayBuffer());const result=await compress(input,item.file.name,item.options,({stage})=>{if(item.run===run&&item.stage!==stage){item.stage=stage;render();}});if(item.run===run){if(result.bytes.length>=item.file.size&&result.extension===extOf(item.file.name))complete(item,{bytes:new Uint8Array(await item.file.arrayBuffer()),extension:result.extension,mime:item.file.type,note:'Already small · original kept'});else complete(item,result);}}catch(e){if(item.run===run){item.error=e.message;item.status='error';}}mediaBusy=false;render();pump();}
function readOptions(kind='image'){
  if(kind==='glb')return {kind,textureSize:Number($('glb-tex').value),quality:Number($('glb-quality').value),meshQuality:$('glb-mesh').value};
  if(kind==='video')return {kind,mode:$('video-mode').value,container:$('video-container').value,codec:$('video-codec').value,level:Number($('video-level').value),maxSize:Number($('video-size').value),fps:Number($('video-fps').value),mute:$('video-mute').checked};
  if(kind==='audio')return {kind,audioFormat:$('audio-format').value,bitrate:Number($('audio-bitrate').value),mono:$('audio-mono').checked};
  return {kind,format:$('format').value,quality:Number($('quality').value),maxWidth:$('resize').checked?(Number($('max-width').value)||0):0,maxHeight:$('resize').checked?(Number($('max-height').value)||0):0,background:$('background').value,firstFrame:$('first-frame').checked,effort:$('effort').value,stripComments:$('comments').checked};
}
function validSettings(){return !$('resize').checked||!['png','jpeg','webp-lossy'].includes($('format').value)||($('max-width').checkValidity()&&$('max-height').checkValidity());}
function enqueue(item){item.run=(item.run||0)+1;item.status='queued';(media(item.kind)?mediaQueue:workerQueue).push(item);}
function refreshConversions(kind='image'){
  clearTimeout(refreshTimer);refreshTimer=null;
  const targets=items.filter(i=>i.kind===kind);if(!targets.length)return;
  const valid=kind!=='image'||validSettings();
  // Only the worker lane can be cancelled; audio and video results from a superseded run are ignored via item.run.
  if(!media(kind)&&targets.some(i=>i.status==='working')){workerRev++;worker?.terminate();worker=null;workerBusy=false;}
  for(const q of [workerQueue,mediaQueue])for(let i=q.length-1;i>=0;i--)if(q[i].kind===kind)q.splice(i,1);
  for(const item of targets){
    if(item.url)URL.revokeObjectURL(item.url);
    delete item.url;delete item.output;delete item.extension;delete item.note;delete item.error;delete item.stage;
    item.options=readOptions(kind);
    if(valid)enqueue(item);else{item.run=(item.run||0)+1;item.status='error';item.error='Enter valid resize limits to continue.';}
  }
  $('notice').textContent=valid?'Settings changed. Updating your files…':'Resize limits must be whole numbers from 1 to 16383.';
  render();
  if(valid)refreshTimer=setTimeout(()=>{refreshTimer=null;$('notice').textContent='';pump();},400);
}
function add(files){
  $('notice').textContent='';
  let firstKind=null;
  for(const file of files){
    if(items.length>=50){$('notice').textContent='Batch limit: 50 files. Clear finished files to add more.';break;}
    const kind=kindOf(file);
    if(kind==='image'&&!validSettings()){$('notice').textContent='Resize limits must be whole numbers from 1 to 16383.';continue;}
    if(!kind){$('notice').textContent='Unsupported file. Choose an image, a .glb 3D model, an audio file or a video.';continue;}
    if(file.size>KINDS[kind].limit*1048576){$('notice').textContent=`${file.name} is over the ${KINDS[kind].limit} MB limit.`;continue;}
    firstKind??=kind;
    const item={id:++sequence,file,kind,status:'queued',preview:kind==='image'?URL.createObjectURL(file):null,options:readOptions(kind)};items.push(item);enqueue(item);
  }
  if(firstKind&&firstKind!==activeKind)setKind(firstKind);
  render();pump();
}
function setKind(kind){
  activeKind=kind;
  for(const tab of document.querySelectorAll('.kind')){const on=tab.dataset.kind===kind;tab.setAttribute('aria-selected',on);tab.tabIndex=on?0:-1;}
  for(const panel of document.querySelectorAll('.kind-panel'))panel.hidden=panel.dataset.kind!==kind;
  $('drop-verb').textContent=KINDS[kind].verb;$('drop-formats').textContent=KINDS[kind].formats;$('files').accept=KINDS[kind].accept;
}
function render(){const list=$('list');list.replaceChildren();$('results').hidden=!items.length;let before=0,after=0,completed=0;for(const item of items){const row=document.createElement('div');row.className='row';let img;if(item.preview){img=document.createElement('img');img.className='thumb';img.alt='';img.src=item.preview;}else{img=document.createElement('div');img.className='thumb thumb-icon';img.setAttribute('aria-hidden','true');img.innerHTML=ICONS[item.kind]||'';}const info=document.createElement('div'),name=document.createElement('span'),detail=document.createElement('small'),numbers=document.createElement('small');name.className='filename';name.textContent=item.file.name;detail.textContent=item.status==='done'?item.note:item.status==='error'?item.error:item.status==='working'?(item.stage||'Processing on your device…'):'Waiting…';numbers.className='size';numbers.textContent=size(item.file.size);if(item.output){completed++;before+=item.file.size;after+=item.output.length;numbers.textContent+=` → ${size(item.output.length)} · ${(Math.abs(1-item.output.length/item.file.size)*100).toFixed(1)}% ${item.output.length<=item.file.size?'smaller':'larger'}`;}info.append(name,numbers,detail);row.append(img,info);if(item.url){const a=document.createElement('a');a.href=item.url;a.download=outputName(item.file.name,item.extension);a.textContent='Download ↓';row.append(a);}list.append(row);}$('count').textContent=`(${items.length})`;$('saved').textContent=`${size(Math.abs(before-after))} ${after<=before?'saved':'added'}`;$('total').textContent=`${completed} of ${items.length} finished${before?` · ${(Math.abs(1-after/before)*100).toFixed(1)}% ${after<=before?'smaller':'larger'} overall`:''}`;$('download').disabled=!completed;}
function outputName(name,extension){return extension?name.replace(/\.[^.]+$/,'')+'.'+extension:name;}
// ZIP STORE avoids recompressing already compressed images; CRC and directory records keep the archive portable.
function zip(files){const parts=[],central=[];let offset=0;for(const item of files){const name=new TextEncoder().encode(outputName(item.file.name,item.extension)),data=item.output,crc=crc32(data),local=new Uint8Array(30+name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);local.set(name,30);const c=new Uint8Array(46+name.length),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);c.set(name,46);parts.push(local,data);central.push(c);offset+=local.length+data.length;}const directory=join(central),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,directory.length,true);ev.setUint32(16,offset,true);return new Blob([...parts,directory,end],{type:'application/zip'});}
$('browse').onclick=()=>$('files').click();$('files').onchange=e=>{add(e.target.files);e.target.value='';};for(const type of ['dragenter','dragover'])$('drop').addEventListener(type,e=>{e.preventDefault();$('drop').classList.add('over');});$('drop').ondragleave=()=>$('drop').classList.remove('over');$('drop').ondrop=e=>{e.preventDefault();$('drop').classList.remove('over');add(e.dataTransfer.files);};window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());$('clear').onclick=()=>{for(let i=items.length-1;i>=0;i--)if(['done','error'].includes(items[i].status)){if(items[i].preview)URL.revokeObjectURL(items[i].preview);if(items[i].url)URL.revokeObjectURL(items[i].url);items.splice(i,1);}render();};$('download').onclick=()=>{const url=URL.createObjectURL(zip(items.filter(i=>i.output))),a=document.createElement('a');a.href=url;a.download='shrinkwrap-files.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
if(!window.CompressionStream||!window.DecompressionStream||!window.Worker){$('notice').textContent='This browser does not support local compression. Please use a current version of Chrome, Edge, Firefox, or Safari.';$('browse').disabled=true;}else startWorker();

function updateOptions(){const f=$('format').value,conversion=['png','jpeg','webp-lossy'].includes(f);$('convert-options').hidden=!conversion;$('conversion-note').hidden=f==='original';$('conversion-note').textContent=conversion?'Format conversion uses browser-decoded pixels. Metadata and color profiles are not copied; resizing and JPEG / standard WebP export can change pixels. PNG export does not restore detail lost in a source JPEG. Animated images require first-frame consent.':'PNG → WebP: pixels and transparency are verified lossless. Metadata is not copied. Some files may be larger. 16-bit, animated, interlaced, and custom-profile PNGs are not supported.';$('comments').disabled=f!=='original';$('effort').disabled=conversion;$('quality').disabled=f==='png';$('background-label').hidden=f!=='jpeg';}
$('format').onchange=()=>{updateOptions();refreshConversions();};$('quality').oninput=()=>{$('quality-value').textContent=$('quality').value+'%';refreshConversions();};for(const id of ['max-width','max-height','background'])$(id).addEventListener('input',refreshConversions);for(const id of ['effort','comments','first-frame'])$(id).addEventListener('change',refreshConversions);updateOptions();

function updateResize(){const enabled=$('resize').checked;for(const id of ['max-width','max-height'])$(id).disabled=!enabled;$('size-note').textContent=enabled?'Aspect ratio locked · fits within your limits · no stretching, cropping, or enlargement.':'Original width, height, and aspect ratio are preserved.';}
$('resize').onchange=()=>{updateResize();refreshConversions();};updateResize();

// Whole drop zone opens the picker; paste (⌘V / Ctrl+V) adds clipboard images.
$('drop').addEventListener('click',e=>{if(!e.target.closest('button')&&!$('browse').disabled)$('files').click();});$('drop').addEventListener('keydown',e=>{if(e.target===$('drop')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();$('files').click();}});
window.addEventListener('paste',e=>{if(e.target.closest&&e.target.closest('input,select,textarea'))return;const files=[...(e.clipboardData?.files||[])].filter(f=>f.type.startsWith('image/')).map((f,i)=>KINDS.image.test(f)?f:new File([f],`pasted-${Date.now()}-${i}.${(f.type.split('/')[1]||'png').replace('jpeg','jpg')}`,{type:f.type}));if(files.length){e.preventDefault();add(files);}});

// Goal presets drive the advanced format/quality controls; manual changes in Advanced update the selected goal.
const goals={original:{format:'original'},web:{format:'webp-lossy',quality:80},jpeg:{format:'jpeg',quality:85},png:{format:'png'}};
for(const radio of document.querySelectorAll('input[name=goal]'))radio.addEventListener('change',()=>{const g=goals[radio.value];$('format').value=g.format;if(g.quality){$('quality').value=g.quality;$('quality-value').textContent=g.quality+'%';}$('format').dispatchEvent(new Event('change'));});
$('format').addEventListener('change',()=>{const match=Object.entries(goals).find(([,g])=>g.format===$('format').value);for(const radio of document.querySelectorAll('input[name=goal]'))radio.checked=!!match&&radio.value===match[0];});

// Type tabs (arrow keys move between them, per the ARIA tabs pattern)
const tabs=[...document.querySelectorAll('.kind')];
for(const tab of tabs){tab.addEventListener('click',()=>setKind(tab.dataset.kind));tab.addEventListener('keydown',e=>{const i=tabs.indexOf(tab),to=e.key==='ArrowRight'?tabs[(i+1)%tabs.length]:e.key==='ArrowLeft'?tabs[(i+tabs.length-1)%tabs.length]:null;if(to){e.preventDefault();to.focus();setKind(to.dataset.kind);}});}

// Preset cards for 3D and audio: a card writes its values into the controls, and editing a control re-selects the matching card.
function bindGoals({kind,radioName,goals,apply,matches,controls,afterSync=()=>{}}){
  const radios=document.querySelectorAll(`input[name=${radioName}]`);
  const sync=()=>{const hit=Object.entries(goals).find(([,g])=>matches(g));for(const r of radios)r.checked=!!hit&&r.value===hit[0];afterSync();};
  for(const r of radios)r.addEventListener('change',()=>{apply(goals[r.value]);sync();refreshConversions(kind);});
  for(const id of controls)$(id).addEventListener('change',()=>{sync();refreshConversions(kind);});
  sync();
}
const pct=(input,output)=>{$(output).textContent=$(input).value+'%';};
bindGoals({kind:'glb',radioName:'goal-glb',controls:['glb-tex','glb-mesh','glb-quality'],
  goals:{web:{tex:2048,q:80,mesh:'balanced'},small:{tex:1024,q:70,mesh:'max'},quality:{tex:4096,q:90,mesh:'balanced'},mesh:{tex:0,q:100,mesh:'balanced'}},
  apply:g=>{$('glb-tex').value=String(g.tex);$('glb-quality').value=g.q;pct('glb-quality','glb-quality-value');$('glb-mesh').value=g.mesh;},
  matches:g=>String(g.tex)===$('glb-tex').value&&(g.tex===0||g.q===Number($('glb-quality').value))&&g.mesh===$('glb-mesh').value,
  afterSync:()=>{$('glb-quality').disabled=$('glb-tex').value==='0';}});
$('glb-quality').addEventListener('input',()=>pct('glb-quality','glb-quality-value'));
bindGoals({kind:'audio',radioName:'goal-audio',controls:['audio-format','audio-bitrate','audio-mono'],
  goals:{everywhere:{f:'mp3',b:128},smallest:{f:'opus',b:64},quality:{f:'aac',b:192},lossless:{f:'flac',b:128}},
  apply:g=>{$('audio-format').value=g.f;$('audio-bitrate').value=String(g.b);$('audio-mono').checked=false;},
  matches:g=>g.f===$('audio-format').value&&(g.f==='flac'||g.b===Number($('audio-bitrate').value))&&!$('audio-mono').checked,
  afterSync:()=>{$('audio-bitrate').disabled=$('audio-format').value==='flac';}});
// Video: the codec list depends on format and mode; codecs with no lossy setting (and copying streams) disable quality and resizing.
function updateVideoCodecs(preferred=$('video-codec').value){
  const choice=$('video-container').value,mode=$('video-mode').value,list=vf.codecsFor(choice,mode);
  $('video-codec').replaceChildren(...list.map(c=>new Option(vf.CODECS[c].name,c)));
  if(list.includes(preferred))$('video-codec').value=preferred;
  $('video-level').disabled=mode==='lossless';for(const id of ['video-size','video-fps'])$(id).disabled=$('video-codec').value==='copy';
  $('video-mute').disabled=choice==='webp';
}
for(const id of ['video-mode','video-container','video-codec'])$(id).addEventListener('change',()=>updateVideoCodecs());
updateVideoCodecs();
bindGoals({kind:'video',radioName:'goal-video',controls:['video-mode','video-container','video-codec','video-level','video-size','video-fps','video-mute'],
  goals:{everywhere:{m:'lossy',c:'mp4',v:'h264',s:0},smallest:{m:'lossy',c:'mp4',v:'h264',s:720,l:3},web:{m:'lossy',c:'webm',v:'vp8',s:0},lossless:{m:'lossless',c:'same',v:'copy',s:0}},
  apply:g=>{$('video-mode').value=g.m;$('video-container').value=g.c;updateVideoCodecs(g.v);$('video-level').value=String(g.l??1);$('video-size').value=String(g.s);$('video-fps').value='0';$('video-mute').checked=false;},
  matches:g=>g.m===$('video-mode').value&&g.c===$('video-container').value&&g.v===$('video-codec').value&&String(g.s)===$('video-size').value&&$('video-fps').value==='0'&&!$('video-mute').checked&&(g.m==='lossless'||$('video-level').value===String(g.l??1))});
setKind('image');
