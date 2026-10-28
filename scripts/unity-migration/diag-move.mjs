// M-U2a 诊断：最小场景单步探针
import { readFileSync } from 'node:fs';
const mod = await WebAssembly.instantiate(readFileSync('public/wasm/wbcore.wasm'), {});
const ex = mod.instance.exports, mem = ex.memory;
const W = 256, H = 160, TILES = 40960, MAX_UNITS = 4096;
const ID = { UX:0,UY:1,UCIV:4,URACE:5,UID:6,UCELL:7,UDEAD:14,UTX:18,UTY:19,UHP:20,UMAXHP:21,UDMG:22,USPEED:23,UAGE:24,UMAXAGE:25,UCD:27,UFD:28,UBREATH:29,USTK:34,UATK:35,UCHILL:36,UFLEET:37,UBLESS:38,UCURSE:39,UFERT:40,UDETOUR:41,UHURT:42,UJOB:43,UINF:45,UFLIP:46,UPAR:47,UBOAT:48,UCVN:50,UARMY:51,UGENE:53,UFAM:54,UFGN:55,UGLN:57,TERR:60,FIREG:61,RAD:62,ROAD:63,BLDK:64,ITMN:90,NCTL:94,RNGS:95,TICK:96,PAR:98,EPS:100,LAWS:101,FXP:102,ACT:120,ACTN:121,BAILK:122,DIRTY:126,DLIST:127,DLISTN:128,BATCHR:129,TBT:139,TBF:131,COLEN:142,MISC:148 };
const F_NAN = NaN;
const setU8=(id,i,v)=>{new Uint8Array(mem.buffer,ex.wb_arena_ptr()+ex.wb_off(id))[i]=v&0xff};
const setU32=(id,i,v)=>{new DataView(mem.buffer).setUint32(ex.wb_arena_ptr()+ex.wb_off(id)+i*4,v>>>0,true)};
const setI32=(id,i,v)=>{new DataView(mem.buffer).setInt32(ex.wb_arena_ptr()+ex.wb_off(id)+i*4,v|0,true)};
const setF64=(id,i,v)=>{new DataView(mem.buffer).setFloat64(ex.wb_arena_ptr()+ex.wb_off(id)+i*8,v,true)};
const getF64=(id,i)=>new DataView(mem.buffer).getFloat64(ex.wb_arena_ptr()+ex.wb_off(id)+i*8,true);
const getU32=(id,i)=>new DataView(mem.buffer).getUint32(ex.wb_arena_ptr()+ex.wb_off(id)+i*4,true);
const getU8=(id,i)=>new Uint8Array(mem.buffer,ex.wb_arena_ptr()+ex.wb_off(id))[i];

console.log('init rc =', ex.wb_init(W,H,MAX_UNITS));
setU32(ID.RNGS,0,0x12345678); setU8(ID.LAWS,0,0); setU8(ID.FXP,0,0);
setU32(ID.ITMN,0,0); setU8(ID.COLEN,0,0); setU8(ID.NCTL,0,0); setI32(ID.MISC,0,MAX_UNITS);
const terr = new Uint8Array(mem.buffer, ex.wb_arena_ptr()+ex.wb_off(ID.TERR), TILES); terr.fill(3);
// TBT 引导表（bit0 walkable bit1 water bit2 flammable bit3 buildable）
const tbt = new Uint8Array(mem.buffer, ex.wb_arena_ptr()+ex.wb_off(ID.TBT), 16);
for (let t=0;t<12;t++){let m=0;if(t!==0&&t!==1&&t!==6&&t!==8)m|=1;if(t===0||t===1)m|=2;if(t===3||t===4)m|=4;if(t===3||t===2||t===5||t===7||t===9||t===4)m|=8;tbt[t]=m;}
setU8(11,6,16); setU8(ID.TBF,12,0); setU8(ID.TBF,13,0);   // sheep herbivore
setU32(ID.UID,0,0); setU32(ID.URACE,0,6); setU32(ID.UCELL,0,10*W+10);
setF64(ID.UX,0,10.5); setF64(ID.UY,0,10.5); setF64(ID.UTX,0,20.5); setF64(ID.UTY,0,14.5);
setF64(ID.USPEED,0,0.08); setF64(ID.UHP,0,100); setF64(ID.UMAXHP,0,100);
setF64(ID.UMAXAGE,0,9999); setF64(ID.UAGE,0,0); setF64(ID.UDMG,0,5);
setF64(ID.UFD,0,F_NAN); setI32(ID.UCIV,0,-1); setI32(ID.UJOB,0,-1); setI32(ID.UARMY,0,-1);
setI32(ID.UGLN,0,-1); setI32(ID.UFAM,0,-1); setI32(ID.UFGN,0,-1);
setU8(ID.UPAR,0,getU8(ID.PAR,0));
console.log('PAR=',getU8(ID.PAR,0),'UPAR=',getU8(ID.UPAR,0));
ex.wb_pack_end(1);
console.log('pre : x=',getF64(ID.UX,0),'age=',getF64(ID.UAGE,0),'rng=',getU32(ID.RNGS,0).toString(16),'actN=',getU32(ID.ACTN,0));
const rc = ex.wb_units_batch(0,0);
console.log('rc=',rc,'batchR=',getU32(ID.BATCHR,0),'bailK=',getU32(ID.BAILK,0));
console.log("post: x=",getF64(ID.UX,0),"age=",getF64(ID.UAGE,0),"dead=",getU8(ID.UDEAD,0),"rng=",getU32(ID.RNGS,0).toString(16),"actN=",getU32(ID.ACTN,0),"dlistN=",getU32(ID.DLISTN,0),"tx=",getF64(ID.UTX,0));
console.log('act hex=',Buffer.from(mem.buffer, ex.wb_arena_ptr()+ex.wb_off(ID.ACT), Math.min(getU32(ID.ACTN,0),96)).toString('hex'));
