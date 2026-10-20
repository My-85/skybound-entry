import * as T from 'three';

// A view offset for the automatic cameras; an independent pose for free flight.
export class CameraNavigation {
 constructor(camera,canvas,{isFree,isBlocked,onReset,onToggle,canMove=isFree,isPointerBlocked=isBlocked,onMove=()=>{}}){
  this.onMove=onMove;this.camera=camera;this.canvas=canvas;this.isFree=isFree;this.isBlocked=isBlocked;
  this.keys=new Set();this.yaw=0;this.pitch=0;this.speed=400;this.pointer=null;
  this.rotation=new T.Euler(0,0,0,'YXZ');this.offset=new T.Quaternion();
  this.forward=new T.Vector3();this.right=new T.Vector3();this.motion=new T.Vector3();
  canvas.tabIndex=0;canvas.setAttribute('aria-describedby','camera-hint');
  canvas.addEventListener('pointerdown',e=>{
   if(e.button!==0||isPointerBlocked()||this.pointer!==null)return;
   canvas.focus({preventScroll:true});this.pointer=e.pointerId;this.x=e.clientX;this.y=e.clientY;
   canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');e.preventDefault();
  });
  canvas.addEventListener('pointermove',e=>{
   if(e.pointerId!==this.pointer)return;
   const dx=e.clientX-this.x,dy=e.clientY-this.y;this.x=e.clientX;this.y=e.clientY;
   this.yaw=T.MathUtils.euclideanModulo(this.yaw-dx*.004+Math.PI,Math.PI*2)-Math.PI;
   this.pitch=T.MathUtils.clamp(this.pitch-dy*.004,-Math.PI*.48,Math.PI*.48);
   if(isFree())this.applyFreeRotation();
  });
  const release=e=>{if(e.pointerId===this.pointer)this.stopDrag();};
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('wheel',e=>{
   if(isPointerBlocked())return;
   e.preventDefault();
   // Normalize wheel notches and trackpad deltas; optical zoom works in every
   // mode without an automatic camera pulling the viewer back next frame.
   const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1);
   const delta=T.MathUtils.clamp(pixels,-400,400);
   camera.zoom=T.MathUtils.clamp(camera.zoom*Math.exp(-delta*.0015),.4,4);
   camera.updateProjectionMatrix();
  },{passive:false});
  document.addEventListener('keydown',e=>{
   if(isBlocked()||this.editing(e.target))return;
   if(e.code==='KeyV'&&!e.repeat){e.preventDefault();onToggle();return;}
   if(e.code==='KeyR'&&!e.repeat){e.preventDefault();onReset();return;}
   if(canMove()&&['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight'].includes(e.code)){
    e.preventDefault();this.keys.add(e.code);
   }
  });
  document.addEventListener('keyup',e=>this.keys.delete(e.code));
  // Focus changes must never leave a movement key held down.
  window.addEventListener('blur',()=>this.clear());
  document.addEventListener('visibilitychange',()=>this.clear());
  document.addEventListener('focusin',e=>{if(e.target!==canvas)this.clear();});
 }
 editing(element){return element instanceof Element&&Boolean(element.closest('input,select,textarea,button,a,[contenteditable]:not([contenteditable="false"])'));}
 stopDrag(){const id=this.pointer;this.pointer=null;this.canvas.classList.remove('dragging');if(id!==null&&this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);}
 clear(){this.keys.clear();this.stopDrag();}
 reset(){this.clear();this.yaw=0;this.pitch=0;}
 resetZoom(){this.camera.zoom=1;this.camera.updateProjectionMatrix();}
 syncFree(){this.clear();this.rotation.setFromQuaternion(this.camera.quaternion,'YXZ');this.yaw=this.rotation.y;this.pitch=T.MathUtils.clamp(this.rotation.x,-Math.PI*.48,Math.PI*.48);this.applyFreeRotation();}
 applyFreeRotation(){this.camera.quaternion.setFromEuler(this.rotation.set(this.pitch,this.yaw,0,'YXZ'));}
 applyLookOffset(){this.offset.setFromEuler(this.rotation.set(this.pitch,this.yaw,0,'YXZ'));this.camera.quaternion.multiply(this.offset);}
 update(dt){
  if(this.isBlocked()){this.clear();return;}
  const k=this.keys;this.forward.set(0,0,-1).applyQuaternion(this.camera.quaternion);this.right.set(1,0,0).applyQuaternion(this.camera.quaternion);
  this.motion.copy(this.forward).multiplyScalar(Number(k.has('KeyW'))-Number(k.has('KeyS')))
   .addScaledVector(this.right,Number(k.has('KeyD'))-Number(k.has('KeyA')));
  this.motion.y+=Number(k.has('KeyE'))-Number(k.has('KeyQ'));
  // Normalize diagonals and cap resumed frames so returning to a tab cannot jump.
  if(this.motion.lengthSq()>0){this.motion.normalize().multiplyScalar(this.speed*(k.has('ShiftLeft')||k.has('ShiftRight')?4:1)*Math.min(Math.max(dt,0),.05));this.camera.position.add(this.motion);this.onMove(this.motion);}
 }
}
