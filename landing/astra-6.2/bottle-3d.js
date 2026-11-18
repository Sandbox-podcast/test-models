/* A single WebGL context lights the three catalog views of the same GLB. */
(() => {
  'use strict';
  const mounts = [...document.querySelectorAll('[data-bottle-view]')];
  if (!mounts.length) return;

  const vertexSource = `
    attribute vec3 position, normal;
    attribute vec2 texcoord;
    uniform mat3 rotation;
    uniform float aspect;
    varying vec3 local, world, direction;
    varying vec2 uv;
    void main() {
      local = position;
      world = rotation * position;
      direction = rotation * normal;
      uv = texcoord;
      float distance = 8.5 - world.z;
      gl_Position = vec4(world.x * 4.98 / aspect, world.y * 4.98,
                         distance * 1.00837 - .20084, distance);
    }`;

  const fragmentSource = `
    precision highp float;
    uniform mat3 rotation;
    uniform int surface;
    uniform float time;
    uniform sampler2D study, label, metalStudy;
    varying vec3 local, world, direction;
    varying vec2 uv;

    // Angular rectangle lights cover both the reflected and transmitted hemisphere.
    float boxLight(vec3 d, float angle, float width, float low, float high, float feather) {
      float x = abs(mod(atan(d.x,d.z)-angle+3.141593,6.283186)-3.141593);
      return (1.-smoothstep(width,width+feather,x)) *
             smoothstep(low-feather,low,d.y) * (1.-smoothstep(high,high+feather,d.y));
    }
    vec3 studio(vec3 d) {
      float sweep = .13 * sin(time * .19);
      vec3 c = mix(vec3(.029,.023,.044),vec3(.105,.093,.14),d.y*.5+.5);
      c += vec3(2.9,2.75,3.1)*boxLight(d,-1.20+sweep,.17,-.76,.86,.12);
      c += vec3(1.2,1.53,2.5)*boxLight(d,-1.73,.037,-.68,.78,.026);
      c += vec3(1.0,.59,1.72)*boxLight(d,1.53+sweep,.33,-.94,.70,.15);
      c += vec3(2.8,2.1,3.4)*boxLight(d,1.07,.041,-.85,.68,.054);
      c += vec3(1.75,1.58,1.95)*boxLight(d,.12,.22,.15,.88,.26);
      c += vec3(1.55,1.19,2.0)*boxLight(d,2.88,.64,-.85,-.47,.12);
      c += vec3(2.0,1.95,2.1)*smoothstep(.76,.99,d.y);
      return c;
    }
    vec3 toDisplay(vec3 light) {
      return pow(1.-exp(-max(light,vec3(0.))),vec3(.45455));
    }
    void main() {
      vec3 n = normalize(direction);
      vec3 eye = normalize(vec3(0.,0.,8.5)-world);
      vec3 reflected = studio(reflect(-eye,n));
      float facing = clamp(dot(n,eye),0.,1.);
      float fresnel = .045 + .955*pow(1.-facing,4.);
      vec3 c;
      float opacity=1.;
      if (surface == 0) {
        vec3 nx = normalize(rotation*vec3(1.,0.,0.));
        float side = smoothstep(.30,.91,abs(dot(nx,n)));
        float v = clamp((.74-local.y)/2.29,.004,.996);
        vec3 front = texture2D(study,vec2(clamp(.5+local.x/1.916,.01,.99),v)).rgb;
        vec3 flank = texture2D(study,vec2(clamp(.5+local.z/1.07,.025,.975),v)).rgb;
        vec3 inclusion = pow(mix(front,flank,side*.92),vec3(2.2));
        vec3 ray = refract(-eye,n,1./1.52);
        vec3 through = studio(ray);
        float base = 1.-smoothstep(-1.43,-1.17,local.y);
        float rim = max(smoothstep(.76,.95,abs(local.x)),smoothstep(.385,.528,abs(local.z))*side);
        float thick = clamp(.12+.65*base+.36*rim,0.,1.);
        c = inclusion*.96 + vec3(.004,.0015,.009) +
            reflected*(fresnel*.67+.018+base*.047) +
            through*vec3(.27,.12,.46)*(.022+.22*thick);
        opacity = .84 + .15*max(thick,fresnel);
      } else if (surface == 1) {
        float edge = pow(1.-facing,1.4);
        float floorGlow = 1.-smoothstep(-1.27,-.92,local.y);
        float meniscus = smoothstep(.44,.51,local.y);
        c = vec3(.018,.008,.033) + vec3(.12,.049,.23)*(edge+floorGlow*.72)
            + reflected*(.025+.18*edge+.095*meniscus);
      } else if (surface == 5) {
        vec3 print = pow(texture2D(label,uv).rgb,vec3(2.2));
        float foil = smoothstep(.12,.47,max(print.r,print.b));
        c = print*(.96+.28*max(n.y,0.)) + reflected*(.004+.19*foil);
      } else {
        vec3 metal = surface==2 ? vec3(.27,.24,.31) :
                     (surface==3 ? vec3(.65,.60,.72) : vec3(.068,.05,.083));
        float brushing = 1.;
        if (surface==2) {
          float groove = sin(local.y * 710.);
          brushing = .87 + .13*groove;
          float top = smoothstep(1.505,1.539,local.y);
          brushing = mix(brushing,.86+.10*sin(length(local.xz)*430.),top);
        }
        c = metal*(.068+reflected*brushing);
        if (local.y>.94 && surface!=4) {
          float y = clamp((1.542-local.y)/.593,0.,1.);
          vec2 coords = vec2(clamp(.5+.485*n.x+.022*sin(time*.19),.018,.982),y);
          vec3 turned = pow(texture2D(metalStudy,coords).rgb,vec3(2.2));
          float wall = 1.-smoothstep(.62,.98,abs(n.y));
          c = mix(c,turned*1.12 + c*(surface==2?.12:.30),wall);
        }
      }
      gl_FragColor = vec4(toDisplay(c),opacity);
    }`;

  async function loadBinary() {
    if (location.protocol !== 'file:') {
      const result = await fetch('assets/cosmos.glb');
      if (!result.ok) throw new Error('COSMOS GLB ' + result.status);
      return result.arrayBuffer();
    }
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'assets/cosmos-local.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    const bytes = Uint8Array.from(atob(window.cosmosLocalGLB), ch => ch.charCodeAt(0));
    delete window.cosmosLocalGLB;
    return bytes.buffer;
  }

  function embeddedImage(bytes, mime) {
    const url = URL.createObjectURL(new Blob([bytes], {type:mime}));
    const image = new Image();
    return new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    }).finally(() => URL.revokeObjectURL(url));
  }

  async function unpack(buffer) {
    const header = new DataView(buffer);
    if (header.getUint32(0,true)!==0x46546c67 || header.getUint32(4,true)!==2) throw new Error('GLB');
    const jsonSize = header.getUint32(12,true);
    const definition = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,jsonSize)));
    const offset = 28+jsonSize;
    const bytesFor = view => new Uint8Array(buffer,offset+(view.byteOffset || 0),view.byteLength);
    const images = await Promise.all(definition.images.map(image =>
      embeddedImage(bytesFor(definition.bufferViews[image.bufferView]),image.mimeType)));
    return {definition, images, bytesFor};
  }

  const engine = document.createElement('canvas');
  const gl = engine.getContext('webgl', {alpha:true, antialias:true, depth:true,
    premultipliedAlpha:true, powerPreference:'low-power'});
  if (!gl) return;
  let model, program, meshes, locations;
  let ready = false, frame = 0, previous = 0, clock = 0, motion = false;
  const views = new Map();
  const surfaces = ['glass','liquid','brushed','polished','neck','print'];
  const radians = Math.PI/180;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  function upload() {
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    program = gl.createProgram();
    gl.attachShader(program,vertex);
    gl.attachShader(program,fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    locations = {};
    for (const name of ['position','normal','texcoord']) locations[name] = gl.getAttribLocation(program,name);
    for (const name of ['rotation','aspect','time','surface','label','study','metalStudy']) locations[name] = gl.getUniformLocation(program,name);
    const {definition,images,bytesFor} = model;
    const buffers = definition.bufferViews.map(view => {
      if (!view.target) return null;
      const buffer = gl.createBuffer();
      gl.bindBuffer(view.target,buffer);
      gl.bufferData(view.target,bytesFor(view),gl.STATIC_DRAW);
      return buffer;
    });
    function attribute(id) {
      const accessor = definition.accessors[id];
      return {buffer:buffers[accessor.bufferView], count:accessor.count, type:accessor.componentType};
    }
    meshes = definition.meshes.flatMap(mesh => mesh.primitives.map(primitive => {
      const {POSITION,NORMAL,TEXCOORD_0} = primitive.attributes;
      return {position:attribute(POSITION), normal:attribute(NORMAL), texcoord:attribute(TEXCOORD_0),
        indices:attribute(primitive.indices), surface:surfaces.indexOf(definition.materials[primitive.material].extras.surface)};
    })).sort((a,b) => Number(a.surface===0)-Number(b.surface===0));
    const ink = definition.materials.find(material => material.extras.surface==='print');
    const maps = [ink.pbrMetallicRoughness.baseColorTexture.index, definition.extras.glassStudy, definition.extras.metalStudy];
    maps.forEach((id, unit) => {
      gl.activeTexture(gl.TEXTURE0+unit);
      gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,images[definition.textures[id].source]);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    });
    gl.uniform1i(locations.label,0);
    gl.uniform1i(locations.study,1);
    gl.uniform1i(locations.metalStudy,2);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0,0,0,0);
    ready = true;
    for (const view of views.values()) view.dirty = true;
    request();
  }

  function draw(view) {
    const canvas = view.canvas;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return;
    const scale = Math.min(devicePixelRatio || 1, 1.65, 900/height);
    const w = Math.round(width*scale), h = Math.round(height*scale);
    if (engine.width!==w || engine.height!==h) { engine.width=w; engine.height=h; }
    if (canvas.width!==w || canvas.height!==h) { canvas.width=w; canvas.height=h; }
    gl.viewport(0,0,w,h);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const yaw = view.baseYaw+view.turn+(motion ? view.pointerX+.037*Math.sin(clock*.32) : 0);
    const pitch = .093+view.pitch+(motion ? view.pointerY : 0);
    const cy=Math.cos(yaw), sy=Math.sin(yaw), cx=Math.cos(pitch), sx=Math.sin(pitch);
    gl.uniformMatrix3fv(locations.rotation,false,[cy,sx*sy,-cx*sy, 0,cx,sx, sy,-sx*cy,cx*cy]);
    gl.uniform1f(locations.aspect,w/h);
    gl.uniform1f(locations.time,clock);
    for (const mesh of meshes) {
      for (const name of ['position','normal','texcoord']) {
        gl.bindBuffer(gl.ARRAY_BUFFER,mesh[name].buffer);
        gl.enableVertexAttribArray(locations[name]);
        gl.vertexAttribPointer(locations[name],name==='texcoord'?2:3,gl.FLOAT,false,0,0);
      }
      gl.uniform1i(locations.surface,mesh.surface);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.indices.buffer);
      gl.drawElements(gl.TRIANGLES,mesh.indices.count,mesh.indices.type,0);
    }
    view.context.clearRect(0,0,w,h);
    view.context.drawImage(engine,0,0);
    if (!gl.isContextLost() && !view.mount.classList.contains('model-ready')) {
      view.mount.classList.add('model-ready');
      view.mount.querySelector('img').setAttribute('aria-hidden','true');
      canvas.tabIndex=0;
      canvas.removeAttribute('aria-hidden');
      if (view.name==='reveal') document.querySelector('.turn-controls').hidden=false;
    }
  }

  function tick(now) {
    frame=0;
    if (!ready || document.hidden) return;
    const visible = [...views.values()].filter(view => view.visible);
    if (!visible.length) { previous=0; return; }
    const step = now-previous;
    if (visible.some(view => view.dirty) || !previous || (motion && step>=42)) {
      if (motion && previous) clock += Math.min(step,80)/1000;
      previous=now;
      for (const view of visible) {
        if (view.dirty || motion) draw(view);
        view.dirty=false;
      }
    }
    if (motion) request();
  }
  function request() {
    if (ready && !frame && !document.hidden) frame=requestAnimationFrame(tick);
  }
  function invalidate(view) { view.dirty=true; request(); }

  function rotate(view, delta) {
    view.turn = (view.turn+delta)%(Math.PI*2);
    invalidate(view);
  }
  function setupControls(view) {
    const canvas=view.canvas;
    let drag=null;
    canvas.addEventListener('pointerdown',event => {
      if (!event.isPrimary || event.button!==0) return;
      drag={id:event.pointerId,x:event.clientX,y:event.clientY};
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('dragging');
    });
    canvas.addEventListener('pointermove',event => {
      if (!drag || drag.id!==event.pointerId) return;
      const dx=event.clientX-drag.x, dy=event.clientY-drag.y;
      drag.x=event.clientX; drag.y=event.clientY;
      if (event.pointerType!=='touch') view.pitch=Math.max(-.48,Math.min(.54,view.pitch+dy*.009));
      rotate(view,dx*2*Math.PI/Math.max(190,canvas.clientWidth));
    });
    canvas.addEventListener('lostpointercapture',() => { drag=null; canvas.classList.remove('dragging'); });
    canvas.addEventListener('keydown',event => {
      if (!['ArrowLeft','ArrowRight','Home'].includes(event.key)) return;
      event.preventDefault();
      if (event.key==='Home') { view.turn=0; view.pitch=0; invalidate(view); }
      else rotate(view,(event.key==='ArrowLeft'?-1:1)*15*radians);
    });
  }

  const visibility = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const view=views.get(entry.target.dataset.bottleView);
      view.visible=entry.isIntersecting;
      invalidate(view);
    }
  });
  const sizes = new ResizeObserver(entries => {
    for (const entry of entries) invalidate(views.get(entry.target.dataset.bottleView));
  });
  for (const mount of mounts) {
    const name=mount.dataset.bottleView;
    const canvas=document.createElement('canvas');
    canvas.className='model-canvas';
    canvas.setAttribute('role','group');
    canvas.setAttribute('aria-roledescription','modèle 3D interactif');
    canvas.setAttribute('aria-label','Flacon COSMOS en verre fumé. Flèches gauche et droite pour faire pivoter, touche Début pour recentrer.');
    canvas.setAttribute('aria-hidden','true');
    canvas.title='Faire pivoter le flacon';
    mount.appendChild(canvas);
    const context=canvas.getContext('2d');
    if (!context) continue;
    const view={name, mount, canvas, context, visible:false, dirty:true,
      baseYaw:name==='finale'?.32:-.38, turn:0, pitch:0, pointerX:0, pointerY:0};
    views.set(name,view);
    setupControls(view);
    visibility.observe(mount);
    sizes.observe(mount);
  }
  const reveal=views.get('reveal');
  document.querySelectorAll('[data-turn]').forEach(button =>
    button.addEventListener('click',() => { if (reveal) rotate(reveal,Number(button.dataset.turn)*30*radians); }));
  window.cosmosBottle = {
    pose(name,yaw) {
      const view=views.get(name);
      if (view && view.baseYaw!==yaw) { view.baseYaw=yaw; invalidate(view); }
    },
    pointer(name,x,y) {
      const view=views.get(name);
      if (view) { view.pointerX=x*.34; view.pointerY=y*.10; invalidate(view); }
    },
    motion(enabled) {
      motion=enabled;
      for (const view of views.values()) invalidate(view);
    }
  };
  function showPosters() {
    ready=false;
    for (const view of views.values()) {
      view.mount.classList.remove('model-ready');
      view.mount.querySelector('img').removeAttribute('aria-hidden');
      view.canvas.tabIndex=-1;
      view.canvas.setAttribute('aria-hidden','true');
    }
    document.querySelector('.turn-controls').hidden=true;
  }
  engine.addEventListener('webglcontextlost',event => { event.preventDefault(); showPosters(); });
  engine.addEventListener('webglcontextrestored',() => {
    if (model) { try { upload(); } catch { showPosters(); } }
  });
  document.addEventListener('visibilitychange',() => { previous=0; request(); });
  loadBinary().then(unpack).then(data => {
    model=data;
    if (!gl.isContextLost()) upload();
  }).catch(showPosters);
})();
