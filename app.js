const STATIC_HOST = true;
import {displayAircraft,modelNames} from './models.js';
import {speedSettings,speedKey,flightKey,requestedSpeeds} from './speed-profile.js';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {world,attitude,makeAircraft,makeSky,buildLandscape,disposeGroup} from './world.js';
import {clone,norm,sub,mix,smoothRoute,previewTrace,validateProject,validateTrace,obstacleAt,encounters,sandbox,seedScene,zipFiles,download,tacviewScene,CHECKPOINT,SIDECAR,OBSTACLE_TYPES} from './core.js';
import {CameraNavigation} from './navigation.js';
import {validateBundle,endTime,sample,dualAcmi} from './dual.js';
import {ChaseView} from './chase-view.js';
import {sceneFiles} from './export.js';
import {saveDraft,loadDraft,draftSaved} from './draft.js';
import {obstacleMesh,objForObstacle,dispose,tag,terrain} from './scene.js';
const $=id=>document.getElementById(id),safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let presetCatalog=[],presetToken=0,flightOverview=null;
let actualFlight=null,exporting=false,teacherPlane,teacherLine,activeJob=null,pollTimer=null;
let project,trace,archiveTrace,record,original='',result=null,mode='archive',selected=0,selectedPoint=0,tab='obstacle',clock=0,playing=false,cameraMode='orbit',history=[],events=[],drawing=false,worker=null,busy=false,revision=0,computeRevision=0,lastFrame=performance.now(),land,routeLine,flightLine,handles=new T.Group(),obstacleGroup=new T.Group(),selectionBox,objects=[],catalog;
const scene=new T.Scene();const fleet=new ChaseView(scene);let fleetManual=false,lastFleetTarget=null;scene.fog=new T.FogExp2(0x94a69c,.000017);makeSky(scene);
const renderer=new T.WebGLRenderer({canvas:$('canvas'),antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor(0x839e9c);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.83;
const camera=new T.PerspectiveCamera(48,1,2,240000),controls=new OrbitControls(camera,$('canvas'));controls.enableDamping=true;controls.dampingFactor=.12;controls.maxDistance=70000;controls.minDistance=90;controls.maxPolarAngle=Math.PI*.94;scene.add(handles,obstacleGroup);let plane=makeAircraft();plane.scale.setScalar(.65);scene.add(plane);teacherPlane=makeAircraft();teacherPlane.scale.setScalar(.65);teacherPlane.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.color?.set(0xffba79);o.material.emissive?.set(0x4a1f08);}});scene.add(teacherPlane);teacherPlane.visible=false;
const raycaster=new T.Raycaster(),pointer=new T.Vector2();let drag=null,down=null;
function toast(s){$('toast').textContent=s;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',5500);}
function snapshot(){history.push(clone(project));if(history.length>40)history.shift();$('undo').disabled=false;}
const routeKey=()=>flightKey(project);
function ensureSettings(){Object.assign(project,speedSettings(project));project.name=project.name.replace(/双基线|dual baseline/gi,'飞行对比').replace(/A4/gi,'固定翼');project.airframe=Object.hasOwn(modelNames,project.airframe)?project.airframe:'canard';}
function selectAircraft(){const kind=project.airframe||'canard';for(const role of ['student','teacher']){const old=role==='student'?plane:teacherPlane,m=displayAircraft(kind);m.position.copy(old.position);m.quaternion.copy(old.quaternion);m.scale.setScalar(.65);m.visible=old.visible;if(role==='teacher')m.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.color?.set(0xffba79);}});scene.add(m);disposeGroup(old);scene.remove(old);if(role==='student')plane=m;else teacherPlane=m;}}
function routePreview(){const t=previewTrace(project.points),r=smoothRoute(project.points,40),v=requestedSpeeds(project.points,r.positions,r.controlSegments,speedSettings(project));t.time=[0];for(let i=1;i<t.position.length;i++)t.time.push(t.time[i-1]+norm(sub(t.position[i],t.position[i-1]))/((v[i-1]+v[i])/2));t.hprv.forEach((h,i)=>h[3]=v[i]);return t;}
function studentFlight(){return actualFlight?.pointsKey===routeKey()?actualFlight:null;}
function keepStudentFlight(){actualFlight={mode,trace,original:mode==='archive'?original:'',record,result,pointsKey:routeKey()};}
function persist(){saveDraft(exportProject(),toast);}
function currentBundle(){return studentFlight()?.result||null;}
function totalTime(){return mode==='computed'?endTime(currentBundle()):trace?.time.at(-1)||0;}
function flightControls(){
 const b=currentBundle(),ready=!!(b?.student?.trace||b?.teacher?.trace);
 $('export').disabled=exporting||busy||!ready;$('acmi').disabled=!ready||busy;
 $('export').textContent=exporting?'正在打包…':ready?'导出全场景 ZIP ↗':'导出全场景 ZIP';
 $('actual').hidden=!b||mode!=='preview';
 $('flightStatus').textContent=b?`学生：${statusText(b.student)}${b.teacher?.trace?' · 教师：'+statusText(b.teacher):' · 已载入历史飞行记录'}。`:'当前仅有参考路线，请计算两套控制器的真实闭环轨迹。';
 $('flightStatus').dataset.ready=ready;
 $('compute').textContent=STATIC_HOST?'自定义路线重算暂未接入':busy?'飞行对比计算中…':b?'重新计算飞行对比':'计算学生 + 真实教师';
 if(STATIC_HOST){$('compute').disabled=true;$('compute').title='可编辑和保存路线，或导入已经计算的飞行结果。';}
}
const reasons={record_end:'记录结束',route_end:'已到路线末端',cancelled:'已取消',physical_termination:'物理终止',nonfinite_physics:'数值异常',no_geometric_progress:'进度停滞',time_budget:'达到演示时限',execution_error:'执行失败',not_started:'未执行'};
function statusText(f){return f?.trace?`${reasons[f.reason]||f.reason||f.status} · ${f.trace.time.at(-1).toFixed(1)} s`:(f?.message||reasons[f?.reason]||'尚无轨迹');}
function showStudentFlight(){const f=studentFlight();if(!f)return;mode='computed';trace=f.trace;result=f.result;clock=0;playing=false;renderFlight();renderEditor();renderGeometry();resetLandscape();fit();}
function validateResult(res,points=project.points){validateBundle(res,points,points===project.points?project:undefined);return res.student?.trace||res.teacher?.trace||null;}
function acceptBundle(bundle){validateResult(bundle);result=bundle;mode='computed';trace=bundle.student?.trace||bundle.teacher?.trace||previewTrace(project.points);record=null;original='';keepStudentFlight();persist();clock=0;renderFlight();renderEditor();renderGeometry();resetLandscape();fit();}

