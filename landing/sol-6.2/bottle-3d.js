const createCosmosBottles = (() => {
  const vertexSource = `
    precision mediump float;
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute float aMaterial;
    uniform vec3 uAngles;
    uniform float uAspect;
    varying vec3 vLocal;
    varying vec3 vLocalNormal;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying float vMaterial;

    vec3 rotate(vec3 p) {
      vec3 c = cos(uAngles);
      vec3 s = sin(uAngles);
      p.yz = mat2(c.x, s.x, -s.x, c.x) * p.yz;
      p.xz = mat2(c.y, -s.y, s.y, c.y) * p.xz;
      p.xy = mat2(c.z, s.z, -s.z, c.z) * p.xy;
      return p;
    }

    void main() {
      vLocal = aPosition;
      vLocalNormal = aNormal;
      vPosition = rotate(aPosition);
      vNormal = rotate(aNormal);
      vMaterial = aMaterial;
      float depth = 6.0 - vPosition.z;
      gl_Position = vec4(vPosition.x * 3.12 / uAspect, vPosition.y * 3.12,
                         (19.0 * depth - 36.0) / 17.0, depth);
    }
  `;

  const fragmentSource = `
    precision mediump float;
    varying vec3 vLocal;
    varying vec3 vLocalNormal;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying float vMaterial;
    uniform sampler2D uLabel;
    uniform float uLight;

    float softbox(vec3 ray, vec3 direction, float sharpness) {
      return pow(max(dot(ray, normalize(direction)), 0.0), sharpness);
    }

    vec3 studio(vec3 ray) {
      vec3 light = vec3(0.62, 0.75, 1.0) * softbox(ray, vec3(-0.87, 0.27, 0.53), 11.0);
      light += vec3(0.46, 0.25, 0.97) * softbox(ray, vec3(0.84, -0.34, 0.58), 13.0);
      light += vec3(1.0, 0.94, 1.0) * softbox(ray, vec3(0.20, 1.0, 0.56), 27.0);
      light += vec3(0.80, 0.90, 1.0) * softbox(ray, vec3(-0.62, -0.91, 0.65), 25.0);
      float panel = exp(-28.0 * abs(ray.x - uLight * 0.43 + ray.y * 0.17));
      light += vec3(0.46, 0.42, 0.64) * panel * pow(max(ray.z, 0.0), 6.0);
      return light;
    }

    void main() {
      vec3 n = normalize(vNormal);
      vec3 localNormal = normalize(vLocalNormal);
      vec3 view = normalize(vec3(0.0, 0.0, 6.0) - vPosition);
      float facing = max(dot(n, view), 0.0);
      float fresnel = pow(1.0 - facing, 3.5);
      vec3 reflection = studio(reflect(-view, n));
      vec3 pigment;

      if (vMaterial < 0.5) {
        vec3 through = refract(-view, n, 0.67);
        float edgeX = smoothstep(0.86, 1.155, abs(vLocal.x));
        float bottom = 1.0 - smoothstep(-1.31, -1.15, vLocal.y);
        float shoulder = smoothstep(0.47, 0.64, vLocal.y);
        float rim = max(max(edgeX, bottom), shoulder);
        float liquid = 1.0 - smoothstep(0.22, 0.27, vLocal.y);
        float pool = exp(-4.4 * abs(vLocal.y + 0.95 + through.x * 0.34));
        float bevel = 1.0 - max(max(abs(localNormal.x), abs(localNormal.y)), abs(localNormal.z));
        float baseReflection = exp(-54.0 * abs(vLocal.y + 1.235 + through.x * 0.045));
        float baseLight = 0.22 + 0.78 * pow(max(1.0 - abs(vLocal.x + 0.47 - uLight * 0.13) * 0.60, 0.0), 4.0);
        float innerEdge = exp(-72.0 * abs(abs(vLocal.x) - 0.99 + through.y * 0.13));
        pigment = vec3(0.021, 0.026, 0.055);
        pigment += vec3(0.033, 0.075, 0.28) * pool * liquid * (0.44 + rim * 0.65);
        pigment += vec3(0.12, 0.16, 0.33) * rim * (0.24 + fresnel * 0.8);
        pigment += vec3(0.32, 0.48, 0.76) * baseReflection * baseLight;
        pigment += vec3(0.13, 0.19, 0.39) * innerEdge * max(localNormal.z, 0.0) * (0.22 + 0.52 * pool);
        pigment += reflection * (0.17 + rim * 0.47 + fresnel * 0.47 + bevel * 0.68);
        pigment += vec3(0.12, 0.15, 0.25) * bevel * 0.48;
        if (localNormal.z > 0.93 && vLocal.z > 0.42) {
          vec2 uv = vec2(vLocal.x / 1.78 + 0.5, (vLocal.y + 0.31) / 0.61 + 0.5);
          if (all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)))) {
            vec4 label = texture2D(uLabel, uv);
            pigment = mix(pigment, vec3(0.79, 0.78, 0.90) + reflection * 0.16, label.a);
          }
        }
      } else {
        float edge = 1.0 - max(max(abs(localNormal.x), abs(localNormal.y)), abs(localNormal.z));
        pigment = vMaterial < 1.5 ? vec3(0.029, 0.031, 0.049) : vec3(0.083, 0.091, 0.12);
        float top = max(localNormal.y, 0.0);
        pigment += vec3(0.055, 0.059, 0.082) * top;
        pigment += reflection * (0.23 + edge * 1.08 + fresnel * 0.5);
        pigment += vec3(0.21, 0.22, 0.31) * edge;
      }
      gl_FragColor = vec4(pigment, 1.0);
    }
  `;

  function makeMesh() {
    const vertices = [];
    const indices = [];

    function roundedBox(size, centerY, radius, material) {
      const half = size.map(value => value / 2);
      const core = half.map(value => value - radius);
      const edgeSteps = [1, .79, .58, .38, .19, 0];
      const grids = core.map(extent => [
        ...edgeSteps.map(step => -extent - step * radius),
        ...edgeSteps.slice().reverse().map(step => extent + step * radius),
      ]);
      for (const axis of [0, 1, 2]) {
        const u = (axis + 1) % 3;
        const v = (axis + 2) % 3;
        const columns = grids[u].length;
        for (const sign of [-1, 1]) {
          const offset = vertices.length / 7;
          for (const y of grids[v]) {
            for (const x of grids[u]) {
              const p = [0, 0, 0];
              p[axis] = sign * half[axis];
              p[u] = x;
              p[v] = y;
              const inner = p.map((value, i) => Math.max(-core[i], Math.min(core[i], value)));
              const outward = p.map((value, i) => value - inner[i]);
              const length = Math.hypot(...outward);
              const normal = outward.map(value => value / length);
              vertices.push(...inner.map((value, i) => value + normal[i] * radius + (i === 1 ? centerY : 0)), ...normal, material);
            }
          }
          for (let y = 0; y < grids[v].length - 1; y++) {
            for (let x = 0; x < columns - 1; x++) {
              const a = offset + y * columns + x;
              const b = a + 1;
              const c = a + columns;
              const d = c + 1;
              if (sign > 0) indices.push(a, b, c, b, d, c);
              else indices.push(a, c, b, b, c, d);
            }
          }
        }
      }
    }

    function collar() {
      // The two open ends are concealed inside the shoulder and the cap.
      const rings = [
        [0.49, 0.58, 1, 0],
        [0.49, 0.66, 1, 0],
        [0.46, 0.69, 0.71, 0.71],
        [0.37, 0.71, 0.71, 0.71],
        [0.34, 0.74, 1, 0],
        [0.34, 0.94, 1, 0],
      ];
      const sides = 48;
      const offset = vertices.length / 7;
      rings.forEach(([radius, y, radialNormal, verticalNormal], ring) => {
        for (let side = 0; side < sides; side++) {
          const angle = side / sides * Math.PI * 2;
          const x = Math.cos(angle);
          const z = Math.sin(angle);
          vertices.push(x * radius, y, z * radius, x * radialNormal, verticalNormal, z * radialNormal, 2);
          if (!ring) continue;
          const a = offset + (ring - 1) * sides + side;
          const b = offset + (ring - 1) * sides + (side + 1) % sides;
          indices.push(a, a + sides, b, b, a + sides, b + sides);
        }
      });
    }

    roundedBox([2.31, 2.00, 0.94], -.34, .145, 0);
    collar();
    roundedBox([1.76, .48, .85], 1.12, .082, 1);
    return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
  }

  function makeLabel() {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    const serif = getComputedStyle(document.documentElement).getPropertyValue('--serif');
    context.fillStyle = 'white';
    context.textBaseline = 'middle';

    function line(word, font, spacing, y) {
      context.font = font;
      const widths = [...word].map(letter => context.measureText(letter).width);
      const width = widths.reduce((sum, value) => sum + value, 0) + spacing * (word.length - 1);
      let x = (canvas.width - width) / 2;
      [...word].forEach((letter, i) => {
        context.fillText(letter, x, y);
        x += widths[i] + spacing;
      });
    }

    line('COSMOS', '106px ' + serif, 14, 89);
    line('SANDBOX', '600 23px Arial, sans-serif', 11, 180);
    return canvas;
  }

  function createRenderer(surface) {
    const gl = surface.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power' });
    if (!gl) return null;

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(error || 'COSMOS shader compilation failed.');
    }

    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    const { vertices, indices } = makeMesh();
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    [['aPosition', 3, 0], ['aNormal', 3, 12], ['aMaterial', 1, 24]].forEach(([name, size, offset]) => {
      const attribute = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, 28, offset);
    });

    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeLabel());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.uniform1i(gl.getUniformLocation(program, 'uLabel'), 0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    const angleLocation = gl.getUniformLocation(program, 'uAngles');
    const lightLocation = gl.getUniformLocation(program, 'uLight');
    const aspectLocation = gl.getUniformLocation(program, 'uAspect');
    const radians = Math.PI / 180;

    return {
      draw(width, height, pitch, yaw, roll, light) {
        if (surface.width !== width || surface.height !== height) {
          surface.width = width;
          surface.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniform1f(aspectLocation, width / height);
        // CSS angles are clockwise on screen and the mesh uses +Y up.
        gl.uniform3f(angleLocation, -pitch * radians, yaw * radians, -roll * radians);
        gl.uniform1f(lightLocation, light);
        gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
        return !gl.isContextLost();
      },
    };
  }

  return function createBottles(elements, schedule) {
    // Share one GPU context while keeping the canvas in each scene's stacking order.
    const surface = document.createElement('canvas');
    const views = new Map();
    for (const element of elements) {
      const canvas = document.createElement('canvas');
      canvas.className = 'bottle-render';
      canvas.setAttribute('aria-hidden', 'true');
      element.append(canvas);
      views.set(element.dataset.bottleScene, { element, canvas, context: null, previous: '' });
    }

    let renderer;
    let unavailable = false;
    function showPosters() {
      for (const view of views.values()) {
        view.previous = '';
        view.element.classList.remove('has-3d');
      }
    }
    surface.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      unavailable = true;
      renderer = null;
      showPosters();
    });
    surface.addEventListener('webglcontextrestored', () => {
      unavailable = false;
      schedule();
    });

    return {
      resize(mobile) {
        const density = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.65);
        for (const view of views.values()) {
          view.width = Math.round(view.canvas.clientWidth * density);
          view.height = Math.round(view.canvas.clientHeight * density);
        }
      },
      paint(scene, pitch, yaw, roll, light) {
        if (unavailable) return;
        const view = views.get(scene);
        if (!view.width || !view.height) return;
        const pose = [view.width, view.height, pitch, yaw, roll, light].map(value => value.toFixed(3)).join('/');
        if (pose === view.previous) return;
        if (!renderer) {
          try {
            renderer = createRenderer(surface);
          } catch (error) {
            console.warn('COSMOS · WebGL', error);
          }
          if (!renderer) {
            unavailable = true;
            return;
          }
        }
        view.context ??= view.canvas.getContext('2d');
        if (!view.context || !renderer.draw(view.width, view.height, pitch, yaw, roll, light)) return;
        if (view.canvas.width !== view.width || view.canvas.height !== view.height) {
          view.canvas.width = view.width;
          view.canvas.height = view.height;
        }
        view.context.clearRect(0, 0, view.width, view.height);
        view.context.drawImage(surface, 0, 0);
        view.previous = pose;
        view.element.classList.add('has-3d');
      },
    };
  };
})();
