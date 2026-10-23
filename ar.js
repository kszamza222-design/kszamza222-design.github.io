'use strict';
const visibleCharacters = new Set();
let cameraReady = false, loadedCharacters = 0;
function showStatus() {
  const status = document.getElementById('status');
  if (!status) return;
  const names = Array.from(visibleCharacters);
  status.textContent = names.length ? `กำลังแสดง ${names.join(' · ')}`
    : loadedCharacters < 3 ? `กำลังโหลดโมเดล ${loadedCharacters}/3 · ส่องภาพเดิมได้เลย`
    : cameraReady ? 'สแกนภาพเดิมได้เลย · แสดงได้พร้อมกันทั้ง 3 ตัว' : 'กำลังเปิดกล้อง · กรุณาอนุญาตการใช้กล้อง';
}
AFRAME.registerComponent('character', {
  schema: {name:{type:'string'},src:{type:'string'},size:{default:1}},
  init() {
    this.tracked=false;this.ready=false;
    this.rig=new AFRAME.THREE.Group();this.rig.rotation.x=Math.PI/2;
    this.el.setObject3D('character-rig',this.rig);this.rig.visible=false;
    this.model=document.createElement('a-entity');this.el.appendChild(this.model);
    this.onFound=()=>{this.tracked=true;this.rig.visible=this.ready;visibleCharacters.add(this.data.name);showStatus();};
    this.onLost=()=>{this.tracked=false;this.rig.visible=false;visibleCharacters.delete(this.data.name);showStatus();};
    this.el.addEventListener('targetFound',this.onFound);this.el.addEventListener('targetLost',this.onLost);
  },
  load() {
    if(this.loadPromise)return this.loadPromise;
    this.loadPromise=new Promise((resolve,reject)=>{
      this.model.addEventListener('model-loaded',()=>{
        try {
          const T=AFRAME.THREE, mesh=this.model.getObject3D('mesh');
          // An undetected MindAR anchor has an ALL-ZERO matrix. Measure the
          // imported model in isolation, never underneath the tracking anchor.
          mesh.removeFromParent();mesh.updateMatrixWorld(true);
          const box=new T.Box3().setFromObject(mesh,true);
          const size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
          const extent=Math.max(size.x,size.y,size.z);
          if(!Number.isFinite(extent)||extent<=0)throw new Error('Invalid model bounds');
          const factor=this.data.size/extent;
          // Animation can modify the imported root, but not this separate group.
          this.normalized=new T.Group();this.normalized.scale.setScalar(factor);
          this.normalized.position.set(-center.x*factor,-box.min.y*factor,-center.z*factor);
          this.normalized.add(mesh);this.rig.add(this.normalized);
          mesh.traverse(o=>{if(o.isMesh)o.frustumCulled=false;});
          if(mesh.animations&&mesh.animations.length){
            this.mixer=new T.AnimationMixer(mesh);this.action=this.mixer.clipAction(mesh.animations[0]);
            this.action.setLoop(T.LoopRepeat,Infinity);this.action.play();
          }
          this.modelBounds={extent,factor};this.ready=true;this.rig.visible=this.tracked;
          this.el.emit('character-ready',{name:this.data.name,extent,factor,animated:!!this.mixer});resolve();
        }catch(error){reject(error);}
      },{once:true});
      this.model.addEventListener('model-error',()=>reject(new Error(`โหลด ${this.data.name} ไม่สำเร็จ`)),{once:true});
      this.model.setAttribute('gltf-model',this.data.src);
    });return this.loadPromise;
  },
  tick(time,delta){if(this.ready&&this.tracked&&this.mixer&&!document.hidden)this.mixer.update(Math.min(Math.max(delta||0,0)/1000,0.05));},
  remove(){this.el.removeEventListener('targetFound',this.onFound);this.el.removeEventListener('targetLost',this.onLost);if(this.mixer)this.mixer.stopAllAction();this.el.removeObject3D('character-rig');}
});
window.addEventListener('DOMContentLoaded',()=>{
  const scene=document.querySelector('a-scene');
  if(!scene||document.body.dataset.regression)return;
  const retry=document.getElementById('retry');
  scene.addEventListener('arReady',()=>{cameraReady=true;showStatus();});
  scene.addEventListener('arError',()=>{cameraReady=false;document.getElementById('status').textContent='เปิดกล้องไม่ได้ กรุณาอนุญาตกล้อง แล้วลองอีกครั้ง';retry.hidden=false;});
  retry.addEventListener('click',()=>location.reload());
  async function prepare(){
    scene.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
    const failures=[];
    // Auto-start camera independently; a failed asset must not block the others.
    for(const el of document.querySelectorAll('[character]')){
      try{await el.components.character.load();loadedCharacters++;showStatus();}
      catch(error){failures.push(el.components.character.data.name);console.error(error);}
    }
    if(failures.length){document.getElementById('status').textContent=`โหลดไม่สำเร็จ: ${failures.join(' · ')} กรุณาลองอีกครั้ง`;retry.hidden=false;}
  }
  if(scene.hasLoaded)prepare();else scene.addEventListener('loaded',prepare,{once:true});
  let paused=false;
  document.addEventListener('visibilitychange',()=>{
    const system=scene.systems['mindar-image-system'];if(!cameraReady||!system.controller)return;
    if(document.hidden){system.pause();paused=true;}else if(paused){system.unpause();paused=false;}
  });
});