function edited(route=false){ensureSettings();revision++;if(route){try{previewTrace(project.points);}catch(e){if(history.length)project=history.pop();renderEditor();toast(e.message);return;}project.caseId=null;project.preset=null;result=null;if(mode!=='preview'){mode='preview';toast('航路已修改，当前切换为几何动画预览；需要重新计算实际飞行。');}trace=routePreview();clock=0;playing=false;renderFlight();}persist();renderEditor();renderGeometry();}
function vecFields(label,key,values,step=50){return `<label>${label}</label><div class="vec">${['N','E','H'].map((k,i)=>`<label>${k}<input type="number" data-key="${key}" data-axis="${i}" value="${Number(values[i].toFixed(2))}" step="${step}"></label>`).join('')}</div>`;}
let renderingEditor=false;
function renderEditor(){if(renderingEditor)return;renderingEditor=true;try{ensureSettings();
 $('airframe').value=project.airframe;$('speedMode').value=project.fixedSpeed===null?'waypoints':'fixed';$('fixedSpeedRow').hidden=project.fixedSpeed===null;if(project.fixedSpeed!==null)$('fixedSpeed').value=project.fixedSpeed;
 renderPresetSelection();$('showTeacher').closest('label').hidden=!currentBundle()?.teacher?.trace;document.querySelector('[data-camera="teacher"]').hidden=!currentBundle()?.teacher?.trace;
 $('sceneName').value=project.name;$('obCount').textContent=project.obstacles.length;$('pointCount').textContent=project.points.length;$('undo').disabled=!history.length;
 $('objectList').innerHTML=project.obstacles.map((o,i)=>`<button data-object="${i}" class="${i===selected?'active':''}"><span>${safe(o.name)}</span><em>${OBSTACLE_TYPES[o.kind].label}</em></button>`).join('')||'<p class="hint">添加第一个障碍物，开始布置场景。</p>';
 const o=project.obstacles[selected];$('objectForm').innerHTML=o?`<div class="fields"><label>物件名称</label><input id="objectName" value="${safe(o.name)}"><label>物件形状</label><select id="objectKind">${Object.entries(OBSTACLE_TYPES).map(([key,v])=>`<option value="${key}" ${o.kind===key?'selected':''}>${v.label}</option>`).join('')}</select>${vecFields('中心位置 / m','position',o.position)}${vecFields('外形尺寸 / m','size',o.size)}${vecFields('平移速度 / m/s','velocity',o.velocity,1)}<div class="twocol"><button id="focusObject">定位物件</button><button id="duplicate">复制</button><button id="deleteObject">删除</button></div></div>`:'';
 $('pointList').innerHTML=project.points.map((p,i)=>`<button data-point="${i}" class="${i===selectedPoint?'active':''}"><span>P${String(i+1).padStart(2,'0')}</span><em>${p.map(v=>Math.round(v)).join(' / ')}</em></button>`).join('');
 $('pointForm').innerHTML=`<div class="fields">${vecFields('选中航路点 / m','point',project.points[selectedPoint]||project.points[0])}<label for="pointSpeed">航点目标速度 / m/s</label><input id="pointSpeed" type="number" min="100" max="350" step="10" value="${project.waypointSpeeds[selectedPoint]}"><small>${project.fixedSpeed===null?'沿程插值至下一航点；范围 100–350 m/s':'当前采用固定目标速度，关闭后恢复航点设置'}</small><div class="twocol"><button id="earlier">↑ 前移</button><button id="later">↓ 后移</button><button id="deletePoint">删除点</button></div></div>`;
 $('modeBadge').textContent=mode==='preview'?'参考路线预览 · 尚未实际飞行':'';$('modeBadge').hidden=mode!=='preview';$('viewTitle').textContent=project.name;
 const chase=project.chase?.enabled;$('chaseSettings').hidden=!chase;$('fleetHUD').hidden=!chase;$('chaseCount').value=project.chase?.count||4;$('fleetCount').textContent=project.chase?.count||4;document.querySelectorAll('[data-camera="fleet"],[data-camera="chaser"]').forEach(b=>b.hidden=!chase);if(chase)$('modeBadge').textContent=(mode==='archive'?'J-20 原始记录':mode==='computed'?'J-20 计算记录':'J-20 参考动画')+' · J-10 预设追逐动画';
 flightControls();
 $('integrity').textContent='地形为装饰 · 障碍不输入控制器 · 飞机显示放大';
 $('objectList').querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=+b.dataset.object;renderEditor();highlight();});$('pointList').querySelectorAll('button').forEach(b=>b.onclick=()=>{selectedPoint=+b.dataset.point;renderEditor();renderHandles();});
 $('objectName')?.addEventListener('change',e=>{snapshot();o.name=e.target.value.slice(0,100);edited();});
 $('objectForm').querySelectorAll('[data-key]').forEach(input=>input.onchange=()=>{const v=Number(input.value),key=input.dataset.key,axis=+input.dataset.axis;if(!Number.isFinite(v)||Math.abs(v)>1e6||(key==='size'&&(v<=0||v>29999))){toast('请输入有效数值；尺寸须大于 0。');renderEditor();return;}snapshot();o[key][axis]=v;edited();});
 $('pointForm').querySelectorAll('[data-key]').forEach(input=>input.onchange=()=>{const v=Number(input.value);if(!Number.isFinite(v)||Math.abs(v)>1e6){renderEditor();return;}snapshot();project.points[selectedPoint][+input.dataset.axis]=v;edited(true);});
 $('pointSpeed').onchange=e=>{const v=Number(e.target.value);if(!Number.isFinite(v)||v<100||v>350){toast('请输入 100–350 m/s 的目标速度');renderEditor();return;}snapshot();project.waypointSpeeds[selectedPoint]=v;edited(true);};
 if(o){$('objectKind').onchange=e=>{snapshot();o.kind=e.target.value;edited();};$('focusObject').onclick=()=>focus(world(obstacleAt(o,clock)),Math.max(...o.size)*2.5);$('duplicate').onclick=()=>{if(project.obstacles.length>=100)return; snapshot();const n=clone(o);n.id=crypto.randomUUID();n.name+=' 副本';n.position[1]+=300;project.obstacles.push(n);selected=project.obstacles.length-1;edited();};$('deleteObject').onclick=()=>{snapshot();project.obstacles.splice(selected,1);selected=Math.max(0,selected-1);edited();};}
 $('deletePoint').onclick=()=>{if(project.points.length<=2)return toast('至少保留两个航路点');snapshot();project.points.splice(selectedPoint,1);project.waypointSpeeds.splice(selectedPoint,1);selectedPoint=Math.max(0,selectedPoint-1);edited(true);};for(const [id,d]of [['earlier',-1],['later',1]])$(id).onclick=()=>{const j=selectedPoint+d;if(j<0||j>=project.points.length)return;snapshot();[project.points[j],project.points[selectedPoint]]=[project.points[selectedPoint],project.points[j]];[project.waypointSpeeds[j],project.waypointSpeeds[selectedPoint]]=[project.waypointSpeeds[selectedPoint],project.waypointSpeeds[j]];selectedPoint=j;edited(true);};
}finally{renderingEditor=false;}}
function makeLine(points,color){return new T.Line(new T.BufferGeometry().setFromPoints(points.map(world)),new T.LineBasicMaterial({color,transparent:true,opacity:.88}));}
function renderHandles(){handles.children.slice().forEach(dispose);if(tab!=='route')return;project.points.forEach((p,i)=>{const s=new T.Mesh(new T.SphereGeometry(i===selectedPoint?55:35,12,8),new T.MeshBasicMaterial({color:i===selectedPoint?0xffe4a9:0xe6c591,depthTest:false}));s.position.copy(world(p));s.userData.point=i;s.renderOrder=10;handles.add(s);});}
function highlight(){if(selectionBox){dispose(selectionBox);selectionBox=null;}if(tab==='obstacle'&&objects[selected]){selectionBox=new T.BoxHelper(objects[selected],0xe6c591);selectionBox.material.transparent=true;selectionBox.material.opacity=.7;scene.add(selectionBox);}}
function renderGeometry(){
 fleet.rebuild(trace,project.chase);lastFleetTarget=null;
 obstacleGroup.children.slice().forEach(dispose);objects=project.obstacles.map(o=>{const mesh=obstacleMesh(o),label=tag(o.name);label.position.set(0,o.size[2]/2+120,0);mesh.add(label);obstacleGroup.add(mesh);return mesh;});if(routeLine)dispose(routeLine);const refs=currentBundle()?.request.positions||smoothRoute(project.points,40).positions;routeLine=makeLine(refs,0xe6c591);routeLine.material.dispose();routeLine.material=new T.LineDashedMaterial({color:0xe6c591,dashSize:80,gapSize:55,transparent:true,opacity:.95});routeLine.computeLineDistances();scene.add(routeLine);renderHandles();highlight();events=mode==='computed'?['student','teacher'].flatMap(k=>currentBundle()?.[k]?.trace?encounters(currentBundle()[k].trace,project.obstacles).map(e=>({...e,role:k,name:(k==='student'?'学生 · ':'教师 · ')+e.name})):[]):encounters(trace,project.obstacles);$('chapters').innerHTML=events.map((e,i)=>`<button data-event="${i}" title="跳到 ${safe(e.name)} 附近">${String(i+1).padStart(2,'0')} · ${e.time.toFixed(1)}s</button>`).join('');$('chapters').querySelectorAll('button').forEach(b=>b.onclick=()=>{clock=Math.max(0,events[+b.dataset.event].time-4);cameraMode='context';setCameraButtons();playing=false;});updateAt();
}
function renderFlight(){if(flightOverview)dispose(flightOverview);flightOverview=makeLine(trace.position,0x9cf5d8);flightOverview.material.opacity=.85;scene.add(flightOverview);if(flightLine)dispose(flightLine);if(teacherLine)dispose(teacherLine);flightLine=makeLine(trace.position,0x9cf5d8);scene.add(flightLine);const tt=currentBundle()?.teacher?.trace;teacherLine=tt?makeLine(tt.position,0xffa366):null;if(teacherLine)scene.add(teacherLine);$('timeline').max=totalTime();}
function resetLandscape(){if(land){scene.remove(land.group);disposeGroup(land.group);}land=buildLandscape({position:trace.position.concat(currentBundle()?.teacher?.trace?.position||[]),reference:currentBundle()?.request.positions||smoothRoute(project.points,40).positions});land.route.visible=false;land.trail.visible=false;scene.add(land.group);}

