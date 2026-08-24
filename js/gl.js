// gl.js — en lille WebGL2-motor. Ingen eksterne biblioteker: alt hentes ind i én HTTP-request-runde.

import { mat4, normalMatrix } from './mat.js';

const SCENE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec3 aCol;
uniform mat4 uProj, uView, uModel;
uniform mat3 uNormalMat;
out vec3 vNor;
out vec3 vWorld;
out vec3 vCol;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNor = uNormalMat * aNor;
  vCol = aCol;
  gl_Position = uProj * uView * w;
}`;

const SCENE_FS = `#version 300 es
precision highp float;
in vec3 vNor;
in vec3 vWorld;
in vec3 vCol;
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform vec3 uCamPos;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
uniform float uEmissive;
uniform float uOpacity;
out vec4 frag;
void main(){
  // dobbeltsidet: bagsider vender normalen, så tynde flader (kantlister, skørter,
  // portalmembraner) lyses korrekt uanset trekanternes vinding
  vec3 n = normalize(vNor);
  if (!gl_FrontFacing) n = -n;
  vec3 base = uColor * vCol;
  float diff = max(dot(n, normalize(uLightDir)), 0.0);
  float hemi = 0.5 + 0.5 * n.y;                     // blødt himmellys ovenfra
  vec3 lit = base * (0.30 + 0.62 * diff + 0.20 * hemi);
  // svag kant-glød så de runde former læses tydeligt mod baggrunden
  vec3 viewDir = normalize(uCamPos - vWorld);
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  lit += base * rim * 0.35;
  lit = mix(lit, base * 1.15, uEmissive);
  float dist = length(vWorld - uCamPos);
  float f = clamp((dist - uFogRange.x) / max(uFogRange.y - uFogRange.x, 0.001), 0.0, 1.0);
  lit = mix(lit, uFogColor, f * f);
  frag = vec4(lit, uOpacity);
}`;

const SKY_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uTop, uMid, uBottom;
uniform float uTime;
out vec4 frag;
void main(){
  float t = vUv.y;
  vec3 c = t > 0.5 ? mix(uMid, uTop, (t - 0.5) * 2.0) : mix(uBottom, uMid, t * 2.0);
  // koncentriske ringe i himlen — verdenens cirkeltema
  vec2 p = (vUv - vec2(0.5, 0.62)) * vec2(1.8, 1.0);
  float r = length(p);
  float rings = sin(r * 34.0 - uTime * 0.35) * 0.5 + 0.5;
  c += vec3(0.035, 0.028, 0.055) * rings * smoothstep(0.9, 0.15, r);
  // blød glød omkring horisonten
  c += vec3(0.10, 0.06, 0.14) * smoothstep(0.55, 0.0, abs(t - 0.46));
  frag = vec4(c, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('Shader-fejl: ' + gl.getShaderInfoLog(s));
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('Link-fejl: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

/** Én geometri uploadet til GPU'en. */
export class Mesh {
  constructor(gl, geo) {
    this.gl = gl;
    this.count = geo.idx.length;
    this.type = geo.idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.buffers = [];
    const attach = (data, loc, size) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      this.buffers.push(b);
    };
    attach(geo.pos, 0, 3);
    attach(geo.nor, 1, 3);
    attach(geo.col, 2, 3);
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }
  dispose() {
    const gl = this.gl;
    for (const b of this.buffers) gl.deleteBuffer(b);
    gl.deleteBuffer(this.ibo);
    gl.deleteVertexArray(this.vao);
  }
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 understøttes ikke i denne browser.');
    this.gl = gl;
    this.canvas = canvas;

    this.scene = program(gl, SCENE_VS, SCENE_FS);
    this.sky = program(gl, SKY_VS, SKY_FS);

    this.u = {};
    for (const name of ['uProj','uView','uModel','uNormalMat','uColor','uLightDir','uCamPos','uFogColor','uFogRange','uEmissive','uOpacity']) {
      this.u[name] = gl.getUniformLocation(this.scene, name);
    }
    this.su = {};
    for (const name of ['uTop','uMid','uBottom','uTime']) {
      this.su[name] = gl.getUniformLocation(this.sky, name);
    }

    // fuldskærms-trekant til himlen
    this.skyVao = gl.createVertexArray();
    gl.bindVertexArray(this.skyVao);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this._nm = new Float32Array(9);
    this._identity = mat4();
    this.dpr = 1;
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.dpr = dpr;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    return this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1);
  }

  drawSky(top, mid, bottom, time) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(this.sky);
    gl.uniform3fv(this.su.uTop, top);
    gl.uniform3fv(this.su.uMid, mid);
    gl.uniform3fv(this.su.uBottom, bottom);
    gl.uniform1f(this.su.uTime, time);
    gl.bindVertexArray(this.skyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  beginScene({ proj, view, camPos, lightDir, fogColor, fogNear, fogFar }) {
    const gl = this.gl;
    gl.useProgram(this.scene);
    gl.uniformMatrix4fv(this.u.uProj, false, proj);
    gl.uniformMatrix4fv(this.u.uView, false, view);
    gl.uniform3fv(this.u.uCamPos, camPos);
    gl.uniform3fv(this.u.uLightDir, lightDir);
    gl.uniform3fv(this.u.uFogColor, fogColor);
    gl.uniform2f(this.u.uFogRange, fogNear, fogFar);
    this.setBlend(false);
  }

  setBlend(on) {
    const gl = this.gl;
    if (on) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    } else {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }
  }

  /** Tegner en mesh. model = matrix eller null for identitet (verdenskoordinater bagt ind). */
  draw(mesh, model, color, emissive = 0, opacity = 1) {
    const gl = this.gl;
    const m = model || this._identity;
    gl.uniformMatrix4fv(this.u.uModel, false, m);
    normalMatrix(this._nm, m);
    gl.uniformMatrix3fv(this.u.uNormalMat, false, this._nm);
    gl.uniform3fv(this.u.uColor, color);
    gl.uniform1f(this.u.uEmissive, emissive);
    gl.uniform1f(this.u.uOpacity, opacity);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.type, 0);
  }

  clearDepth() {
    this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
  }
}
