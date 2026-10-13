// Planar Schwarzschild null geodesics (G = c = M = 1), sampled on a uniform grid in
// Schwarzschild coordinate time t.
// Orbit equation in u = 1/r:  u'' = -u + 3u^2,  dt/dphi = 1 / (b u^2 (1 - 2u)),  ' = d/dphi.
// Impact parameter from the null condition: 1/b^2 = u'^2 + u^2 (1 - 2u).

export const OMEGA = 1 / (3 * Math.sqrt(3));   // light-ring angular frequency
export const LAMBDA = OMEGA;                   // light-ring Lyapunov exponent (coordinate time)
export const PERIOD = 2 * Math.PI / OMEGA;     // one orbit in t

// Integrate a ray that starts at radius r0 with dr/dphi = 0 and phi increasing.
// Returns {r, phi} sampled at t = 0, dt, 2dt, ..., (n-1) dt. After the ray leaves
// (r > rOut) or reaches r < rIn, the last state is held.
export function planarRay(r0, dt, n, { h = 0.004, rOut = 60, rIn = 2.04 } = {}) {
  let u = 1 / r0, w = 0, t = 0, phi = 0;
  const b = 1 / Math.sqrt(u * u * (1 - 2 * u));
  const f = (u, w) => [w, -u + 3 * u * u, 1 / (b * u * u * (1 - 2 * u))];
  const R = new Float64Array(n), P = new Float64Array(n);
  let k = 0, rPrev = r0, pPrev = 0, tPrev = 0, done = false;
  R[0] = r0; P[0] = 0; k = 1;
  while (k < n) {
    if (!done) {
      const a1 = f(u, w);
      const a2 = f(u + 0.5 * h * a1[0], w + 0.5 * h * a1[1]);
      const a3 = f(u + 0.5 * h * a2[0], w + 0.5 * h * a2[1]);
      const a4 = f(u + h * a3[0], w + h * a3[1]);
      const un = u + h / 6 * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]);
      const wn = w + h / 6 * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]);
      const tn = t + h / 6 * (a1[2] + 2 * a2[2] + 2 * a3[2] + a4[2]);
      const pn = phi + h;
      // emit every grid time crossed in (t, tn]
      while (k < n && k * dt <= tn) {
        const s = (k * dt - t) / (tn - t);
        R[k] = 1 / u + s * (1 / un - 1 / u);
        P[k] = phi + s * h;
        k++;
      }
      u = un; w = wn; t = tn; phi = pn;
      const r = 1 / u;
      if (!(r < rOut && r > rIn) || !isFinite(r)) done = true;
    } else {
      R[k] = 1 / u; P[k] = phi; k++;
    }
  }
  return { r: R, phi: P };
}