function focus(target,d=2200){cameraMode='orbit';controls.enabled=true;setCameraButtons();controls.target.copy(target);camera.position.copy(target).add(new T.Vector3(d*.7,d*.45,d*.65));controls.update();}
function fit(){
 const points=trace.position.concat(currentBundle()?.teacher?.trace?.position||[],project.points,project.obstacles.flatMap(o=>[o.position.map((v,k)=>v-o.size[k]/2),o.position.map((v,k)=>v+o.size[k]/2)])).map(world);
 const bounds=new T.Box3().setFromPoints(points),center=bounds.getCenter(new T.Vector3()),direction=new T.Vector3(.7,1.05,.65).normalize(),right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),direction).normalize(),up=new T.Vector3().crossVectors(direction,right);
 cameraMode='orbit';controls.enabled=true;setCameraButtons();camera.zoom=1;camera.updateProjectionMatrix();
 const tanY=Math.tan(camera.fov*Math.PI/360),tanX=tanY*camera.aspect;
 let distance=3000;for(const p of points){const q=p.clone().sub(center),depth=q.dot(direction);distance=Math.max(distance,depth+Math.abs(q.dot(right))/(tanX*.68),depth+Math.abs(q.dot(up))/(tanY*.62));}
 const target=center.clone().addScaledVector(right,distance*tanX*.1).addScaledVector(up,-distance*tanY*.07);
 controls.target.copy(target);camera.position.copy(target).addScaledVector(direction,distance);controls.update();
}
function setCameraButtons(){$('moveSpeedRow').hidden=!['orbit','free'].includes(cameraMode);$('camera-hint').textContent=['orbit','free'].includes(cameraMode)?'WASD 平移 · Q/E 升降 · Shift 加速 · 右侧调整移速':'拖动环视 · 滚轮缩放';document.querySelectorAll('[data-camera]').forEach(b=>b.classList.toggle('active',b.dataset.camera===cameraMode));}
function selectTab(value){tab=value;$('tabObstacle').classList.toggle('active',tab==='obstacle');$('tabRoute').classList.toggle('active',tab==='route');$('obstaclePanel').hidden=tab!=='obstacle';$('routePanel').hidden=tab!=='route';renderHandles();highlight();}
async function loadRecord(id){revision++;const token=++loadRecord.token;const r=catalog.cases.find(c=>c.id===id),[t,a]=await Promise.all([fetch(r.data).then(r=>r.json()),fetch(r.acmi).then(r=>r.text())]);if(token!==loadRecord.token)return;validateTrace(t);record=r;archiveTrace=t;trace=t;original=a;project=seedScene(t,r);result=null;mode='archive';clock=0;playing=false;selected=selectedPoint=0;history=[];keepStudentFlight();renderFlight();renderEditor();renderGeometry();resetLandscape();fit();clock=Math.max(0,(events[0]?.time||5)-4);updateAt();cameraMode='follow';setCameraButtons();const h=trace.hprv[Math.min(trace.hprv.length-1,Math.round(clock/.2))][0];camera.position.copy(plane.position).add(new T.Vector3(-Math.sin(h)*650+Math.cos(h)*280,240,Math.cos(h)*650+Math.sin(h)*280));controls.target.copy(plane.position);controls.update();persist();}
loadRecord.token=0;
function newSandbox(){revision++;loadRecord.token++;project=sandbox();project.name='山谷航路 · 自定义场景';project.points=[[120,80,5000],[1800,80,5000],[3600,160,5020],[5400,240,5040],[7200,240,5040]];actualFlight=null;record=null;original='';result=null;mode='preview';trace=routePreview();ensureSettings();selectAircraft();history=[];clock=0;playing=false;selected=selectedPoint=0;renderFlight();renderEditor();renderGeometry();resetLandscape();fit();persist();}
function updateAt(){
 if(!trace)return;
 const b=currentBundle(),st=mode==='computed'?b?.student?.trace:null,tt=mode==='computed'?b?.teacher?.trace:null;
 const student=sample(st||trace,clock),teacher=sample(tt,clock),p=world(student.position),previous=plane.position.clone(),h=student.hprv,i=student.i;
 plane.position.copy(p);plane.quaternion.copy(attitude((st||trace).hprv[student.i])).slerp(attitude((st||trace).hprv[student.j]),student.f);
 if(flightOverview)flightOverview.visible=!!st&&$('showStudent').checked;plane.visible=!!st&&$('showStudent').checked;flightLine.visible=!!st&&$('showStudent').checked;flightLine.geometry.setDrawRange(0,Math.max(1,student.i+1));
 teacherPlane.visible=!!teacher&&$('showTeacher').checked;if(teacher){teacherPlane.position.copy(world(teacher.position));teacherPlane.quaternion.copy(attitude(tt.hprv[teacher.i])).slerp(attitude(tt.hprv[teacher.j]),teacher.f);teacherLine.geometry.setDrawRange(0,Math.max(1,teacher.i+1));}if(teacherLine)teacherLine.visible=teacherPlane.visible;
 if(routeLine)routeLine.visible=$('showReference').checked;
 objects.forEach((mesh,k)=>mesh.position.copy(world(obstacleAt(project.obstacles[k],clock))));selectionBox?.update();
 const target=cameraMode==='teacher'&&teacher?teacherPlane.position:p;
 if(['follow','teacher'].includes(cameraMode)){const delta=target.clone().sub(cameraMode==='teacher'?(updateAt.lastTeacher||target):previous);camera.position.add(delta);controls.target.copy(target);}
 else if(cameraMode==='director'){const c=teacher?p.clone().lerp(teacherPlane.position,.5):p,d=Math.max(1100,teacher?p.distanceTo(teacherPlane.position)*1.8:1100),a=clock*.035;controls.target.lerp(c,.1);camera.position.lerp(c.clone().add(new T.Vector3(Math.cos(a)*d,d*.45,Math.sin(a)*d)),.035);}
 else if(cameraMode==='context'&&events.length){const e=events.reduce((a,b)=>Math.abs(a.time-clock)<Math.abs(b.time-clock)?a:b),o=project.obstacles.find(o=>o.id===e.id);if(o){const c=world(obstacleAt(o,clock)).lerp(p,.55),d=Math.max(p.distanceTo(world(obstacleAt(o,clock)))*1.2,...o.size.map(v=>v*1.7),1700);controls.target.lerp(c,.09);camera.position.lerp(c.clone().add(new T.Vector3(d*.8,d*.38,d*.65)),.045);}}
 updateAt.lastTeacher=teacherPlane.position.clone();
 const watched=cameraMode==='teacher'&&tt?tt:st,ws=sample(watched,clock),wp=ws?.position,wh=ws?.hprv;
 $('telemetryRole').textContent=cameraMode==='teacher'?'教师 MPC/CEM':'学生 RL baseline';
 $('speed').textContent=wh?wh[3].toFixed(0):'—';$('alt').textContent=wp?wp[2].toFixed(0):'—';$('g').textContent=watched?.g?.[ws?.i]?.toFixed(2)??'—';$('cte').textContent=watched?.cte?.[ws?.i]?.toFixed(1)??'—';
 $('attitude').textContent=wh?`滚转 ${(wh[2]*180/Math.PI).toFixed(1)}°　俯仰 ${(wh[1]*180/Math.PI).toFixed(1)}°`:'姿态等待真实计算';$('angles').textContent=watched?`迎角 ${watched.alpha?.[ws.i]?.toFixed(1)??'—'}°　侧滑 ${watched.beta?.[ws.i]?.toFixed(1)??'—'}°`:'参考路线仅作几何预览';
 $('studentStatus').textContent=st?(student.ended?'回放结束 · ':'回放 ')+Math.min(clock,st.time.at(-1)).toFixed(1)+' / '+st.time.at(-1).toFixed(1)+' s':statusText(b?.student);$('teacherStatus').textContent=tt?(teacher.ended?'回放结束 · ':'回放 ')+Math.min(clock,tt.time.at(-1)).toFixed(1)+' / '+tt.time.at(-1).toFixed(1)+' s':statusText(b?.teacher);
 $('time').textContent=`${clock.toFixed(1)} / ${totalTime().toFixed(1)} s`;$('timeline').value=clock;$('play').textContent=playing?'Ⅱ':'▶';
 if(events.length){const e=events.reduce((a,b)=>Math.abs(a.time-clock)<Math.abs(b.time-clock)?a:b);$('encounterName').textContent=e.name;$('encounterText').textContent=(project.preset?project.preset.description+' ':'')+`${e.time.toFixed(1)} s 最近接近。${e.intersects?'轨迹中心线与运动包围盒连续相交。':'采样点至包围盒最近 '+Math.round(e.distance)+' m。'}仅为场景诊断，不改变飞行，也不代表自动避障。`;}
 else{$('encounterName').textContent='同一条路线 · 两套真实控制器';$('encounterText').textContent='学生与教师独立执行。暂停、拖动时间轴，或切换跟随对象观察差异。';}
}
const nav=new CameraNavigation(camera,$('canvas'),{isFree:()=>cameraMode==='free',canMove:()=>['orbit','free'].includes(cameraMode),isBlocked:()=>!['orbit','free'].includes(cameraMode)||!!drag||drawing,isPointerBlocked:()=>cameraMode!=='free'||!!drag,onMove:delta=>{if(cameraMode==='orbit')controls.target.add(delta);},onReset:()=>{if(cameraMode==='orbit')fit();else nav.syncFree();nav.resetZoom();},onToggle:()=>setView(cameraMode==='free'?'orbit':'free')});
$('canvas').addEventListener('pointerdown',()=>{$('canvas').focus({preventScroll:true});});
function setView(value){cameraMode=value;controls.enabled=value!=='free';nav.clear();setCameraButtons();if(value==='free')nav.syncFree();if(value==='orbit')fit();if(['follow','teacher'].includes(value)){const p=value==='teacher'?teacherPlane.position:plane.position;controls.target.copy(p);camera.position.copy(p).add(new T.Vector3(250,105,210));}}

