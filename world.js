import * as T from 'three';
import {aircraftMesh,bodyToNEU} from './aircraft.js';
export const world=p=>new T.Vector3(p[1],p[2],-p[0]);
export function attitude(h){
 const f=b=>{const a=bodyToNEU(b,h);return new T.Vector3(a[1],a[2],-a[0]);};
 return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(f([0,1,0]),f([0,0,-1]),f([-1,0,0])));
}
const fract=x=>x-Math.floor(x),smooth=x=>x*x*(3-2*x);
function noise(x,y){let a=Math.floor(x),b=Math.floor(y),u=smooth(fract(x)),v=smooth(fract(y));const h=(i,j)=>fract(Math.sin(i*127.1+j*311.7)*43758.5453);return T.MathUtils.lerp(T.MathUtils.lerp(h(a,b),h(a+1,b),u),T.MathUtils.lerp(h(a,b+1),h(a+1,b+1),u),v);}
function fbm(x,y){return noise(x,y)*.54+noise(x*2.1,y*2.1)*.27+noise(x*4.3,y*4.3)*.13+noise(x*8.7,y*8.7)*.06;}
export function makeAircraft(){
 const m=aircraftMesh({position:[0,0,0],hprv:[0,0,0]},64),v=[],c=[];
 m.i.forEach((_,f)=>{const color=new T.Color(m.facecolor[f]);for(const i of [m.i[f],m.j[f],m.k[f]]){v.push(m.x[i]*1000,m.z[i]*1000,-m.y[i]*1000);c.push(color.r,color.g,color.b);}});
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.setAttribute('color',new T.Float32BufferAttribute(c,3));geo.computeVertexNormals();
 const plane=new T.Group();const hull=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:.36,metalness:.55,side:T.DoubleSide}));plane.add(hull);
 const light=new T.Mesh(new T.SphereGeometry(.75,8,6),new T.MeshBasicMaterial({color:0xff6952}));light.position.set(-19,0,15);plane.add(light);const right=light.clone();right.material=new T.MeshBasicMaterial({color:0xb6ffca});right.position.x=19;plane.add(right);
 return plane;
}
function label(text,size=180){const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d');ctx.font='38px sans-serif';ctx.textAlign='center';ctx.fillStyle='#dbeed4';ctx.shadowColor='#001b24';ctx.shadowBlur=10;ctx.fillText(text,512,72);const s=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(c),transparent:true,depthWrite:false}));s.scale.set(size*6,size*.75,1);return s;}
export function makeSky(scene){
 const sky=new T.Mesh(new T.SphereGeometry(180000,32,20),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{top:{value:new T.Color('#2a6074')},bottom:{value:new T.Color('#d9cbae')}},vertexShader:'varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 v;uniform vec3 top;uniform vec3 bottom;void main(){float h=normalize(v).y;gl_FragColor=vec4(mix(bottom,top,pow(clamp(h+.08,0.,1.),.65)),1.);}'}));scene.add(sky);
 const sun=new T.Mesh(new T.SphereGeometry(1700,24,16),new T.MeshBasicMaterial({color:0xffe8b6}));sun.position.set(-65000,32000,-90000);scene.add(sun);
 const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,228,173,.75)');g.addColorStop(.18,'rgba(255,220,155,.25)');g.addColorStop(1,'rgba(255,220,155,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);const glow=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(c),transparent:true,depthWrite:false,fog:false,blending:T.AdditiveBlending}));glow.position.copy(sun.position).multiplyScalar(.99);glow.scale.set(33000,33000,1);scene.add(glow);
 scene.add(new T.HemisphereLight(0xc9e6f3,0x4b5e4c,2.4));const light=new T.DirectionalLight(0xffe5b8,3.6);light.position.set(-12000,17000,-10000);scene.add(light);
}
export function buildLandscape(trace){
 const group=new T.Group(),points=trace.position.map(world),refs=trace.reference.map(world),bounds=new T.Box3().setFromPoints(points.concat(refs)),center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3()),span=Math.max(size.x,size.y,size.z,3000),base=bounds.min.y-1250;
 const samples=points.filter((_,i)=>i%4===0);samples.push(points.at(-1));
 function height(x,z){
  const ridge=1-Math.abs(2*fbm((x+12000)/4600,(z-4000)/4600)-1);
  let h=base-450+Math.pow(ridge,2.5)*3300+fbm(x/800,z/800)*320;
  let ceiling=Infinity;for(const p of samples){const d=Math.hypot(x-p.x,z-p.z);ceiling=Math.min(ceiling,p.y-440+Math.max(0,d-340)*1.05);}h=Math.min(h,ceiling);
  return h;
 }
 const terrainSize=Math.max(span*3.8,30000),segments=220,geo=new T.PlaneGeometry(terrainSize,terrainSize,segments,segments);geo.rotateX(-Math.PI/2);const pos=geo.attributes.position,colors=[];
 for(let i=0;i<pos.count;i++){const x=pos.getX(i)+center.x,z=pos.getZ(i)+center.z,h=height(x,z);pos.setXYZ(i,x,h,z);const n=fbm(x/500,z/500),c=new T.Color();if(h>base+2150)c.set('#c2c9c3').lerp(new T.Color('#e9ece1'),Math.min(1,(h-base-2150)/600));else if(h>base+1100)c.set('#606d69').lerp(new T.Color('#9c9f8f'),n);else c.set('#294c46').lerp(new T.Color('#61746a'),n);c.multiplyScalar(.85+noise(x/90,z/90)*.28);colors.push(c.r,c.g,c.b);}
 geo.computeVertexNormals();
 const normal=geo.attributes.normal;
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),h=pos.getY(i),slope=normal.getY(i),n=fbm(x/500,z/500),col=new T.Color('#3b5147');
  col.lerp(new T.Color('#8c8e7d'),T.MathUtils.clamp((h-base-650)/1700,0,1));
  col.lerp(new T.Color('#565c5b'),T.MathUtils.clamp((.8-slope)*1.8,0,.7));
  const snow=T.MathUtils.clamp((h-base-2200)/450,0,1)*T.MathUtils.clamp((slope-.40)*2.4,0,1);col.lerp(new T.Color('#e0e6df'),snow);col.multiplyScalar(.8+n*.35);colors[i*3]=col.r;colors[i*3+1]=col.g;colors[i*3+2]=col.b;}
 geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 const rockCanvas=document.createElement('canvas');rockCanvas.width=rockCanvas.height=512;const rockCtx=rockCanvas.getContext('2d'),pixels=rockCtx.createImageData(512,512);
 for(let j=0;j<512;j++)for(let i=0;i<512;i++){const n=fbm(i/32,j/40),grain=noise(i*1.23,j*1.31),streak=Math.abs(Math.sin(j*.11+n*20));const value=190+n*45+grain*4-streak*5,k=(j*512+i)*4;pixels.data[k]=pixels.data[k+1]=pixels.data[k+2]=value;pixels.data[k+3]=255;}rockCtx.putImageData(pixels,0,0);const rock=new T.CanvasTexture(rockCanvas);rock.wrapS=rock.wrapT=T.RepeatWrapping;rock.repeat.set(terrainSize/850,terrainSize/850);rock.anisotropy=4;
 group.add(new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0,bumpMap:rock,bumpScale:1.4,map:rock})));
 // A lake and low valley haze give the scene a readable scale.
 const lakeY=base+160;const lake=new T.Mesh(new T.PlaneGeometry(terrainSize,terrainSize),new T.MeshStandardMaterial({color:'#36676c',roughness:.3,metalness:.55,transparent:true,opacity:.87}));lake.rotation.x=-Math.PI/2;lake.position.set(center.x,lakeY,center.z);group.add(lake);
 // Deterministic trees, built as instances so the viewer stays responsive.
 const trees=700;const foliage=new T.InstancedMesh(new T.ConeGeometry(16,65,6),new T.MeshStandardMaterial({color:'#213f38',roughness:1}),trees);const dummy=new T.Object3D();let seed=153;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};let count=0;
 for(let j=0;j<2200&&count<trees;j++){const x=center.x+(rand()-.5)*span*2.4,z=center.z+(rand()-.5)*span*2.4,y=height(x,z);if(y<lakeY+20||y>base+1300)continue;dummy.position.set(x,y+25,z);dummy.scale.setScalar(.7+rand()*1.5);dummy.rotation.y=rand()*6.28;dummy.updateMatrix();foliage.setMatrixAt(count++,dummy.matrix);}foliage.count=count;group.add(foliage);
 const route=new T.Group();group.add(route);const lineMat=new T.LineDashedMaterial({color:'#e1d59f',transparent:true,opacity:.55,dashSize:50,gapSize:42});const refLine=new T.Line(new T.BufferGeometry().setFromPoints(refs),lineMat);refLine.computeLineDistances();route.add(refLine);
 const gates=[];for(const [j,frac]of [.12,.32,.52,.73,.93].entries()){const i=Math.floor(frac*(refs.length-1)),p=refs[i],direction=refs[Math.min(i+2,refs.length-1)].clone().sub(refs[Math.max(i-2,0)]).normalize();const gate=new T.Mesh(new T.TorusGeometry(145,2.1,6,64),new T.MeshBasicMaterial({color:'#d2e5bb',transparent:true,opacity:.6}));gate.position.copy(p);gate.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),direction);route.add(gate);gates.push(gate);const tag=label(String(j+1).padStart(2,'0'),60);tag.position.copy(p).add(new T.Vector3(0,215,0));route.add(tag);}
 function station(p,title){const g=new T.Group();g.position.set(p.x+220,height(p.x+220,p.z+170),p.z+170);group.add(g);
  const mat=new T.MeshStandardMaterial({color:'#9baba6',roughness:.7,metalness:.2});const dark=new T.MeshStandardMaterial({color:'#193d49',roughness:.5,metalness:.3});const cube=(x,y,z,w,h,d,m=mat)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);g.add(o);return o;};cube(0,2,0,260,4,180,dark);cube(-50,18,10,85,32,40);cube(40,13,30,55,22,45);cube(-50,35,10,90,3,44,dark);
  const mast=new T.Mesh(new T.CylinderGeometry(2,6,110,8),mat);mast.position.set(65,55,-45);g.add(mast);const dish=new T.Mesh(new T.SphereGeometry(14,16,12),new T.MeshStandardMaterial({color:'#d4e1d9',roughness:.5}));dish.position.set(65,118,-45);g.add(dish);
  for(let i=0;i<6;i++){const panel=cube(-90+i*30,10,-55,23,2,24,dark);panel.rotation.x=.35;}
  const ring=new T.Mesh(new T.RingGeometry(35,37,48),new T.MeshBasicMaterial({color:'#c1dba7',side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(55,4.2,35);g.add(ring);
  const beacon=new T.Mesh(new T.CylinderGeometry(10,40,300,24,1,true),new T.MeshBasicMaterial({color:'#c5eab1',transparent:true,opacity:.065,side:T.DoubleSide,depthWrite:false}));beacon.position.set(0,150,0);g.add(beacon);const tag=label(title,150);tag.position.set(0,190,0);g.add(tag);
 }
 station(points[0],'01  /  山地通信站');station(points.at(-1),'02  /  远端接力站');
 const trail=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#a9f2d0',transparent:true,opacity:.85}));trail.geometry.setDrawRange(0,1);group.add(trail);
 const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),grad=ctx.createRadialGradient(64,64,0,64,64,64);grad.addColorStop(0,'rgba(219,226,218,.3)');grad.addColorStop(.5,'rgba(219,226,218,.13)');grad.addColorStop(1,'rgba(219,226,218,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,128,128);const cloudTexture=new T.CanvasTexture(c);
 for(let j=0;j<35;j++){const cloud=new T.Sprite(new T.SpriteMaterial({map:cloudTexture,transparent:true,opacity:.55,depthWrite:false}));cloud.position.set(center.x+(rand()-.5)*terrainSize*.8,base+400+rand()*500,center.z+(rand()-.5)*terrainSize*.8);cloud.scale.set(3500+rand()*6000,450+rand()*600,1);group.add(cloud);}
 return {group,route,trail,points,refs,center,span,bounds,height,gates,base};
}
export function disposeGroup(group){const geometries=new Set(),materials=new Set(),textures=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?[].concat(o.material):[]){materials.add(m);if(m.map)textures.add(m.map);if(m.bumpMap)textures.add(m.bumpMap);}});geometries.forEach(x=>x.dispose());materials.forEach(x=>x.dispose());textures.forEach(x=>x.dispose());}
