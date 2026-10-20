import {speedSettings} from './speed-profile.js';
import {chaseOptions,buildChaseTracks,sampleTrack} from './chase.js';
export const CHECKPOINT='9a45713d3f392f7762758b27535e8057f271035880f00bbd99197efcde878bc0';
export const SIDECAR='64b87d339dfc48ed3bd5ef2ab9864f0d91038a1bd5fffc85474c7ff8a9812b5e';
export const OBSTACLE_TYPES={rock:{label:'山脊',size:[560,560,1800]},building:{label:'建筑',size:[500,500,1700]},airship:{label:'飞艇',size:[600,300,230],air:true},wall:{label:'岩壁',size:[220,1900,1500]},tower:{label:'通信塔',size:[220,220,1300]},windmill:{label:'风力机',size:[300,900,1500]},trees:{label:'树林',size:[800,1000,550]},balloon:{label:'热气球',size:[350,350,550],air:true},crane:{label:'起重机',size:[800,220,1200]}};
export const isAirObstacle=o=>!!OBSTACLE_TYPES[o.kind]?.air;
export const clone=x=>JSON.parse(JSON.stringify(x));
export const norm=v=>Math.hypot(...v),sub=(a,b)=>a.map((x,i)=>x-b[i]),mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
export function smoothRoute(points,steps=24){
 const p=points.filter((v,i)=>!i||norm(sub(v,points[i-1]))>.01),positions=[],controlSegments=[];
 if(p.length<2)throw Error('至少需要两个不同的航路点');
 const tangent=p.map((v,i)=>{const d=sub(p[Math.min(p.length-1,i+1)],p[Math.max(0,i-1)]),s=i===0||i===p.length-1?norm(d):norm(sub(v,p[i-1]))+norm(sub(p[i+1],v));return d.map(x=>x/(s||1));});
 for(let i=0;i<p.length-1;i++){const d=norm(sub(p[i+1],p[i]));for(let j=0;j<steps;j++){const t=j/steps,a=2*t**3-3*t*t+1,b=t**3-2*t*t+t,c=-2*t**3+3*t*t,e=t**3-t*t;positions.push(p[i].map((v,k)=>a*v+b*d*tangent[i][k]+c*p[i+1][k]+e*d*tangent[i+1][k]));controlSegments.push(i);}}
 positions.push(p.at(-1));controlSegments.push(p.length-2);return {positions,controlSegments};
}
export function previewTrace(points,speed=240){
 const {positions}=smoothRoute(points,40),time=[0];for(let i=1;i<positions.length;i++)time.push(time[i-1]+norm(sub(positions[i],positions[i-1]))/speed);
 return {position:positions,reference:positions,time,hprv:positions.map((p,i)=>{const d=sub(positions[Math.min(i+1,positions.length-1)],positions[Math.max(i-1,0)]);return [Math.atan2(d[1],d[0]),Math.atan2(d[2],Math.hypot(d[0],d[1])),0,speed];}),synthetic_flight_samples:true};
}
export function validateProject(p){
 if(p.schema!=='a4.obstacle.scene.v1')throw Error('不是飞行器实验平台项目文件');
 const vec=v=>Array.isArray(v)&&v.length===3&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<1e6);
 if(!Array.isArray(p.points)||p.points.length<2||p.points.length>200||!p.points.every(vec))throw Error('航路点必须是 2–200 个有效的 N/E/H 坐标');
 if(!Array.isArray(p.obstacles)||p.obstacles.length>100||!p.obstacles.every(o=>Object.hasOwn(OBSTACLE_TYPES,o.kind)&&vec(o.position)&&vec(o.size)&&o.size.every(x=>x>0&&x<30000)&&vec(o.velocity)&&typeof o.name==='string'&&o.name.length<120))throw Error('障碍物尺寸、位置或速度无效');
 p=clone(p);Object.assign(p,speedSettings(p));if(p.chase)p.chase=chaseOptions(p.chase);p.obstacles.forEach((o,i)=>o.id='ob_'+i);p.name=String(p.name||'我的场景').slice(0,100);return p;
}
export function validateTrace(t){
 const finite=v=>Array.isArray(v)&&v.every(Number.isFinite);
 if(!t||!Array.isArray(t.position)||t.position.length<2||t.position.length>100000||t.position.length!==t.time?.length||t.position.length!==t.hprv?.length||!t.position.every(p=>finite(p)&&p.length===3)||!t.hprv.every(p=>finite(p)&&p.length===4)||!finite(t.time)||t.time.some((x,i)=>i&&x<=t.time[i-1]))throw Error('飞行记录不完整或含非法坐标');return t;
}
export const obstacleAt=(o,t)=>o.position.map((x,i)=>x+o.velocity[i]*t);
// Continuous segment/slab intersection against the visible obstacle bounding box.
// This is a scene-layout check of the centreline, not a dynamics/collision model.
export function segmentBox(a,b,half){let lo=0,hi=1;for(let k=0;k<3;k++){const d=b[k]-a[k];if(Math.abs(d)<1e-12){if(Math.abs(a[k])>half[k])return false;}else{let x=(-half[k]-a[k])/d,y=(half[k]-a[k])/d;if(x>y)[x,y]=[y,x];lo=Math.max(lo,x);hi=Math.min(hi,y);if(lo>hi)return false;}}return true;}
export function encounters(trace,obstacles){return obstacles.map(o=>{let distance=Infinity,index=0,intersects=false;for(let i=0;i<trace.position.length;i++){const p=sub(trace.position[i],obstacleAt(o,trace.time[i])),d=norm(p.map((x,k)=>Math.max(0,Math.abs(x)-o.size[k]/2)));if(d<distance){distance=d;index=i;}if(i&&segmentBox(sub(trace.position[i-1],obstacleAt(o,trace.time[i-1])),p,o.size.map(x=>x/2)))intersects=true;}return {id:o.id,name:o.name,distance,index,time:trace.time[index],intersects};}).sort((a,b)=>a.time-b.time);}
export function sandbox(){return {schema:'a4.obstacle.scene.v1',name:'山谷绕行 · 自定义场景',caseId:null,points:[[0,0,5000],[1800,0,5000],[3600,1050,5350],[5500,1100,5450],[7400,-800,5100],[10000,-600,5000],[12000,0,5000]],obstacles:[{id:'ob_0',kind:'rock',name:'01 山脊 · 侧向绕行',position:[4400,0,4300],size:[1300,1500,2600],velocity:[0,0,0]},{id:'ob_1',kind:'airship',name:'02 慢速飞艇 · 高度错开',position:[7900,0,5150],size:[600,350,300],velocity:[0,5,0]}]};}
export function seedScene(trace,record){
 const points=trace.reference.filter((_,i)=>i%Math.ceil(trace.reference.length/14)===0).map(p=>[...p]);if(norm(sub(points.at(-1),trace.reference.at(-1)))>1)points.push([...trace.reference.at(-1)]);
 const ground=Math.min(...trace.position.map(p=>p[2]))-1800;const obstacles=[];for(const [j,f]of [.32,.68].entries()){const i=Math.floor(trace.position.length*f),p=trace.position[i],d=sub(trace.position[Math.min(i+5,trace.position.length-1)],trace.position[Math.max(i-5,0)]),h=Math.hypot(d[0],d[1])||1;let best;
 // Place scenery beside an existing turn; never move any flight state.
 for(const offset of [430,600,800,1100])for(const sign of [1,-1]){const c=[p[0]-sign*d[1]/h*offset,p[1]+sign*d[0]/h*offset,p[2]-100];const size=j?[600,420,250]:[560,560,p[2]+250-ground],o={id:'ob_'+j,kind:j?'airship':'rock',name:j?'02 慢速空中单位':'01 山脊转折',position:j?c:[c[0],c[1],(ground+p[2]+250)/2],size,velocity:j?[2,3,0]:[0,0,0]};const e=encounters(trace,[o])[0];const score=(e.intersects?1e6:0)+Math.abs(e.distance-120);if(!best||score<best.score)best={o,distance:e.distance,score};}obstacles.push(best.o);}
 return {schema:'a4.obstacle.scene.v1',name:record.name+' · 障碍情境',caseId:record.id,points,obstacles};
}
const enc=new TextEncoder();let crcTable;function crc32(bytes){crcTable??=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
export function zipFiles(files){let offset=0;const locals=[],directory=[];for(const [path,content]of Object.entries(files)){const name=enc.encode(path),data=typeof content==='string'?enc.encode(content):content,crc=crc32(data),head=new Uint8Array(30+name.length),v=new DataView(head.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);head.set(name,30);locals.push(head,data);const c=new Uint8Array(46+name.length),w=new DataView(c.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);w.setUint32(16,crc,true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);c.set(name,46);directory.push(c);offset+=head.length+data.length;}
 const end=new Uint8Array(22),v=new DataView(end.buffer),count=directory.length,len=directory.reduce((a,b)=>a+b.length,0);v.setUint32(0,0x06054b50,true);v.setUint16(8,count,true);v.setUint16(10,count,true);v.setUint32(12,len,true);v.setUint32(16,offset,true);return new Blob([...locals,...directory,end],{type:'application/zip'});}
export function download(content,name,type='application/json'){const url=URL.createObjectURL(content instanceof Blob?content:new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
const clean=s=>String(s).replace(/[\r\n,|=]/g,' ').slice(0,100);
export function tacviewScene(project,trace,mode,original='',prefix='A4Scene',solidOnly=false){
 if(!['archive','computed'].includes(mode)||trace?.synthetic_flight_samples!==false)throw Error('尚无 9a 学生实际飞行记录，请先计算飞行或打开真实记录；参考动画不能导出为学生场景。');
 validateTrace(trace);
 if(mode==='archive'&&!original)throw Error('原始飞行 ACMI 缺失，请重新载入记录。');
 // Original archived coordinates use a spherical Earth; browser runtime uses 111320 m/deg.
 const metresPerDegree=mode==='archive'?Math.PI*6371000/180:111320;
 const transform=(p,h=[0,0,0])=>[p[1]/metresPerDegree,p[0]/metresPerDegree,p[2],h[2]*180/Math.PI,h[1]*180/Math.PI,h[0]*180/Math.PI].map(x=>x.toFixed(9)).join('|');
 const pursuers=buildChaseTracks(trace,project.chase);const metadata='0,Briefing='+clean(mode==='archive'?'9a 原始记录；障碍物为后置展示场景':mode==='computed'?'浏览器 FP32 9a 路线跟踪；障碍物未输入控制器':'参考路线几何动画；不是 9a 实飞')+'\n';
 const obs=(t,initial)=>project.obstacles.map((o,i)=>{
  const air=isAirObstacle(o)&&!solidOnly,p=obstacleAt(o,t);if(!air)p[2]-=o.size[2]/2;
  const kind=air?'Air':(o.velocity.some(x=>x)?'Ground+Building':'Ground+Static+Building');
  return (0xc9000+i).toString(16)+',T='+transform(p)+(initial?',Type='+kind+',Name='+prefix+'_'+i+(solidOnly?'_VOLUME':'')+',CallSign='+clean(o.name)+',Label='+clean(o.name)+(!solidOnly?',Shape='+prefix+'_'+i+'.obj':'')+',Length='+o.size[0]+',Width='+o.size[1]+',Height='+o.size[2]+',Visible=1,Importance=1,Color=Orange':'');
 }).join('\n');
 let raw=original;if(!raw){raw='FileType=text/acmi/tacview\nFileVersion=2.2\n0,ReferenceTime=2026-10-17T00:00:00Z\n0,Title='+clean(project.name)+'\n#0\n';trace.time.forEach((t,i)=>{const h=trace.hprv[i];raw+='#'+t.toFixed(6)+'\n100,T='+transform(trace.position[i],h)+(i?'':',Type=Air+FixedWing,Name=J-20,Color=Cyan,CallSign=9a Student - Browser FP32')+',TAS='+h[3]+(trace.g?.[i]!=null?',A4LoadG='+trace.g[i]:'')+'\n';});}
 const ref=trace.reference?.length>1?trace.reference:trace.position,cumulative=[0];for(let i=1;i<ref.length;i++)cumulative.push(cumulative[i-1]+norm(sub(ref[i],ref[i-1])));let ghostIndex=0;const ghostAt=t=>{const d=Math.max(0,Math.min(1,t/trace.time.at(-1)))*cumulative.at(-1);while(ghostIndex<ref.length-2&&cumulative[ghostIndex+1]<d)ghostIndex++;const i=ghostIndex,f=(d-cumulative[i])/(cumulative[i+1]-cumulative[i]||1),p=mix(ref[i],ref[i+1],f),v=sub(ref[i+1],ref[i]);return '200,T='+transform(p,[Math.atan2(v[1],v[0]),Math.atan2(v[2],Math.hypot(v[0],v[1])),0])+',Type=Air+FixedWing,Name=Su-57,Color=Green,CallSign=Reference Geometry,AEROLABTrackKind=Reference geometry only - no teacher flight';};
 let out=[],initialized=false,frameTime=0;for(let line of raw.trimEnd().split(/\r?\n/)){if(line.startsWith('#'))frameTime=Number(line.slice(1));if(/^100,/.test(line)&&/,Name=/.test(line)){line=line.replace(/,Name=[^,]*/,',Name=J-20').replace(/,CallSign=[^,]*/,'');line+=',CallSign=9a Student - '+(mode==='archive'?'Recorded':'Browser FP32')+',AEROLABTrackKind=9a student simulated flight,AEROLABCheckpoint='+CHECKPOINT;}if(/^200,/.test(line)&&/,Name=/.test(line)){line=line.replace(/,Name=[^,]*/,',Name=Su-57').replace(/,CallSign=[^,]*/,'');line+=',CallSign=Reference Geometry';}if(mode!=='preview'&&line.startsWith('100,T=')){let i=0;while(i<trace.time.length-1&&Math.abs(trace.time[i+1]-frameTime)<Math.abs(trace.time[i]-frameTime))i++;for(const [name,value]of [['TAS',trace.hprv[i][3]],['AOA',trace.alpha?.[i]],['AOS',trace.beta?.[i]],['A4LoadG',trace.g?.[i]],['A4CTE',trace.cte?.[i]]])if(Number.isFinite(value)&&!line.includes(','+name+'='))line+=','+name+'='+value;}if(pursuers.length&&(/^200,/.test(line)||line.includes('Type=Navaid')))line+=',Visible=0';out.push(line);if(!original&&line.startsWith('100,T='))out.push(ghostAt(frameTime)+(pursuers.length?',Visible=0':''));if(line.startsWith('#')){const t=Number(line.slice(1));if(!initialized){out.push(metadata.trimEnd(),obs(t,true));const refs=mode==='archive'?trace.reference:smoothRoute(project.points).positions;refs.forEach((p,i)=>out.push((0xd0000+i).toString(16)+',T='+transform(p)+',Type=Navaid+Static+Waypoint,Color=Green'+(pursuers.length?',Visible=0':'')+(i<refs.length-1?',Next='+(0xd0000+i+1).toString(16):'')));initialized=true;}else if(project.obstacles.some(o=>o.velocity.some(x=>x)))out.push(obs(t,false));}}
 if(pursuers.length){const multi=[];for(const line of out){multi.push(line);if(line.startsWith('#')){const t=Number(line.slice(1));for(const track of pursuers){const state=sampleTrack(track,t);multi.push(track.id+',T='+transform(state.position,state.hprv)+',Type=Air+FixedWing,Name=J-10,Color=Orange,CallSign='+track.callsign+',AEROLABTrackKind=Scripted animation - not simulated flight');}}}return multi.join('\n')+'\n';}
 return out.join('\n')+'\n';
}