function animate(now){const dt=Math.min((now-lastFrame)/1000,.1);lastFrame=now;if(playing&&trace){clock=Math.min(totalTime(),clock+dt*Number($('rate').value));if(clock>=totalTime())playing=false;}updateAt();if(['free','orbit'].includes(cameraMode))nav.update(dt);if(cameraMode!=='free')controls.update();renderer.render(scene,camera);requestAnimationFrame(animate);}requestAnimationFrame(animate);
new ResizeObserver(()=>{const r=$('viewport').getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.render(scene,camera);}).observe($('viewport'));
$('moveSpeed').onchange=e=>nav.speed=Number(e.target.value);
$('airframe').onchange=e=>{snapshot();project.airframe=e.target.value;selectAircraft();persist();updateAt();};
$('speedMode').onchange=e=>{snapshot();project.fixedSpeed=e.target.value==='fixed'?Number($('fixedSpeed').value):null;edited(true);};
$('fixedSpeed').onchange=e=>{const v=Number(e.target.value);if(!Number.isFinite(v)||v<100||v>350){toast('请输入 100–350 m/s 的目标速度');renderEditor();return;}snapshot();project.fixedSpeed=v;edited(true);};
$('play').onclick=()=>{if(clock>=totalTime())clock=0;playing=!playing;};$('restart').onclick=()=>{clock=0;playing=false;};$('timeline').oninput=e=>{clock=+e.target.value;playing=false;};$('rate').onchange=()=>{};
document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>setView(b.dataset.camera));
controls.addEventListener('start',()=>{if(['fleet','chaser'].includes(cameraMode))fleetManual=true;});
$('full').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(e=>toast(e.message));};$('present').onclick=()=>{document.body.classList.toggle('present');$('present').textContent=document.body.classList.contains('present')?'返回编辑':'演示模式';};
$('tabObstacle').onclick=()=>selectTab('obstacle');$('tabRoute').onclick=()=>selectTab('route');$('sceneName').onchange=e=>{snapshot();project.name=e.target.value.slice(0,100)||'我的场景';edited();};$('sandbox').onclick=newSandbox;$('archive').onclick=()=>{$('records').hidden=!$('records').hidden;};$('records').onchange=e=>loadRecord(e.target.value).catch(e=>toast(e.message));
document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{if(project.obstacles.length>=100)return toast('最多 100 个障碍物');snapshot();const p=trace.position[Math.floor(trace.position.length*.45)],kind=b.dataset.add,definition=OBSTACLE_TYPES[kind];project.obstacles.push({id:crypto.randomUUID(),kind,name:definition.label+' '+(project.obstacles.length+1),position:[p[0],p[1]+550,definition.air?p[2]:Math.min(...trace.position.map(v=>v[2]))-1800+definition.size[2]/2],size:[...definition.size],velocity:[0,0,0]});selected=project.obstacles.length-1;selectTab('obstacle');edited();});

