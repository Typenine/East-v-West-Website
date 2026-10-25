'use client';

import { useEffect, useRef } from 'react';
import BroadcastMaterialStage from './BroadcastMaterialStage';

type Props = {
  primary: string;
  secondary?: string;
  logoUrl?: string | null;
  onLogoReady?: () => void;
};

type DrawMesh = {
  vao: WebGLVertexArrayObject;
  indices: number;
  material: number;
  badge: boolean;
};

// Original WebGL geometry: stage design informed by the privately archived
// Hype Chamber sample's platform dimensions. No licensed Epic mesh is shipped.
function stageRing(radius: number, width: number, z: number, count = 96) {
  const vertices: number[] = [];
  const faces: number[] = [];
  for (let i = 0; i <= count; i++) {
    const a = (i * Math.PI * 2) / count;
    const c = Math.cos(a);
    const s = Math.sin(a);
    vertices.push((radius - width) * c, (radius - width) * s, z);
    vertices.push((radius + width) * c, (radius + width) * s, z);
    if (i < count) {
      const j = i * 2;
      faces.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  return { vertices, faces };
}

function stageHex(radius: number, base: number, top: number) {
  const vertices: number[] = [];
  const faces: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    const b = ((i + 1) * Math.PI) / 3 + Math.PI / 6;
    const j = vertices.length / 3;
    vertices.push(radius * Math.cos(a), radius * Math.sin(a), base);
    vertices.push(radius * Math.cos(b), radius * Math.sin(b), base);
    vertices.push(radius * Math.cos(a), radius * Math.sin(a), top);
    vertices.push(radius * Math.cos(b), radius * Math.sin(b), top);
    faces.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
  }
  return { vertices, faces };
}

// A substantial upright hexagonal insignia, not a flat image over the viewport.
// The silhouette and edge are actual meshes in the same WebGL scene as the stage.
function badgeHex(radius: number, yFront: number, yBack: number, zCenter: number) {
  const vertices: number[] = [0, yFront, zCenter];
  const faces: number[] = [];
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * 2 * Math.PI) / 6;
    pts.push([radius * Math.cos(a), zCenter + radius * Math.sin(a)]);
    vertices.push(pts[i][0], yFront, pts[i][1]);
  }
  for (let i = 0; i < 6; i++) faces.push(0, i + 1, ((i + 1) % 6) + 1);
  const backBase = vertices.length / 3;
  vertices.push(0, yBack, zCenter);
  for (const [x, z] of pts) vertices.push(x, yBack, z);
  for (let i = 0; i < 6; i++) faces.push(backBase, backBase + ((i + 1) % 6) + 1, backBase + i + 1);
  for (let i = 0; i < 6; i++) {
    const next = (i + 1) % 6;
    const p = i + 1, q = next + 1;
    faces.push(p, q, backBase + p, q, backBase + q, backBase + p);
  }
  return { vertices, faces };
}

function badgeBorder(outer: number, inner: number, y: number, zCenter: number) {
  const vertices: number[] = [];
  const faces: number[] = [];
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI / 6 + (i * 2 * Math.PI) / 6;
    vertices.push(outer * Math.cos(a), y, zCenter + outer * Math.sin(a));
    vertices.push(inner * Math.cos(a), y, zCenter + inner * Math.sin(a));
    if (i < 6) {
      const j = i * 2;
      faces.push(j, j + 2, j + 1, j + 2, j + 3, j + 1);
    }
  }
  return { vertices, faces };
}

function logoQuad(size: number, y: number, zCenter: number) {
  const r = size / 2;
  return {
    vertices: [-r, y, zCenter - r, r, y, zCenter - r, -r, y, zCenter + r, r, y, zCenter + r],
    faces: [0, 1, 2, 1, 3, 2],
    uv: [0, 0, 1, 0, 0, 1, 1, 1],
  };
}

function translationZ(z: number) {
  return Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1]);
}

