// Font conversion and compression with fonteditor-core and Google's woff2, bundled in ./vendor/font (runs in the compression worker).
// Format changes work on the raw sfnt tables, so every table survives. Subsetting, hinting removal and SVG fonts need a full
// rebuild, which keeps outlines, metrics and kerning but drops OpenType layout tables such as GSUB.
import {createFont,tables,initWoff2} from './vendor/font/font.bundle.js?v=2';

export const FORMATS={
  woff2:{ext:'woff2',mime:'font/woff2',name:'WOFF2'},
  woff:{ext:'woff',mime:'font/woff',name:'WOFF'},
  ttf:{ext:'ttf',mime:'font/ttf',name:'TTF'},
  eot:{ext:'eot',mime:'application/vnd.ms-fontobject',name:'EOT'},
  svg:{ext:'svg',mime:'image/svg+xml',name:'SVG font'}
};
// Character sets for subsetting, as inclusive code point ranges.
const SETS={
  latin:[[0x20,0x7e],[0xa0,0xff],[0x131,0x131],[0x152,0x153],[0x2c6,0x2c6],[0x2da,0x2da],[0x2dc,0x2dc],[0x2000,0x206f],[0x20ac,0x20ac],[0x2122,0x2122],[0x2212,0x2212]],
  'latin-ext':[[0x20,0x24f],[0x1e00,0x1eff],[0x2000,0x206f],[0x20a0,0x20cf],[0x2100,0x214f],[0x2212,0x2212]]
};
const codePoints=(set,text)=>set==='custom'?[...new Set([...text].map(ch=>ch.codePointAt(0)))]:SETS[set].flatMap(([a,b])=>Array.from({length:b-a+1},(_,i)=>a+i));
const tag=bytes=>String.fromCharCode(...bytes.subarray(0,4));
const buf=bytes=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const u8=data=>typeof data==='string'?new TextEncoder().encode(data):new Uint8Array(data);

// Detects the input format from its first bytes rather than trusting the file name.
export function sniff(bytes){
  const t=tag(bytes);
  if(t==='wOF2')return 'woff2';if(t==='wOFF')return 'woff';if(t==='OTTO')return 'otf';if(t==='\0\x01\0\0'||t==='true')return 'ttf';
  if(t==='ttcf')throw Error('Font collections (.ttc / .otc) are not supported. Export the single font you need first.');
  if(bytes.length>36&&bytes[34]===0x4c&&bytes[35]===0x50)return 'eot';
  if(/<font[\s>]/.test(new TextDecoder().decode(bytes.subarray(0,1<<16))))return 'svg';
  throw Error('This is not a TTF, OTF, WOFF, WOFF2, EOT or SVG font.');
}

export async function compressFont(bytes,{fontFormat='woff2',subset='none',customText='',hinting=true}={}){
  const type=sniff(bytes),target=fontFormat==='same'?(type==='otf'?'ttf':type):fontFormat,out=FORMATS[target];
  if(!out)throw Error('Unsupported font output format.');
  if([type,target].includes('woff2'))await initWoff2(new URL('./vendor/font/woff2.wasm',import.meta.url).href);
  const glyphs=subset==='none'?null:codePoints(subset,customText);
  if(glyphs&&!glyphs.length)throw Error('Enter the characters to keep.');
  let sfnt,encoded;
  try{sfnt=type==='svg'?u8(createFont(new TextDecoder().decode(bytes),{type:'svg'}).write({type:'ttf'})):type==='woff'?u8(tables.woff2ttf(buf(bytes))):type==='woff2'?tables.woff2Decode(bytes):type==='eot'?u8(tables.eot2ttf(buf(bytes))):bytes;}
  catch{throw Error('This font could not be read. It may be damaged.');}
  const cff=tag(sfnt)==='OTTO',rebuild=!!glyphs||!hinting||type==='svg'||target==='svg';
  const notes=[`${type.toUpperCase()} → ${target==='ttf'&&cff&&!rebuild?'OTF':out.name}`];
  if(rebuild){
    let font;
    try{font=createFont(buf(sfnt),{type:cff?'otf':'ttf',hinting,kerning:true,compound2simple:false,...(glyphs?{subset:glyphs}:{})});}
    catch{throw Error('This font could not be rebuilt. Try converting it without subsetting or hinting removal.');}
    const count=font.get().glyf.length-1;
    if(glyphs&&count<1)throw Error('None of the chosen characters are in this font.');
    if(target==='svg')return {bytes:u8(font.write({type:'svg'})),extension:'svg',mime:out.mime,note:[...notes,glyphs?`${count} glyphs kept`:'all glyphs','for legacy iOS / tools only'].join(' · ')};
    sfnt=u8(font.write({type:'ttf',hinting,kerning:true}));
    // Google's WOFF2 encoder rejects the hinting fonteditor writes back, so rebuilt WOFF2 fonts drop it instead of failing.
    if(target==='woff2'&&hinting&&!(encoded=tables.woff2Encode(sfnt)).length){hinting=false;encoded=null;sfnt=u8(font.write({type:'ttf',hinting:false,kerning:true}));}
    notes.push(glyphs?`${count} glyphs kept`:'all glyphs',...(hinting?[]:['hinting removed']),...(cff?['CFF outlines converted to TrueType']:[]),...(type==='svg'?[]:['ligatures and other OpenType features removed']));
  }else notes.push('every table kept · lossless');
  encoded??=target==='woff2'?tables.woff2Encode(sfnt):target==='woff'?u8(tables.ttf2woff(buf(sfnt))):target==='eot'?u8(tables.ttf2eot(buf(sfnt))):sfnt;
  if(!encoded?.length)throw Error(`This font could not be written as ${out.name}.`);
  return {bytes:encoded,extension:target==='ttf'&&cff&&!rebuild?'otf':out.ext,mime:target==='ttf'&&cff&&!rebuild?'font/otf':out.mime,note:notes.join(' · ')};
}
