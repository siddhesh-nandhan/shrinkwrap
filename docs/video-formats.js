// Video containers and codecs the bundled ffmpeg.wasm build can write. Kept free of ffmpeg imports so the UI can read it cheaply.
// libx265 deadlocks and libvpx-vp9 / libtheora crash in this single-threaded build, so H.265, VP9 and Theora are not offered.
import {extOf} from './engine.js';
// Lossy quality levels: 0 high, 1 balanced, 2 small, 3 smallest.
export const CODECS={
  copy:{name:'Original streams · no re-encode',lossless:()=>['-c:v','copy']},
  h264:{name:'H.264',lossy:l=>['-c:v','libx264','-preset','veryfast','-crf',String([20,24,28,32][l]),'-pix_fmt','yuv420p'],lossless:()=>['-c:v','libx264','-preset','veryfast','-qp','0']},
  vp8:{name:'VP8',lossy:l=>['-c:v','libvpx','-crf',String([8,16,26,36][l]),'-b:v','10M','-deadline','realtime','-cpu-used','8']},
  ffv1:{name:'FFV1 · archival',lossless:()=>['-c:v','ffv1','-level','3']},
  webp:{name:'Animated WebP',lossy:l=>['-c:v','libwebp_anim','-quality',String([85,75,60,45][l]),'-loop','0'],lossless:()=>['-c:v','libwebp_anim','-lossless','1','-loop','0']}
};
const AAC=['-c:a','aac','-b:a','128k'],OPUS=['-c:a','libopus','-b:a','96k','-compression_level','4'];
const MPEG4={lossy:['h264'],lossless:['copy','h264'],audio:AAC,fallbackAudio:['-c:a','alac'],extra:['-movflags','+faststart']};
// Each codec list is in preference order; lossless falls through it when a codec cannot hold the input.
export const CONTAINERS={
  mp4:{name:'MP4',ext:'mp4',mime:'video/mp4',...MPEG4},
  mov:{name:'MOV',ext:'mov',mime:'video/quicktime',...MPEG4},
  mkv:{name:'MKV',ext:'mkv',mime:'video/x-matroska',lossy:['h264','vp8'],lossless:['copy','h264','ffv1'],audio:AAC,fallbackAudio:['-c:a','flac']},
  webm:{name:'WebM',ext:'webm',mime:'video/webm',lossy:['vp8'],lossless:['copy'],audio:OPUS,fallbackAudio:OPUS},
  webp:{name:'Animated WebP',ext:'webp',mime:'image/webp',lossy:['webp'],lossless:['webp'],audio:null}
};
const SAME={mp4:'mp4',m4v:'mp4',mov:'mov',mkv:'mkv',webm:'webm'};
export const containerFor=(choice,fileName)=>choice==='same'?SAME[extOf(fileName)]||'mp4':choice;
// "same" offers every codec its possible containers allow; video.js narrows that to the container each file resolves to.
export const codecsFor=(choice,mode)=>choice==='same'?[...new Set(Object.values(SAME).flatMap(c=>CONTAINERS[c][mode]))]:CONTAINERS[choice][mode];
