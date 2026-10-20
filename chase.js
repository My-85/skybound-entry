// Cinematic replay choreography only. No pursuit controller, sensing, weapons,
// performance comparison, or feedback into the recorded J-20 flight.
export function chaseOptions(value){return {enabled:value?.enabled===true,count:[2,4,6].includes(value?.count)?value.count:4};}
const lerp=(a,b,f)=>a+(b-a)*f;
export function sampleTrack(track,time){
 const times=track.time;let lo=0,hi=times.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(times[mid]<=time)lo=mid;else hi=mid;}
 const f=(time-times[lo])/(times[hi]-times[lo]),p=track.position[lo].map((v,k)=>lerp(v,track.position[hi][k],f));
 const h=track.hprv[lo].map((v,k)=>{const d=track.hprv[hi][k]-v;return k<3?v+Math.atan2(Math.sin(d),Math.cos(d))*Math.max(0,Math.min(1,f)):lerp(v,track.hprv[hi][k],Math.max(0,Math.min(1,f)));});
 return {position:p,hprv:h,index:lo};
}
export function buildChaseTracks(trace,settings){
 const options=chaseOptions(settings);if(!options.enabled)return [];
 const heading=trace.hprv[0][0];
 return Array.from({length:options.count},(_,i)=>{
  const side=(i%2?1:-1)*(150+Math.floor(i/2)*95),delay=1.2+i*.75,height=[65,-70,140,-135,215,-200][i];
  const offset=[-Math.sin(heading)*side,Math.cos(heading)*side,height];
  const frames=trace.time.map(t=>{const s=sampleTrack(trace,t-delay);return {position:s.position.map((v,k)=>v+offset[k]),hprv:s.hprv};});
  return {id:(0xe100+i).toString(16),name:'J-10',callsign:'J-10 '+String(i+1).padStart(2,'0')+' / SCRIPTED',kind:'scripted-replay-choreography',synthetic_flight_samples:true,physics_simulated:false,time:[...trace.time],position:frames.map(f=>f.position),hprv:frames.map(f=>f.hprv),choreography:{delay_seconds:delay,world_offset_neu_m:offset}};
 });
}