function stageCylinder(radius: number, base: number, height: number, count = 96) {
  const vertices: number[] = [];
  const faces: number[] = [];
  for (let i = 0; i <= count; i++) {
    const a = (i * Math.PI * 2) / count;
    const c = Math.cos(a);
    const s = Math.sin(a);
    vertices.push(radius * c, radius * s, base);
    vertices.push(radius * c, radius * s, height);
    if (i < count) {
      const j = i * 2;
      faces.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  return { vertices, faces };
}

function parseColor(raw: string) {
  if (!/^#[0-9a-f]{6}$/i.test(raw)) return [0.08, 0.68, 0.45];
  return [1, 3, 5].map(offset => parseInt(raw.slice(offset, offset + 2), 16) / 255);
}

function multiply(a: Float32Array, b: Float32Array) {
  const c = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) c[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
    }
  }
  return c;
}

function rotationZ(a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return Float32Array.from([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function projection(aspect: number) {
  const near = 0.1;
  const far = 70;
  const f = 1 / Math.tan(Math.PI / 6.5);
  return Float32Array.from([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
}

function viewMatrix(eye: number[], focus: number[]) {
  const forward = focus.map((v, i) => v - eye[i]);
  const fl = Math.hypot(...forward);
  const f = forward.map(v => v / fl);
  const side = [f[1], -f[0], 0];
  const sl = Math.hypot(...side);
  const s = side.map(v => v / sl);
  const up = [s[1] * f[2], -s[0] * f[2], s[0] * f[1] - s[1] * f[0]];
  const view = Float32Array.from([
    s[0], up[0], -f[0], 0,
    s[1], up[1], -f[1], 0,
    s[2], up[2], -f[2], 0,
    -(s[0] * eye[0] + s[1] * eye[1] + s[2] * eye[2]),
    -(up[0] * eye[0] + up[1] * eye[1] + up[2] * eye[2]),
    f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2],
    1,
  ]);
  return view;
}

const VERTEX = [
  '#version 300 es',
  'precision highp float;',
  'layout(location=0) in vec3 position;',
  'layout(location=1) in vec2 texCoord;',
  'out vec2 vUv;'
  'uniform mat4 viewMatrix, projectionMatrix, modelMatrix;',
  'out vec3 worldPos;',
  'void main() {',
  '  worldPos = (modelMatrix * vec4(position, 1.)).xyz;',
  '  vUv = texCoord;'
  '  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.);',
  '}',
].join('\n');

const FRAGMENT = [
  '#version 300 es',
  'precision highp float;',
  'in vec3 worldPos;',
  'in vec2 vUv;',
  'out vec4 outColor;',
  'uniform vec3 eye, accent, second;',
  'uniform float time, material;',
  'uniform sampler2D insigniaTexture;',
  'void main() {',
  '  if (material > 3.5) {',
  '    vec4 texel = texture(insigniaTexture, vUv);',
  '    if (texel.a < .02) discard;',
  '    outColor = texel;',
  '    return;',
  '  }',
  '  vec3 normal = normalize(cross(dFdx(worldPos), dFdy(worldPos)));',
  '  if (!gl_FrontFacing) normal = -normal;',
  '  vec3 toEye = normalize(eye - worldPos);',
  '  vec3 key = normalize(vec3(-0.6, -0.3, 1.4));',
  '  vec3 fill = normalize(vec3(0.75, 0.65, 1.1));',
  '  float diffuse = max(dot(normal, key), 0.) * .75 + max(dot(normal, fill), 0.) * .35;',
  '  float edge = pow(1. - abs(dot(normal, toEye)), 2.7);',
  '  float gloss = pow(max(dot(reflect(-key, normal), toEye), 0.), 45.);',
  '  vec3 surface = mix(vec3(.025,.043,.062), accent * .33, .36);',
  '  if (material > 1.5) surface = mix(second * .7, vec3(.7,.84,.93), .25);',
  '  else if (material > .5) surface = mix(vec3(.09,.13,.17), accent * .44, .5);',
  '  vec3 color = surface * (.27 + diffuse) + accent * edge * .39;',
  '  color += vec3(.55,.7,.76) * gloss * .65;',
  '  if (material > 1.5) color += accent * (1.1 + .3*sin(time*2.));',
  '  color = color / (color + vec3(1.));',
  '  outColor = vec4(pow(max(color,0.),vec3(.85)),1.);',
  '}',
].join('\n');

function initStage(gl: WebGL2RenderingContext, color: string, secondColor: string) {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error('Unable to create shader');
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'Shader compilation failed');
    return s;
  };
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create WebGL program');
  const vertexShader = shader(gl.VERTEX_SHADER, VERTEX);
  const fragmentShader = shader(gl.FRAGMENT_SHADER, FRAGMENT);
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Program linking failed');
  gl.useProgram(program);
  const uniforms = {
    view: gl.getUniformLocation(program, 'viewMatrix'),
    projection: gl.getUniformLocation(program, 'projectionMatrix'),
    model: gl.getUniformLocation(program, 'modelMatrix'),
    eye: gl.getUniformLocation(program, 'eye'),
    accent: gl.getUniformLocation(program, 'accent'),
    second: gl.getUniformLocation(program, 'second'),
    time: gl.getUniformLocation(program, 'time'),
    material: gl.getUniformLocation(program, 'material'),
    insigniaTexture: gl.getUniformLocation(program, 'insigniaTexture'),
  };
  const drawMeshes: DrawMesh[] = [];
  const buffers: WebGLBuffer[] = [];
  const make = (shape: { vertices: number[]; faces: number[]; uv?: number[] }, material: number, badge = false) => {
    const vao = gl.createVertexArray();
    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    if (!vao || !vertexBuffer || !indexBuffer) throw new Error('Unable to allocate WebGL mesh');
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(shape.vertices), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    if (shape.uv) {
      const uvBuffer = gl.createBuffer();
      if (!uvBuffer) throw new Error('Unable to allocate logo UV buffer');
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(shape.uv), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
      buffers.push(uvBuffer);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint32Array.from(shape.faces), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    buffers.push(vertexBuffer, indexBuffer);
    drawMeshes.push({ vao, indices: shape.faces.length, material, badge });
  };
  make(stageCylinder(3.1, -.9, .05), 0);
  make(stageCylinder(2.45, .06, .29), 1);
  make(stageCylinder(1.63, .30, .37), 0);
  make(stageHex(1.68, .38, 1.5), 1);
  make(stageRing(3.12, .04, .11), 2);
  make(stageRing(2.49, .045, .32), 2);
  make(stageRing(1.65, .03, .43), 2);
  make(stageRing(3.55, .012, -.02), 2);
  // Raised center-stage identity: dark metallic back, inset front and illuminated border.
  // Centered above the platform, with the actual team's PNG as a texture.
  make(badgeHex(1.93, -.84, -.42, 2.32), 1, true);
  make(badgeHex(1.78, -.88, -.80, 2.32), 0, true);
  make(badgeBorder(1.91, 1.78, -.91, 2.32), 2, true);
  make(logoQuad(2.80, -.95, 2.32), 4, true);
  const insigniaTexture = gl.createTexture();
  if (!insigniaTexture) throw new Error('Unable to allocate insignia texture');
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, insigniaTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 0]));
  gl.uniform1i(uniforms.insigniaTexture, 0);
  let insigniaReady = false;
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  return {
    // Existing same-origin project team logos, never new or manually uploaded files.
    setLogo(image: HTMLImageElement) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, insigniaTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      insigniaReady = true;
    },
    draw(canvas: HTMLCanvasElement, seconds: number) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.4);
      const width = Math.min(2400, Math.round(canvas.clientWidth * dpr));
      const height = Math.min(1500, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.clearColor(.008, .013, .022, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const angle = -.32 + Math.min(seconds, 9) * .045;
      const distance = 11.6 - Math.min(seconds, 8) * .12;
      const eye = [Math.sin(angle) * distance + 2, -Math.cos(angle) * distance, 5.6];
      gl.useProgram(program);
      gl.uniformMatrix4fv(uniforms.view, false, viewMatrix(eye, [0, 0, .45]));
      gl.uniformMatrix4fv(uniforms.projection, false, projection(width / height));
      gl.uniform3fv(uniforms.eye, Float32Array.from(eye));
      gl.uniform3fv(uniforms.accent, Float32Array.from(parseColor(color)));
      gl.uniform3fv(uniforms.second, Float32Array.from(parseColor(secondColor)));
      gl.uniform1f(uniforms.time, seconds);
      drawMeshes.forEach((mesh, i) => {
        if (mesh.material === 4 && !insigniaReady) return;
        gl.bindVertexArray(mesh.vao);
        const arrive = Math.min(1, seconds / 1.45);
        const ease = 1 - Math.pow(1 - arrive, 3);
        const badgeMotion = multiply(
          translationZ(-1.65 * (1 - ease) + Math.sin(seconds * .65) * .055),
          rotationZ((1 - ease) * -.35 + Math.sin(seconds * .4) * .07),
        );
        const platformMotion = multiply(
          rotationZ(seconds * (i > 3 ? (i % 2 ? -.03 : .02) : .02)),
          rotationZ(i === 3 ? seconds * .075 : 0),
        );
        gl.uniformMatrix4fv(uniforms.model, false, mesh.badge ? badgeMotion : platformMotion);
        gl.uniform1f(uniforms.material, mesh.material);
        gl.drawElements(gl.TRIANGLES, mesh.indices, gl.UNSIGNED_INT, 0);
      });
      gl.bindVertexArray(null);
    },
    destroy() {
      drawMeshes.forEach(m => gl.deleteVertexArray(m.vao));
      buffers.forEach(b => gl.deleteBuffer(b));
      gl.deleteTexture(insigniaTexture);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    },
  };
}

