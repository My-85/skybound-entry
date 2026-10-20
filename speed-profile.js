export const SPEED_MIN=100, SPEED_MAX=350, DEFAULT_SPEED=250;
export function speedSettings(p){
 const speeds=p.waypointSpeeds??p.waypoint_speeds??p.points?.map(()=>DEFAULT_SPEED)??p.control_points?.map(()=>DEFAULT_SPEED);
 const fixed=p.fixedSpeed??p.fixed_speed??null;
 const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=SPEED_MIN&&v<=SPEED_MAX;
 const count=p.points?.length??p.control_points?.length;
 if(!Array.isArray(speeds)||speeds.length!==count||!speeds.every(valid)||!(fixed===null||valid(fixed)))throw Error('目标速度须为 100–350 m/s，且每个航点都须有速度');
 return {waypointSpeeds:[...speeds],fixedSpeed:fixed};
}
export const speedKey=p=>JSON.stringify(speedSettings(p));
export const flightKey=p=>JSON.stringify([p.points,speedSettings(p)]);
export function requestedSpeeds(points,positions,segments,settings){
 const {waypointSpeeds,fixedSpeed}=speedSettings({...settings,points});
 const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
 const station=[0];for(let i=1;i<positions.length;i++)station.push(station[i-1]+distance(positions[i],positions[i-1]));
 const start=points.slice(0,-1).map((_,k)=>segments.indexOf(k));
 return positions.map((_,i)=>{
  if(fixedSpeed!==null)return fixedSpeed;
  const k=segments[i],a=start[k],b=k+1<start.length?start[k+1]:positions.length-1;
  const f=Math.max(0,Math.min(1,(station[i]-station[a])/(station[b]-station[a]||1)));
  return waypointSpeeds[k]+(waypointSpeeds[k+1]-waypointSpeeds[k])*f;
 });
}
