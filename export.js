import {buildChaseTracks} from './chase.js';
import {tacviewScene,CHECKPOINT} from './core.js';
import {objForObstacle} from './scene.js';
const xml=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
import {dualAcmi,validateBundle} from './dual.js';
export async function sceneFiles(project,bundle){
 validateBundle(bundle,project.points,project);
 const prefix='SKYBOUND_'+crypto.randomUUID().replaceAll('-','').slice(0,12),files={
  'scene.json':JSON.stringify(project,null,2),'flight.json':JSON.stringify(bundle,null,2),
  'scene.acmi':dualAcmi(project,bundle,prefix),
  'scene-volume.acmi':dualAcmi(project,bundle,prefix,true)
 };
 let database='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<DefaultPropertiesCollection LoadingOrder="10.0">\n';
 project.obstacles.forEach((o,i)=>{const name=prefix+'_'+i;files['Data/Meshes/'+name+'.obj']=objForObstacle(o);database+=`<DefaultProperties Id="${name}" Base="Core.Default"><Criteria><Name>${name}</Name></Criteria><Properties><ShortName>${xml(o.name)}</ShortName><Shape>${name}.obj</Shape><Length>${o.size[0]}</Length><Width>${o.size[1]}</Width><Height>${o.size[2]}</Height></Properties></DefaultProperties>\n`;});
 files['Data/Database/Default Properties/'+prefix+'.xml']=database+'</DefaultPropertiesCollection>\n';
 const hashes={};for(const [path,text]of Object.entries(files)){if(!path.startsWith('Data/'))continue;hashes[path]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('');}
 files['model-manifest.json']=JSON.stringify(hashes,null,2);
 files['Install-Scene.ps1']=`param([switch]$OpenScene)
$ErrorActionPreference = 'Stop'
try {
 if (Get-Process -Name 'Tacview*' -ErrorAction SilentlyContinue) { throw 'Close Tacview completely, then run this installer again. Models are loaded at startup.' }
 $targetRoot = Join-Path $env:APPDATA 'Tacview'
 $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'model-manifest.json') -Raw | ConvertFrom-Json
 $count = 0
 foreach ($entry in $manifest.PSObject.Properties) {
  $relative = $entry.Name.Replace('/',[IO.Path]::DirectorySeparatorChar)
  $source = Join-Path $PSScriptRoot $relative
  if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $entry.Value) { throw "Damaged package: $relative" }
  $destination = Join-Path $targetRoot $relative
  New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination -Force
  if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $entry.Value) { throw "Copy verification failed: $destination" }
  $count++
 }
 "Installed $count verified mesh/database files to $targetRoot" | Tee-Object -FilePath (Join-Path $PSScriptRoot 'INSTALL-RESULT.txt')
 Write-Host 'Restart Tacview and open scene.acmi for the full obstacle models.'
 Write-Host 'scene-volume.acmi also displays full-size obstacle volumes without installing any models.'
 if ($OpenScene) { Start-Process -FilePath (Join-Path $PSScriptRoot 'scene.acmi') }
} catch { $_ | Out-String | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'INSTALL-ERROR.txt'); Write-Host $_ -ForegroundColor Red; exit 1 }
`;
 files['Install-Scene.cmd']='@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Scene.ps1"\r\npause\r\n';
 files['Install-and-Open.cmd']='@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Scene.ps1" -OpenScene\r\npause\r\n';
 files['README.txt']=`SKYBOUND · 通用机动飞行实验室 — Tacview 完整场景

解压 ZIP，完全退出 Tacview。运行 Install-and-Open.cmd 安装 OBJ/XML 并打开 scene.acmi；失败原因见 INSTALL-ERROR.txt。不安装模型时可直接打开 scene-volume.acmi 查看真实尺寸的障碍体积。
对象 100：青色 J-20，冻结 RL baseline GPU 学生真实闭环。
${bundle.teacher?.trace?'对象 200：橙色 Su-57 外形，MPC/CEM 教师真实闭环。':'此例只有学生历史飞行记录，没有教师轨迹；不会导出参考飞机冒充教师。'}
绿色航点链：参考路线，不是飞机，也不是教师。
${bundle.teacher?.trace?'两机从同一真实初态、t=0 开始，':'学生从原始记录 t=0 开始，'}按实际采样写入位置/姿态；提前终止者在最后样本后删除。结束原因见 StopReason 和 flight.json。不会在终止后补飞。
坐标为 NEU 米，ACMI 用经度|纬度|绝对高度|roll|pitch|yaw；角度单位度。每度米数 ${bundle.coordinates.metres_per_degree}，参考经纬度 0/0。网页飞机作显示放大。
障碍物未输入两控制器，连续包围盒相交是后处理；背景地形为装饰且不导出。可编辑障碍包含运动、尺寸、OBJ/XML；地面 OBJ 以底部为原点。
scene.json 可恢复路线、障碍、机型和已有真实飞行记录。flight.json 保存控制器身份、编译来源、初态核对、完整真实样本和失败状态。本演示不是正式研究成功率。

手动安装：合并 Data 至 %APPDATA%/Tacview/Data。卸载仅删除名称以 ${prefix} 开头的本次文件。
服务器验收解析结构、数值和引用；没有 Windows Tacview GUI 的本机视觉验收。
`;

 return files;
}