export default function DraftPick3DStage({ primary, secondary, logoUrl, onLogoReady }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const onLogoReadyRef = useRef(onLogoReady);
  onLogoReadyRef.current = onLogoReady;

  useEffect(() => {
    const canvas = ref.current;
    const fallback = fallbackRef.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'low-power' });
    } catch { /* WebGL disabled by browser */ }
    if (!gl) return;
    let stage: ReturnType<typeof initStage>;
    try {
      stage = initStage(gl, primary, secondary || primary);
    } catch {
      return; // Retain static broadcast fallback when GLSL is unavailable
    }
    if (fallback) fallback.style.opacity = '0';
    let image: HTMLImageElement | null = null;
    let disposed = false;
    if (logoUrl) {
      image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (disposed || !image || !gl || gl.isContextLost()) return;
        try {
          stage.setLogo(image);
          onLogoReadyRef.current?.();
        } catch {
          // The original 2D team logo remains visible if the GPU upload fails.
        }
      };
      image.src = logoUrl;
    }
    let handle = 0;
    const start = performance.now();
    let active = true;
    const frame = (time: number) => {
      if (!active) return;
      if (document.visibilityState === 'visible') stage.draw(canvas, (time - start) / 1000);
      handle = window.requestAnimationFrame(frame);
    };
    handle = window.requestAnimationFrame(frame);
    return () => {
      active = false;
      disposed = true;
      if (image) image.onload = null;
      window.cancelAnimationFrame(handle);
      stage.destroy();
    };
  }, [primary, secondary, logoUrl]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div ref={fallbackRef} className="absolute inset-0">
        <BroadcastMaterialStage primary={primary} secondary={secondary} variant="team" />
      </div>
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(2,5,9,.34), transparent 31%, rgba(2,5,9,.12) 65%, rgba(2,5,9,.56))' }} />
    </div>
  );
}