async function openChaseDemo(){await loadRecord('keeper_032_0');project.name='多机追逐 · J-20 / J-10';project.obstacles=[];project.chase={enabled:true,count:4};selected=0;clock=10;edited();cameraMode='fleet';fleetManual=false;lastFleetTarget=null;setCameraButtons();playing=true;toast('已载入四架 J-10 的预设追逐情境；J-20 使用原始记录。');}
$('chaseDemo').onclick=()=>openChaseDemo().catch(e=>toast(e.message));
$('chaseCount').onchange=e=>{snapshot();project.chase={enabled:true,count:Number(e.target.value)};edited();fleetManual=false;};
$('chaseOff').onclick=()=>{snapshot();project.chase={enabled:false,count:project.chase?.count||4};cameraMode='orbit';edited();fit();};

$('addPoint').onclick=()=>{if(project.points.length>=200)return toast('最多 200 个航路点');snapshot();const p=project.points[selectedPoint],next=project.points[selectedPoint+1];project.points.splice(selectedPoint+1,0,next?mix(p,next,.5):[p[0]+1000,p[1],p[2]]);project.waypointSpeeds.splice(selectedPoint+1,0,next?(project.waypointSpeeds[selectedPoint]+project.waypointSpeeds[selectedPoint+1])/2:project.waypointSpeeds[selectedPoint]);selectedPoint++;edited(true);};$('fitRoute').onclick=fit;
$('draw').onclick=()=>{drawing=!drawing;$('draw').classList.toggle('active',drawing);toast(drawing?'点击当前编辑平面添加航路点；再次点击按钮结束。':'已结束加点');};
function editPlane(){const planeType=$('plane').value,v=Number($('planeValue').value);return planeType==='NE'?new T.Plane(new T.Vector3(0,1,0),-v):planeType==='NH'?new T.Plane(new T.Vector3(1,0,0),-v):new T.Plane(new T.Vector3(0,0,-1),-v);}
$('plane').onchange=()=>{const type=$('plane').value,p=project.points[selectedPoint],v=type==='NE'?p[2]:type==='NH'?p[1]:p[0];$('planeLabel').firstChild.textContent='固定 '+(type==='NE'?'H':type==='NH'?'E':'N')+' ';$('planeValue').value=Math.round(v);cameraMode='orbit';setCameraButtons();const target=world(p),d=8000;controls.target.copy(target);camera.position.copy(target).add(type==='NE'?new T.Vector3(0,d,1):type==='NH'?new T.Vector3(d,1,0):new T.Vector3(0,1,-d));controls.update();};
function ray(e){const r=$('canvas').getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);}
function beginDrag(e,kind,index,position,axis){
 playing=false;cameraMode='orbit';setCameraButtons();controls.update();const normal=axis==='NH'?new T.Vector3(1,0,0):axis==='EH'?new T.Vector3(0,0,-1):new T.Vector3(0,1,0),dragPlane=new T.Plane().setFromNormalAndCoplanarPoint(normal,position),hit=new T.Vector3();
 const valid=!!raycaster.ray.intersectPlane(dragPlane,hit);
 drag={kind,index,axis,plane:dragPlane,hit:valid?hit:null,initial:kind==='obstacle'?[...project.obstacles[index].position]:[...project.points[index]],world:position.clone(),start:[e.clientX,e.clientY],metresPerPixel:2*camera.position.distanceTo(position)*Math.tan(camera.fov*Math.PI/360)/$('canvas').clientHeight,moved:false,pointerId:e.pointerId};
 controls.enabled=false;$('canvas').classList.add('dragging');$('canvas').setPointerCapture(e.pointerId);
}
$('canvas').addEventListener('pointerdown',e=>{if(e.button!==0||!project||cameraMode==='free')return;down=[e.clientX,e.clientY];ray(e);
 if(tab==='route'&&!drawing){const hit=raycaster.intersectObjects(handles.children)[0];if(hit){selectedPoint=hit.object.userData.point;beginDrag(e,'point',selectedPoint,world(project.points[selectedPoint]),$('plane').value);renderEditor();renderHandles();return;}}
 if(!drawing){const hit=raycaster.intersectObjects(objects,true).find(h=>h.object.isMesh&&h.object.userData.obstacle);if(hit){selected=project.obstacles.findIndex(o=>o.id===hit.object.userData.obstacle);selectTab('obstacle');const axis=e.shiftKey?'H':$('dragAxis').value;beginDrag(e,'obstacle',selected,world(obstacleAt(project.obstacles[selected],clock)),axis);renderEditor();highlight();}}
},true);
$('canvas').addEventListener('pointermove',e=>{
 if(!drag){if(project&&!drawing){ray(e);$('canvas').classList.toggle('draggable',raycaster.intersectObjects(objects,true).some(h=>h.object.isMesh));}return;}
 if(Math.hypot(e.clientX-drag.start[0],e.clientY-drag.start[1])<3&&!drag.moved)return;
 let delta=new T.Vector3();if(drag.axis==='H'){delta.y=(drag.start[1]-e.clientY)*drag.metresPerPixel;}else{ray(e);const hit=new T.Vector3();if(!drag.hit||!raycaster.ray.intersectPlane(drag.plane,hit))return;delta.copy(hit).sub(drag.hit);if(drag.axis==='N')delta.set(0,0,delta.z);if(drag.axis==='E')delta.set(delta.x,0,0);}
 if(!drag.moved){snapshot();drag.moved=true;}
 const value=[drag.initial[0]-delta.z,drag.initial[1]+delta.x,drag.initial[2]+delta.y].map(x=>Math.round(Math.max(-999999,Math.min(999999,x))));
 if(drag.kind==='obstacle'){project.obstacles[drag.index].position=value;objects[drag.index].position.copy(world(obstacleAt(project.obstacles[drag.index],clock)));$('objectForm').querySelectorAll('[data-key="position"]').forEach((input,i)=>input.value=value[i]);selectionBox?.update();}else{project.points[drag.index]=value;handles.children[drag.index].position.copy(world(value));}
});
function endDrag(e,cancel=false){if(!drag)return false;const d=drag;drag=null;controls.enabled=true;$('canvas').classList.remove('dragging');if($('canvas').hasPointerCapture(d.pointerId))$('canvas').releasePointerCapture(d.pointerId);if(d.moved){if(cancel){project=history.pop();renderEditor();renderGeometry();}else edited(d.kind==='point');}return true;}
$('canvas').addEventListener('pointerup',e=>{if(endDrag(e))return;if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;ray(e);if(tab==='route'&&drawing){if(project.points.length>=200)return;const p=new T.Vector3();if(raycaster.ray.intersectPlane(editPlane(),p)){snapshot();project.points.push([-p.z,p.x,p.y].map(Math.round));project.waypointSpeeds.push(project.waypointSpeeds.at(-1));selectedPoint=project.points.length-1;edited(true);}}});
$('canvas').addEventListener('pointercancel',e=>endDrag(e,true));
$('canvas').addEventListener('lostpointercapture',e=>{if(drag)endDrag(e,true);});

