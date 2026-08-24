// mat.js — minimal matrix/vektor-matematik (kolonne-major, som WebGL forventer)

export function mat4() {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}

export function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  out[0]=f/aspect; out[1]=0; out[2]=0;  out[3]=0;
  out[4]=0; out[5]=f; out[6]=0; out[7]=0;
  out[8]=0; out[9]=0; out[10]=(far+near)/(near-far); out[11]=-1;
  out[12]=0; out[13]=0; out[14]=(2*far*near)/(near-far); out[15]=0;
  return out;
}

export function lookAt(out, eye, center, up) {
  let zx = eye[0]-center[0], zy = eye[1]-center[1], zz = eye[2]-center[2];
  let l = Math.hypot(zx,zy,zz) || 1; zx/=l; zy/=l; zz/=l;
  let xx = up[1]*zz - up[2]*zy, xy = up[2]*zx - up[0]*zz, xz = up[0]*zy - up[1]*zx;
  l = Math.hypot(xx,xy,xz) || 1; xx/=l; xy/=l; xz/=l;
  const yx = zy*xz - zz*xy, yy = zz*xx - zx*xz, yz = zx*xy - zy*xx;
  out[0]=xx; out[1]=yx; out[2]=zx; out[3]=0;
  out[4]=xy; out[5]=yy; out[6]=zy; out[7]=0;
  out[8]=xz; out[9]=yz; out[10]=zz; out[11]=0;
  out[12]=-(xx*eye[0]+xy*eye[1]+xz*eye[2]);
  out[13]=-(yx*eye[0]+yy*eye[1]+yz*eye[2]);
  out[14]=-(zx*eye[0]+zy*eye[1]+zz*eye[2]);
  out[15]=1;
  return out;
}

export function multiply(out, a, b) {
  const o = out === a || out === b ? new Float32Array(16) : out;
  for (let c = 0; c < 4; c++) {
    const b0=b[c*4], b1=b[c*4+1], b2=b[c*4+2], b3=b[c*4+3];
    o[c*4+0] = a[0]*b0 + a[4]*b1 + a[8]*b2  + a[12]*b3;
    o[c*4+1] = a[1]*b0 + a[5]*b1 + a[9]*b2  + a[13]*b3;
    o[c*4+2] = a[2]*b0 + a[6]*b1 + a[10]*b2 + a[14]*b3;
    o[c*4+3] = a[3]*b0 + a[7]*b1 + a[11]*b2 + a[15]*b3;
  }
  if (o !== out) out.set(o);
  return out;
}

/**
 * Bygger en model-matrix ud fra position, rotation (Euler XYZ) og skala.
 */
export function compose(out, pos, rot, scale) {
  const [rx, ry, rz] = rot;
  const cx=Math.cos(rx), sx=Math.sin(rx);
  const cy=Math.cos(ry), sy=Math.sin(ry);
  const cz=Math.cos(rz), sz=Math.sin(rz);
  // R = Rz * Ry * Rx
  const m00 = cz*cy,                m01 = cz*sy*sx - sz*cx,  m02 = cz*sy*cx + sz*sx;
  const m10 = sz*cy,                m11 = sz*sy*sx + cz*cx,  m12 = sz*sy*cx - cz*sx;
  const m20 = -sy,                  m21 = cy*sx,             m22 = cy*cx;
  const [sxx, syy, szz] = scale;
  out[0]=m00*sxx; out[1]=m10*sxx; out[2]=m20*sxx; out[3]=0;
  out[4]=m01*syy; out[5]=m11*syy; out[6]=m21*syy; out[7]=0;
  out[8]=m02*szz; out[9]=m12*szz; out[10]=m22*szz; out[11]=0;
  out[12]=pos[0]; out[13]=pos[1]; out[14]=pos[2]; out[15]=1;
  return out;
}

/**
 * Normal-matrix = transpose(inverse(mat3(model))). Nødvendig når skalaen ikke er ensartet.
 */
export function normalMatrix(out, m) {
  const a00=m[0], a01=m[1], a02=m[2];
  const a10=m[4], a11=m[5], a12=m[6];
  const a20=m[8], a21=m[9], a22=m[10];
  const b01 =  a22*a11 - a12*a21;
  const b11 = -a22*a10 + a12*a20;
  const b21 =  a21*a10 - a11*a20;
  let det = a00*b01 + a01*b11 + a02*b21;
  if (!det) { out.set([1,0,0, 0,1,0, 0,0,1]); return out; }
  det = 1 / det;
  // inverse(mat3) transponeret
  out[0] = b01*det;
  out[1] = (-a22*a01 + a02*a21)*det;
  out[2] = ( a12*a01 - a02*a11)*det;
  out[3] = b11*det;
  out[4] = ( a22*a00 - a02*a20)*det;
  out[5] = (-a12*a00 + a02*a10)*det;
  out[6] = b21*det;
  out[7] = (-a21*a00 + a01*a20)*det;
  out[8] = ( a11*a00 - a01*a10)*det;
  return out;
}

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
/** Rammeuafhængig udglatning — virker ens uanset framerate. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
