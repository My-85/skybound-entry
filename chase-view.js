import * as T from 'three';
import {world,attitude} from './world.js';
import {tag,dispose} from './scene.js';
import {buildChaseTracks,sampleTrack} from './chase.js';
// Simplified single-engine, delta-wing/canard silhouette for presentation.
// This mesh conveys J-10 identity; it is not aerodynamic geometry.
export function makeJ10(){
 const group=new T.Group(),metal=new T.MeshStandardMaterial({color:0xbfc3c0,roughness:.48,metalness:.4}),dark=new T.MeshStandardMaterial({color:0x263f46,roughness:.28,metalness:.65}),orange=new T.MeshStandardMaterial({color:0xea9c79,roughness:.5});
 const body=new T.Mesh(new T.CylinderGeometry(.42,1.04,11.8,12),metal);body.rotation.x=-Math.PI/2;body.position.z=.1;group.add(body);
 const nose=new T.Mesh(new T.ConeGeometry(.43,3.6,12),metal);nose.rotation.x=-Math.PI/2;nose.position.z=-7.5;group.add(nose);
 const canopy=new T.Mesh(new T.SphereGeometry(1,12,8),dark);canopy.scale.set(.53,.46,1.5);canopy.position.set(0,.73,-3.6);group.add(canopy);
 function surface(vertices,material){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.computeVertexNormals();const mesh=new T.Mesh(g,material.clone());mesh.material.side=T.DoubleSide;group.add(mesh);}
 for(const s of [-1,1]){surface([s*.6,0,-2,s*4.9,0,4.0,s*.7,0,4.9],metal);surface([s*.55,.2,-4.3,s*2.2,.2,-2.6,s*.55,.2,-2.4],orange);}
 surface([0,.6,2.4,0,3.4,5.7,0,.6,6.2],metal);
 const nozzle=new T.Mesh(new T.CylinderGeometry(.72,.82,1.4,12),dark);nozzle.rotation.x=Math.PI/2;nozzle.position.z=6.5;group.add(nozzle);
 group.scale.setScalar(4.7);return group;
}
export class ChaseView{
 constructor(scene){this.scene=scene;this.group=new T.Group();scene.add(this.group);this.tracks=[];this.items=[];this.state=[];this.leadLabel=tag('J-20 / 9a');this.leadLabel.scale.set(180,23,1);this.leadLabel.visible=false;scene.add(this.leadLabel);}
 rebuild(trace,settings){this.group.children.slice().forEach(dispose);this.tracks=buildChaseTracks(trace,settings);this.leadLabel.visible=!!this.tracks.length;this.items=this.tracks.map((track,i)=>{const mesh=makeJ10(),label=tag('J-10 '+String(i+1).padStart(2,'0')),line=new T.Line(new T.BufferGeometry().setFromPoints(track.position.map(world)),new T.LineBasicMaterial({color:0xec9976,transparent:true,opacity:.45}));label.scale.set(170,22,1);this.group.add(mesh,label,line);return {mesh,label,line};});this.state=[];}
 update(time,lead){this.leadLabel.position.copy(lead).add(new T.Vector3(0,70,0));this.state=this.tracks.map((track,i)=>{const state=sampleTrack(track,time),p=world(state.position),item=this.items[i];item.mesh.position.copy(p);item.mesh.quaternion.copy(attitude(state.hprv));item.label.position.copy(p).add(new T.Vector3(0,48,0));item.line.geometry.setDrawRange(Math.max(0,state.index-35),Math.min(37,state.index+2));return {...state,id:track.id,callsign:track.callsign,distance:p.distanceTo(lead),world:p};});return this.state;}
}