$('undo').onclick=()=>{if(!history.length)return;const previous=history.pop(),routeChanged=flightKey(previous)!==routeKey();project=previous;ensureSettings();selectAircraft();selected=Math.max(0,Math.min(selected,project.obstacles.length-1));selectedPoint=Math.min(selectedPoint,project.points.length-1);if(!routeChanged){edited();return;}if(studentFlight()){showStudentFlight();edited();}else edited(true);};
$('actual').onclick=showStudentFlight;
$('preview').onclick=()=>{mode='preview';trace=routePreview();clock=0;playing=true;renderFlight();renderEditor();renderGeometry();};
function exportProject(){const f=studentFlight();return {...clone(project),flight:f?{kind:'dual-result',result:f.result}:null};}
$('save').onclick=()=>download(JSON.stringify(exportProject(),null,2),'SKYBOUND-scene.json');$('import').onclick=()=>$('file').click();
async function restoreProject(raw){
 const p=validateProject(raw);revision++;loadRecord.token++;
 const b=raw.flight?.kind==='dual-result'?raw.flight.result:null;
 if(raw.flight&&!b)throw Error('旧单机结果不能作为真实飞行对比，请导入路线后重新计算');
 if(b)validateBundle(b,p.points,p);
 delete p.flight;delete p._draftId;delete p._missingComputedFlight;
 project=p;ensureSettings();selectAircraft();actualFlight=null;history=[];selected=selectedPoint=0;clock=0;playing=false;record=null;original='';
 if(b)acceptBundle(b);else{result=null;mode='preview';trace=routePreview();renderFlight();renderEditor();renderGeometry();resetLandscape();fit();persist();}return true;
}
$('file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>40*1024*1024)throw Error('项目文件超过 40 MB');const raw=JSON.parse(await file.text());if(raw.schema?.startsWith('a4.custom.')&&raw.points){snapshot();project.points=raw.points;project.waypointSpeeds=raw.points.map(()=>250);project=validateProject(project);edited(true);fit();toast('已导入参考网站的航路点；需要计算 RL baseline 飞行。');return;}if(await restoreProject(raw))toast(studentFlight()?'已恢复场景与真实飞行对比记录。':'已恢复场景；请计算学生和教师。');}catch(err){toast('导入失败：'+err.message);}finally{$('file').value='';}};

function renderPresetSelection(){
 if(!project)return;
 document.querySelectorAll('[data-preset]').forEach(b=>{const active=b.dataset.preset===project.preset?.id;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 $('presetSummary').textContent=project.preset?.description||'选择一个场景，加载对应参考路线、实际飞行记录和障碍布景。';
}
async function loadPreset(id){
 const item=presetCatalog.find(x=>x.id===id);if(!item)throw Error('没有找到这个场景');
 const token=++presetToken;const r=await fetch(item.file);if(!r.ok)throw Error('场景载入失败');const data=await r.json();if(token!==presetToken)return;
 await restoreProject(data);clock=totalTime()*.12;playing=false;updateAt();setView('orbit');
 $('computeStatus').textContent='已载入参考路线、实际飞行记录与 '+project.obstacles.length+' 个场景物件。点击播放即可演示。';
 const url=new URL(location.href);url.searchParams.set('scene',id);historyReplace(url);
}
function historyReplace(url){window.history.replaceState(null,'',url);}
async function initPresets(){
 const r=await fetch('data/scenes/catalog.json');if(!r.ok)throw Error('默认场景目录载入失败');presetCatalog=await r.json();
 $('presetList').innerHTML=presetCatalog.map(x=>`<button class="preset" data-preset="${safe(x.id)}" aria-pressed="false"><img src="${safe(x.thumbnail)}" alt="${safe(x.route)}"><b>${safe(x.title)}</b><span>${safe(x.route)}</span><small>${x.seconds.toFixed(0)} s · ${x.obstacles} 个场景物件${x.teacher?' · 含教师':''}</small></button>`).join('');
 $('presetList').querySelectorAll('button').forEach(b=>b.onclick=()=>loadPreset(b.dataset.preset).catch(e=>toast(e.message)));
}
$('demoResult').onclick=()=>loadPreset('gentle-valley').catch(e=>toast(e.message));
async function api(path,data){if(STATIC_HOST)throw Error('独立演示站尚未接入在线重算服务。可保存项目或导入已有飞行结果。');const response=await fetch('/api/lab/'+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});if(!response.headers.get('content-type')?.includes('application/json'))throw Error('服务连接失败或登录已失效，请刷新页面');const body=await response.json();if(!response.ok)throw Error(body.error||'计算服务请求失败');return body;}
async function pollJob(){
 if(!activeJob)return;
 try{const j=await api('jobs/'+activeJob.id);j.message=String(j.message||j.status).replace(/9a/g,'RL baseline').replace(/双基线/g,'飞行对比').replace(/A4/gi,'固定翼');$('computeStatus').textContent=j.message;
 if(j.result&&['completed','partial','error','cancelled'].includes(j.status)){
  if(computeRevision===routeKey())acceptBundle(j.result);else{download(JSON.stringify(j.result),'SKYBOUND-result-other-route.json');toast('路线已修改；原请求结果已单独下载，不会套用到当前路线。');}
  finishCompute(j.message||'计算结束，已保留真实结果');return;
 }
 if(['error','cancelled'].includes(j.status)){finishCompute(j.message||'计算结束，未产生双机轨迹');return;}
 }catch(e){$('computeStatus').textContent='连接中断，保留任务并重试：'+e.message;}
 pollTimer=setTimeout(pollJob,2500);
}
$('compute').onclick=async()=>{if(busy)return;busy=true;computeRevision=routeKey();$('compute').disabled=true;$('cancel').hidden=false;playing=false;flightControls();$('computeStatus').textContent='正在提交同路线、同配平初态的飞行对比任务…';try{const r=smoothRoute(project.points,40);const j=await api('jobs',{name:project.name,control_points:clone(project.points),positions:r.positions,control_segments:r.controlSegments,waypoint_speeds:[...project.waypointSpeeds],fixed_speed:project.fixedSpeed});activeJob=j;localStorage.setItem('skybound-active-job',JSON.stringify({id:j.id,pointsKey:computeRevision}));pollJob();}catch(e){finishCompute(e.message);}};
function finishCompute(message){clearTimeout(pollTimer);activeJob=null;localStorage.removeItem('skybound-active-job');busy=false;$('compute').disabled=false;$('cancel').hidden=true;$('computeStatus').textContent=message;flightControls();toast(message);}
$('cancel').onclick=async()=>{if(!activeJob)return;try{await api('cancel',{id:activeJob.id});$('computeStatus').textContent='已请求取消，等待当前控制步结束并保存真实部分轨迹…';}catch(e){toast(e.message);}};
$('export').onclick=async()=>{const b=currentBundle();try{exporting=true;flightControls();download(zipFiles(await sceneFiles(exportProject(),b)),'SKYBOUND-Scene-Tacview.zip');toast('已导出本场景的飞行记录、参考路线和障碍模型。');}catch(e){toast('导出失败：'+e.message);}finally{exporting=false;flightControls();}};
$('acmi').onclick=()=>{try{download(dualAcmi({...project,obstacles:[]},currentBundle()),'SKYBOUND-Flight.acmi','text/plain');}catch(e){toast(e.message);}};
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.code==='Space'){e.preventDefault();$('play').click();}if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();$('undo').click();}});
try{await initPresets();const requested=new URL(location.href).searchParams.get('scene'),saved=await loadDraft();if(requested&&presetCatalog.some(p=>p.id===requested))await loadPreset(requested);else if(saved)await restoreProject(saved);else await loadPreset(presetCatalog[0].id);}catch(e){toast('恢复失败：'+e.message);newSandbox();}
try{const saved=STATIC_HOST?null:JSON.parse(localStorage.getItem('skybound-active-job'));if(saved?.id){activeJob=saved;computeRevision=saved.pointsKey;busy=true;$('compute').disabled=true;$('cancel').hidden=false;flightControls();pollJob();}}catch{}
for(const id of ['showStudent','showTeacher','showReference'])$(id).onchange=updateAt;
async function refreshService(){if(STATIC_HOST){$('serviceStatus').textContent='可编辑场景、回放记录和导出 · 在线重算暂未接入';$('serviceStatus').dataset.online='false';return;}try{const s=await api('state');$('serviceStatus').textContent=s.online?'计算服务在线 · 单任务顺序执行':'计算服务离线 · 可编辑和回放已存结果';$('serviceStatus').dataset.online=!!s.online;}catch{$('serviceStatus').textContent='计算服务连接失败 · 已存记录仍可回放';}}refreshService();if(!STATIC_HOST)setInterval(refreshService,15000);
window.flightStudio={getState:()=>({project:clone(project),mode,hasStudentFlight:!!currentBundle()?.student?.trace,hasTeacherFlight:!!currentBundle()?.teacher?.trace,trace:clone(trace),bundle:clone(currentBundle()),events:clone(events),time:clock,cameraMode,cameraPosition:camera.position.toArray(),cameraZoom:camera.zoom,cameraTarget:controls.target.toArray(),cameraSpeed:nav.speed,airframe:project.airframe,studentVisible:plane.visible,teacherVisible:teacherPlane.visible,referenceVisible:routeLine?.visible,studentPosition:plane.position.toArray(),teacherPosition:teacherPlane.position.toArray()}),loadPreset,presetIds:()=>presetCatalog.map(x=>x.id),exportObj:objForObstacle,screenPoint:p=>{const v=world(p).project(camera),r=$('canvas').getBoundingClientRect();return [r.left+(v.x+1)*r.width/2,r.top+(1-v.y)*r.height/2];},draftSaved,exportAcmi:(prefix='FlightTest')=>dualAcmi(project,currentBundle(),prefix)};
