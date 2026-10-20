import * as T from 'three';
import {makeAircraft} from './world.js';
export const modelNames={canard:'鸭翼双发',conventional:'常规单发',delta:'无尾三角翼',flyingwing:'飞翼无人机',trainer:'平直翼教练机',twinboom:'双尾撑无人机'};
export function displayAircraft(kind){
 if(kind==='canard')return makeAircraft();
 const group=new T.Group(),skin=new T.MeshStandardMaterial({color:kind==='trainer'?'#e4b25f':kind==='flyingwing'?'#9daab7':'#cad5d7',roughness:.4,metalness:.35,side:T.DoubleSide}),glass=new T.MeshStandardMaterial({color:'#193f52',roughness:.2,metalness:.5});
 // Body coordinates: x forward, y right, z down. Map to viewer x right,y up,z backward.
 const v=p=>[p[1],-p[2],-p[0]];
 function poly(ps,mat=skin){const ar=[];for(let i=1;i<ps.length-1;i++)ar.push(...v(ps[0]),...v(ps[i]),...v(ps[i+1]));const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ar,3));g.computeVertexNormals();group.add(new T.Mesh(g,mat));}
 function body(cx=0,cy=0,len=62,w=6){const ring=(x,r,k)=>[x+cx,cy+r*Math.cos(k*Math.PI/4),r*.72*Math.sin(k*Math.PI/4)];const rings=[[len*.5,.1],[len*.25,w*.65],[-len*.32,w],[-len*.5,w*.35]];for(let j=0;j<3;j++)for(let k=0;k<8;k++)poly([ring(...rings[j],k),ring(...rings[j],k+1),ring(...rings[j+1],k+1),ring(...rings[j+1],k)]);}
 function wing(ps){for(const s of [-1,1])poly(ps.map(p=>[p[0],s*p[1],p[2]||0]));}
 if(kind!=='flyingwing')body();else body(0,0,34,7);
 if(kind==='conventional'){wing([[8,3,0],[-10,26,1],[-18,25,1],[-12,4,0]]);wing([[-19,3,0],[-28,13,0],[-32,12,0],[-30,3,0]]);poly([[-16,0,0],[-25,0,-17],[-31,0,-15],[-31,0,0]]);}
 if(kind==='delta'){wing([[15,3,0],[-24,30,1],[-29,28,1],[-27,3,0]]);poly([[-13,0,0],[-23,0,-16],[-29,0,-14],[-30,0,0]]);}
 if(kind==='flyingwing'){wing([[18,0,0],[-16,43,1],[-23,43,1],[-12,16,0],[-19,0,0]]);wing([[-16,37,0],[-20,43,-6],[-23,43,-5],[-23,37,0]]);}
 if(kind==='trainer'){wing([[6,3,-2],[4,32,-2],[-5,32,-2],[-8,3,-2]]);wing([[-21,3,0],[-22,13,0],[-30,13,0],[-30,3,0]]);poly([[-18,0,0],[-23,0,-13],[-30,0,-12],[-30,0,0]]);poly([[32,-12,0],[32,-10,0],[32,12,0],[32,10,0]],glass);}
 if(kind==='twinboom'){wing([[8,2,-1],[1,36,-1],[-8,36,-1],[-10,2,-1]]);for(const s of [-1,1]){body(-8,s*15,58,2);poly([[-25,s*15,0],[-32,s*15,-13],[-36,s*15,-12],[-36,s*15,0]]);}poly([[-29,-15,0],[-29,15,0],[-36,15,0],[-36,-15,0]]);}
 poly([[22,-2,-2],[22,2,-2],[5,4,-5],[5,-4,-5]],glass);return group;
}
