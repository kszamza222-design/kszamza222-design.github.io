'use strict';
// Keep the existing target database and target indices intact.
const activeCharacters = new Set();
function updateTrackingStatus() {
  document.getElementById('status').textContent = activeCharacters.size
    ? Array.from(activeCharacters).join(' · ')
    : 'เล็งกล้องให้เห็นภาพครบทั้งรูป';
}
AFRAME.registerComponent('character', {
  schema: {name: {type:'string'}, src: {type:'string'}, size: {default: 1}},
  init() {
    this.tracked = false;
    this.reveal = 0;
    this.wrapper = document.createElement('a-entity');
    this.wrapper.object3D.rotation.x = Math.PI / 2;
    this.el.appendChild(this.wrapper);
    this.model = document.createElement('a-entity');
    this.wrapper.appendChild(this.model);
    this.el.addEventListener('targetFound', () => {
      this.tracked = true; activeCharacters.add(this.data.name); updateTrackingStatus();
    });
    this.el.addEventListener('targetLost', () => {
      this.tracked = false; this.reveal = 0;
      activeCharacters.delete(this.data.name); updateTrackingStatus();
    });
  },
  load() {
    return new Promise((resolve,reject) => {
      this.model.addEventListener('model-loaded', () => {
        try {
          const mesh = this.model.getObject3D('mesh');
          mesh.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(mesh);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const factor = this.data.size / Math.max(size.x,size.y,size.z,0.001);
          this.model.object3D.scale.setScalar(factor);
          this.model.object3D.position.set(-center.x*factor,-box.min.y*factor,-center.z*factor);
          // Animated skinned meshes must not disappear due to rest-pose bounds.
          mesh.traverse(o => {if(o.isMesh){o.frustumCulled=false;}});
          if (mesh.animations && mesh.animations.length) {
            this.mixer = new THREE.AnimationMixer(mesh);
            this.mixer.clipAction(mesh.animations[0]).play();
          }
          this.wrapper.object3D.scale.setScalar(0.001);
          resolve();
        } catch(error) { reject(error); }
      },{once:true});
      this.model.addEventListener('model-error', () => reject(new Error(this.data.name)),{once:true});
      this.model.setAttribute('gltf-model',this.data.src);
    });
  },
  tick(time,delta) {
    if (!this.tracked || document.hidden) return;
    const dt = Math.min(delta/1000,0.05);
    if(this.mixer) this.mixer.update(dt);
    this.reveal = Math.min(1,this.reveal+dt/0.28);
    const scale = 1-Math.pow(1-this.reveal,3);
    this.wrapper.object3D.scale.setScalar(Math.max(0.001,scale));
  },
  remove() { if(this.mixer) this.mixer.stopAllAction(); }
});
window.addEventListener('DOMContentLoaded', () => {
  const scene = document.querySelector('a-scene');
  const start = document.getElementById('start');
  const loading = document.getElementById('loading');
  const intro = document.getElementById('intro');
  const footer = document.getElementById('scan');
  let running=false, busy=false, modelsReady=false;
  function resetCamera(message) {
    running=false; busy=false; intro.hidden=false; footer.hidden=true;
    start.disabled=false; start.textContent='เปิดกล้องอีกครั้ง'; loading.textContent=message;
    activeCharacters.clear();
    document.querySelectorAll('[character]').forEach(el=>{el.components.character.tracked=false;el.components.character.reveal=0;});
  }
  scene.addEventListener('arReady', () => {
    running=true;busy=false;intro.hidden=true;footer.hidden=false;
    updateTrackingStatus(); document.getElementById('live').textContent='● LIVE';
  });
  scene.addEventListener('arError', () => {
    scene.systems['mindar-image-system'].stop();
    resetCamera('เปิดกล้องไม่ได้ กรุณาอนุญาตกล้อง และใช้ Safari หรือ Chrome');
  });
  start.addEventListener('click',async()=>{
    if(busy || !modelsReady)return;
    busy=true;start.disabled=true;start.textContent='กำลังเปิดกล้อง…';
    loading.textContent='กรุณาอนุญาตให้เว็บไซต์ใช้กล้อง';
    try{await scene.systems['mindar-image-system'].start();}
    catch(error){resetCamera('เปิดกล้องไม่สำเร็จ ตรวจสิทธิ์กล้องแล้วลองอีกครั้ง');}
  });
  document.getElementById('pause').addEventListener('click',()=>{
    scene.systems['mindar-image-system'].stop();resetCamera('พักกล้องแล้ว กดเพื่อเริ่มสแกนอีกครั้ง');
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden && running){scene.systems['mindar-image-system'].stop();resetCamera('พักกล้องเมื่อออกจากหน้า กดเพื่อเริ่มต่อ');}
  });
  async function prepare(){
    // Limit pixel ratio and decode sequentially to reduce mobile memory spikes.
    scene.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
    const characters=Array.from(document.querySelectorAll('[character]'));
    try {
      for(let i=0;i<characters.length;i++){
        loading.textContent=`กำลังเตรียม ${characters[i].components.character.data.name} (${i+1}/3)`;
        await characters[i].components.character.load();
        document.getElementById('bar').style.width=`${(i+1)/3*100}%`;
      }
      modelsReady=true;start.disabled=false;start.textContent='เริ่มสแกนภาพ';loading.textContent='พร้อมแล้ว · โหลดโมเดลครบทั้ง 3 ตัว';
    } catch(error){loading.textContent='โหลดโมเดลไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่';start.disabled=false;start.textContent='ลองโหลดใหม่';start.onclick=()=>location.reload();console.error(error);}
  }
  if(scene.hasLoaded)prepare();else scene.addEventListener('loaded',prepare,{once:true});
});
