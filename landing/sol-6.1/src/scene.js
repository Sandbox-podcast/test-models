import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createBottleGeometry, projectBottleBounds } from './bottle-geometry.js';

// The bottle, its studio, label and light are all authored locally: no model or image request.
export async function createScene(canvas, width, height, mobile) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.8));
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, width / height, .1, 60);
  camera.position.set(0, .08, 8.1);
  camera.lookAt(0, .08, 0);

  // An enclosed studio and long softboxes give real reflections along the bevels.
  const studio = new THREE.Scene();
  studio.background = new THREE.Color('#0b0c15');
  const softbox = (x, y, z, w, h, color, intensity) => {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    plane.material.color.multiplyScalar(intensity);
    plane.position.set(x, y, z); plane.lookAt(0, 0, 0); studio.add(plane);
  };
  softbox(-3, 1, 2, .55, 7, '#c8d9ff', 7);
  softbox(3, .6, 1.5, .4, 6, '#d9c7f5', 9);
  softbox(0, 4, 1, 4, .8, '#e4e5ee', 4);
  softbox(-1.5, -.5, -3, 1, 4, '#7960ba', 3);
  softbox(1, -3, 2, 4, .35, '#9ba4cb', 3);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(studio, .06, .1, 30);
  scene.environment = environment.texture;
  pmrem.dispose();
  studio.traverse(obj => { obj.geometry?.dispose(); obj.material?.dispose(); });
  const ambient = new THREE.AmbientLight('#8d8ab2', .55); scene.add(ambient);
  const key = new THREE.DirectionalLight('#dbe7ff', 3.4); key.position.set(-3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight('#a293eb', 4); rim.position.set(3, 2, -1); scene.add(rim);
  const fill = new THREE.PointLight('#d0c5f9', 14, 12, 2); fill.position.set(1.7, .4, 3.5); scene.add(fill);

  const bottle = new THREE.Group(); scene.add(bottle);
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: '#87859b', metalness: .08, roughness: .105, transmission: .87,
    thickness: .65, ior: 1.48, clearcoat: 1, clearcoatRoughness: .06,
    attenuationColor: new THREE.Color('#333047'), attenuationDistance: 1.7,
    envMapIntensity: 1.65, iridescence: .12, iridescenceIOR: 1.3
  });
  const body = new THREE.Mesh(createBottleGeometry(), glassMaterial);
  body.name = 'smoked-glass-shell'; bottle.add(body);
  // Interior surfaces must enter Three's opaque refraction capture; nesting
  // transmissive materials makes them disappear behind the shell's depth.
  const liquidMaterial = new THREE.MeshPhysicalMaterial({ color: '#28223e', metalness: .05, roughness: .16, transmission: 0, clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: 1.1 });
  const liquid = new THREE.Mesh(new RoundedBoxGeometry(1.32, 1.57, .59, 6, .12), liquidMaterial);
  liquid.position.set(0, -.26, 0); bottle.add(liquid);
  const meniscus = new THREE.Mesh(new RoundedBoxGeometry(1.28, .018, .55, 3, .008), new THREE.MeshPhysicalMaterial({ color: '#696078', transmission: 0, roughness: .09, clearcoat: 1, envMapIntensity: 1.4 }));
  meniscus.position.y = .515; bottle.add(meniscus);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, 1.65, 12), new THREE.MeshStandardMaterial({ color: '#bcb8ce', metalness: .15, roughness: .25 }));
  tube.position.set(.035, -.12, -.04); bottle.add(tube);
  const base = new THREE.Mesh(new RoundedBoxGeometry(1.43, .13, .68, 6, .045), new THREE.MeshPhysicalMaterial({ color: '#b2a8cc', metalness: .15, roughness: .12, clearcoat: 1, envMapIntensity: 2 }));
  base.position.set(0, -1.08, 0); bottle.add(base);
  const metal = new THREE.MeshStandardMaterial({ color: '#afacb9', metalness: .98, roughness: .23, envMapIntensity: 1.2 });
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.245, .28, .23, 48), metal);
  neck.position.y = .99; bottle.add(neck);
  const neckBlack = new THREE.Mesh(new THREE.CylinderGeometry(.265, .265, .10, 48), new THREE.MeshStandardMaterial({ color: '#12121c', metalness: .9, roughness: .2 }));
  neckBlack.position.y = 1.11; bottle.add(neckBlack);
  const cap = new THREE.Mesh(new RoundedBoxGeometry(1.02, .49, .72, 6, .065), new THREE.MeshPhysicalMaterial({ color: '#090a12', metalness: .78, roughness: .22, clearcoat: 1, clearcoatRoughness: .1, envMapIntensity: 1.4 }));
  cap.position.y = 1.35; bottle.add(cap);
  const capTrim = new THREE.Mesh(new RoundedBoxGeometry(1.016, .018, .717, 5, .025), metal);
  capTrim.position.y = 1.125; bottle.add(capTrim);
  const capTop = new THREE.Mesh(new RoundedBoxGeometry(.78, .008, .5, 3, .03), new THREE.MeshStandardMaterial({ color: '#1b1a25', metalness: .9, roughness: .3 }));
  capTop.position.y = 1.60; bottle.add(capTop);

  // Real type on a canvas texture; the rest of the page always supplies accessible product text.
  const labelCanvas = document.createElement('canvas'); labelCanvas.width = 1024; labelCanvas.height = 1024;
  const ctx = labelCanvas.getContext('2d');
  const labelTexture = new THREE.CanvasTexture(labelCanvas); labelTexture.colorSpace = THREE.SRGBColorSpace;
  labelTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  function tracking(text, y, size, spacing, family) {
    ctx.font = `${size}px ${family}`;
    const advances = [...text].map(letter => ctx.measureText(letter).width);
    const total = advances.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
    let x = (1024 - total) / 2;
    [...text].forEach((letter, i) => { ctx.fillText(letter, x, y); x += advances[i] + spacing; });
  }
  function paintLabel() {
    ctx.clearRect(0, 0, 1024, 1024);
    ctx.fillStyle = '#0f1019'; ctx.fillRect(0, 0, 1024, 1024);
    ctx.strokeStyle = '#898293'; ctx.lineWidth = 2; ctx.strokeRect(24, 24, 976, 976);
    ctx.fillStyle = '#eee7f5'; tracking('COSMOS', 460, 151, 11, '"Cormorant Garamond", "Baskerville Old Face", Georgia, serif');
    ctx.fillStyle = '#bdb6cb'; tracking('SANDBOX', 605, 30, 17, 'Inter, sans-serif');
    ctx.fillStyle = '#8c839e'; tracking('PARFUM', 850, 21, 6, 'Inter, sans-serif');
    labelTexture.needsUpdate = true;
  }
  paintLabel();
  const label = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 1.12), new THREE.MeshStandardMaterial({ map: labelTexture, roughness: .38, metalness: .32, envMapIntensity: .7 }));
  label.position.set(0, -.15, .414); bottle.add(label);
  const backLabel = new THREE.Mesh(new THREE.PlaneGeometry(.84, .84), label.material);
  backLabel.position.set(0, -.15, -.414); backLabel.rotation.y = Math.PI; bottle.add(backLabel);
  document.fonts.ready.then(() => { paintLabel(); renderer.render(scene, camera); });

  // A slow, narrow light sweep crosses the label instead of moving the text itself.
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 1.12), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uStrength: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv; uniform float uTime; uniform float uStrength; void main(){float t=mod(uTime*.09,1.8)-.4;float d=vUv.x+vUv.y*.22-t;float a=exp(-d*d*180.)*.20*uStrength;gl_FragColor=vec4(.78,.75,1.,a);}'
  }));
  sweep.position.copy(label.position); sweep.position.z += .003; bottle.add(sweep);
  bottle.updateMatrixWorld(true);
  const localBottleBounds = new THREE.Box3().setFromObject(bottle);

  const orbitGroup = new THREE.Group(); scene.add(orbitGroup);
  const rings = [];
  function makeRing(radius, thickness, opacity, rotation, color) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 5, mobile ? 180 : 280), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.set(...rotation); orbitGroup.add(ring); rings.push({ mesh: ring, opacity }); return ring;
  }
  makeRing(2.32, .003, .72, [1.20, -.18, -.36], '#d2c1f4');
  makeRing(2.32, .014, .06, [1.20, -.18, -.36], '#bda8f1');
  makeRing(2.53, .0015, .19, [1.18, -.17, -.36], '#b7a6de');
  makeRing(2.16, .0012, .10, [1.23, -.20, -.36], '#dcd2ee');

  const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 128;
  const glowCtx = glowCanvas.getContext('2d');
  const gradient = glowCtx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(184,167,230,1)'); gradient.addColorStop(.08,'rgba(151,126,217,.75)'); gradient.addColorStop(.3,'rgba(111,90,174,.15)'); gradient.addColorStop(1,'rgba(80,64,140,0)');
  glowCtx.fillStyle = gradient; glowCtx.fillRect(0,0,128,128);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .9 }));
  glint.scale.set(.45,.45,1); orbitGroup.add(glint);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: .10, color: '#7b69bb' }));
  aura.position.set(0, -.2, -1); aura.scale.set(7,5,1); aura.renderOrder = -5; scene.add(aura);

  // Local-space motes sit at different depths and gather into the final halo.
  const moteCount = mobile ? 65 : 180;
  const positions = new Float32Array(moteCount * 3), bases = [];
  let seed = 19; const rand = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  for (let i=0;i<moteCount;i++) { const angle=rand()*Math.PI*2, radius=1.65+rand()*.7; bases.push({angle,radius,y:rand()*5-2.5,depth:rand()*3-1.5}); }
  const motesGeometry = new THREE.BufferGeometry(); motesGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const motes = new THREE.Points(motesGeometry,new THREE.PointsMaterial({ color:'#c6b9e8',size:.012,transparent:true,opacity:.6,depthWrite:false,blending:THREE.AdditiveBlending })); scene.add(motes);
  let visible = true;
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); visible = false; document.documentElement.classList.remove('scene-ready'); });
  canvas.addEventListener('webglcontextrestored', () => { visible = true; document.documentElement.classList.add('scene-ready'); });
  let viewWidth = width, viewHeight = height;
  return {
    resize(w,h,isMobile) {
      viewWidth=w;viewHeight=h;mobile=isMobile;camera.aspect=w/h;camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1,mobile?1.5:1.8));renderer.setSize(w,h);
    },
    render(pose,time,pointer,reduced) {
      if (!visible) return null;
      // A portrait camera pulls back so the complete bottle fits a narrow screen.
      camera.position.z = mobile ? Math.max(8.1, 3.9 / camera.aspect) : 8.1;
      camera.updateMatrixWorld();
      const breathe = reduced ? 0 : Math.sin(time*.55)*.025;
      bottle.position.set(pose.x,pose.y+breathe,0);
      bottle.rotation.set(pose.rx+pointer.y*.04,pose.ry+pointer.x*.13+(pointer.yaw || 0),pose.rz-pointer.x*.012);
      bottle.scale.setScalar(pose.scale);
      orbitGroup.position.set(pose.x*.7,pose.y*.75-.15,0);
      orbitGroup.rotation.z = reduced ? 0 : Math.sin(time*.13)*.025;
      orbitGroup.rotation.y = Math.sin(time*.09)*.03;
      orbitGroup.scale.setScalar(mobile?.7:1);
      for (const ring of rings) ring.mesh.material.opacity=ring.opacity*pose.orbit;
      const angle = time*.12+2.4;
      glint.position.set(Math.cos(angle)*2.32,Math.sin(angle)*.64+.05,Math.sin(angle)*2.1);
      glint.material.opacity=.8*pose.orbit;
      aura.position.x=pose.x*.5;aura.material.opacity=.10+pose.violet*.14+pose.finale*.1;
      rim.color.setRGB(.58+pose.silver*.35,.48+pose.blue*.15+pose.silver*.3,.9);
      fill.position.x=-2+Math.sin(time*.28)*3;
      fill.intensity=12+pose.silver*10;
      sweep.material.uniforms.uTime.value=time+(pose.ry+1)*4;
      sweep.material.uniforms.uStrength.value=reduced?0:1;
      for(let i=0;i<moteCount;i++) {
        const p=bases[i],a=p.angle+(reduced?0:time*.022),f=pose.finale;
        positions[i*3]=Math.cos(a)*p.radius+pose.x*.35*(1-f);
        positions[i*3+1]=THREE.MathUtils.lerp(p.y+Math.sin(a+time*.08)*.05,Math.sin(a)*p.radius*.75,f)+pose.y*.5;
        positions[i*3+2]=THREE.MathUtils.lerp(p.depth,Math.sin(a)*.5,f);
      }
      motesGeometry.attributes.position.needsUpdate=true;
      // On very wide screens preserve product scale; on phones visual content sits above the copy.
      renderer.setViewport(0,0,viewWidth,viewHeight);renderer.render(scene,camera);
      return projectBottleBounds(localBottleBounds, bottle.matrixWorld, camera, viewWidth, viewHeight);
    }
  };
}
