import {speedKey} from './speed-profile.js';
import {CHECKPOINT, smoothRoute, obstacleAt, isAirObstacle} from './core.js';
export const endTime=b=>Math.max(0,...['student','teacher'].map(k=>b?.[k]?.trace?.time?.at(-1)||0));
export function validateRealTrace(t){
 if(!t||t.synthetic_flight_samples!==false||!Array.isArray(t.time)||!t.time.length||t.time.length>100000||t.time[0]!==0)throw Error('缺少从 t=0 开始的真实轨迹');
 if(!t.time.every((v,i)=>Number.isFinite(v)&&(!i||v>t.time[i-1])))throw Error('轨迹时间必须严格递增');
 for(const [key,n]of [['position',3],['hprv',4]])if(t[key]?.length!==t.time.length||!t[key].every(v=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite)))throw Error('轨迹坐标或姿态无效');
 return t;
}
// V8 versions may differ by sub-nanometres in Math.hypot; control points remain exact.
function samePositions(a,b){return Array.isArray(a)&&a.length===b.length&&a.every((p,i)=>Array.isArray(p)&&p.length===3&&p.every((v,k)=>Number.isFinite(v)&&Math.abs(v-b[i][k])<=1e-7));}
export function validateBundle(b,points,settings){
 const recorded=b?.schema==='skybound.recorded.result.v1';
 if(!recorded&&b?.schema!=='a4.dual.result.v1')throw Error('不是飞行对比结果');
 if(JSON.stringify(b.request?.control_points)!==JSON.stringify(points)||!(recorded?samePositions(b.request?.positions,b.student?.trace?.reference||[])&&points.every(p=>b.request.positions.some(q=>p.every((v,k)=>v===q[k]))):samePositions(b.request?.positions,smoothRoute(points,40).positions)))throw Error('飞行结果与本项目路线不匹配，请重新计算');
 if(settings&&speedKey(settings)!==speedKey(b.request))throw Error('飞行结果与目标速度设置不匹配，请重新计算');
 if(b.student?.trace){validateRealTrace(b.student.trace);if(b.student.identity?.checkpoint!==CHECKPOINT||b.student.identity?.teacher_calls!==0)throw Error('保留 RL baseline 学生身份不匹配');}
 if(b.teacher?.trace){validateRealTrace(b.teacher.trace);if(b.teacher.identity?.kind!=='a4-mpc-cem'||!b.teacher.identity?.source_sha256)throw Error('教师缺少真实 MPC/CEM 来源');}
 if(b.student?.trace&&b.teacher?.trace){if(b.initial_state_match?.exact!==true||JSON.stringify(b.student.trace.position[0])!==JSON.stringify(b.teacher.trace.position[0])||JSON.stringify(b.student.trace.hprv[0])!==JSON.stringify(b.teacher.trace.hprv[0]))throw Error('两控制器初态不一致');}
 if(!Number.isFinite(b.coordinates?.metres_per_degree)||b.coordinates.metres_per_degree<110000||b.coordinates.metres_per_degree>112000)throw Error('缺少地理坐标约定');
 return b;
}
export function sample(t,time){
 if(!t)return null;let lo=0,hi=t.time.length-1;
 while(lo<hi){const m=Math.ceil((lo+hi)/2);if(t.time[m]<=time)lo=m;else hi=m-1;}
 const i=lo,j=Math.min(i+1,t.time.length-1),f=Math.max(0,Math.min(1,(time-t.time[i])/(t.time[j]-t.time[i]||1)));
 return {i,j,f,ended:time>=t.time.at(-1),position:t.position[i].map((v,k)=>v+(t.position[j][k]-v)*f),hprv:t.hprv[i].map((v,k)=>k===3?v+(t.hprv[j][k]-v)*f:v+Math.atan2(Math.sin(t.hprv[j][k]-v),Math.cos(t.hprv[j][k]-v))*f)};
}
const clean=s=>String(s??'').replace(/[\r\n,|=\\]/g,' ').slice(0,150);
export function dualAcmi(project,b,prefix='SKYBOUND',volume=false){
 validateBundle(b,project.points,project);
 if(!b.student?.trace&&!b.teacher?.trace)throw Error('需要学生和教师的实际飞行记录后才能导出 ACMI');
 const degree=b.coordinates.metres_per_degree;
 const transform=(p,h=[0,0,0])=>[p[1]/degree,p[0]/degree,p[2],h[2]*180/Math.PI,h[1]*180/Math.PI,h[0]*180/Math.PI].map(x=>x.toFixed(9)).join('|');
 const lines=['FileType=text/acmi/tacview','FileVersion=2.2','0,ReferenceTime=2026-10-18T00:00:00Z','0,Title='+clean(project.name),'0,Briefing=Recorded controller flight. Reference route is geometry. Scenery was added after flight and was not controller input. Only available actual aircraft are exported.'];
 const frames=new Map(),put=(t,line)=>{const key=Number(t).toFixed(6);if(!frames.has(key))frames.set(key,[]);frames.get(key).push(line);};
 for(const [role,id,color,model,label]of [['student','100','Cyan','J-20','Student RL baseline'],['teacher','200','Orange','Su-57','MPC CEM Teacher']]){
  const flight=b[role];if(!flight?.trace)continue;const t=flight.trace;
  t.time.forEach((time,i)=>{let line=id+',T='+transform(t.position[i],t.hprv[i]);if(!i)line+=',Type=Air+FixedWing,Name='+model+',Color='+color+',CallSign='+label+',Controller='+role+',StopReason='+clean(flight.reason)+',SourceSHA256='+clean(t.source_sha256);
   line+=',TAS='+t.hprv[i][3];for(const [field,key]of [['LoadG','g'],['CTE','cte'],['AOA','alpha'],['AOS','beta']])if(Number.isFinite(t[key]?.[i]))line+=','+field+'='+t[key][i];put(time,line);
  });
  // Deletion is a lifecycle event, never an invented position after termination.
  put(t.time.at(-1)+.0001,'-'+id);
 }
 const refs=b.request.positions;
 refs.forEach((p,i)=>put(0,(0xd0000+i).toString(16)+',T='+transform(p)+',Type=Navaid+Static+Waypoint,Color=Green,Name=Reference route'+(i<refs.length-1?',Next='+(0xd0001+i).toString(16):'')));
 const times=[...new Set([0,...(b.student?.trace?.time||[]),...(b.teacher?.trace?.time||[])])].sort((a,c)=>a-c);
 for(const t of times)project.obstacles.forEach((o,i)=>{if(t!==0&&!o.velocity.some(Boolean))return;const air=isAirObstacle(o)&&!volume,p=obstacleAt(o,t);if(!air)p[2]-=o.size[2]/2;const name=prefix+'_'+i+(volume?'_VOLUME':'');put(t,(0xc9000+i).toString(16)+',T='+transform(p)+(t===0?',Type='+(air?'Air':o.velocity.some(Boolean)?'Ground+Building':'Ground+Static+Building')+',Name='+name+',CallSign='+clean(o.name)+(volume?'':',Shape='+prefix+'_'+i+'.obj')+',Length='+o.size[0]+',Width='+o.size[1]+',Height='+o.size[2]+',Visible=1,Color=Orange':''));});
 for(const [t,rows]of [...frames].sort((a,c)=>Number(a[0])-Number(c[0])))lines.push('#'+t,...rows);
 return lines.join('\n')+'\n';
}
