// Check the browser integrator against the exact light-ring values; control: a ray far
// from the ring must not show the light-ring growth.
import { planarRay, OMEGA, LAMBDA } from './geodesic.js';
const dt = 0.05, n = 1200;   // t up to 60
const eps = 1e-8;
const a = planarRay(3 * (1 + eps), dt, n), c = planarRay(3 * (1 - eps), dt, n), o = planarRay(3, dt, n);
// fit ln|r+ - r-| over 25 < t < 55
let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
for (let k = 0; k < n; k++) { const t = k * dt; if (t < 25 || t > 55) continue;
  const y = Math.log(Math.abs(a.r[k] - c.r[k])); sx += t; sy += y; sxx += t * t; sxy += t * y; m++; }
const lam = (m * sxy - sx * sy) / (m * sxx - sx * sx);
const Om = o.phi[n - 1] / ((n - 1) * dt);
console.log(`lambda fit ${lam.toFixed(6)}  exact ${LAMBDA.toFixed(6)}  rel.err ${Math.abs(lam / LAMBDA - 1).toExponential(2)}`);
console.log(`Omega     ${Om.toFixed(6)}  exact ${OMEGA.toFixed(6)}  rel.err ${Math.abs(Om / OMEGA - 1).toExponential(2)}`);
console.log(`central ray drift |r-3| at t=60: ${Math.abs(o.r[n - 1] - 3).toExponential(2)}`);
// control: rays at r0 = 10 (scattering orbit) separate without e^{lambda t}
const p = planarRay(10 * (1 + eps), dt, n), q = planarRay(10 * (1 - eps), dt, n);
const g = Math.log(Math.abs(p.r[1100] - q.r[1100]) / Math.abs(p.r[500] - q.r[500])) / 30;
console.log(`control r0=10: ln-growth rate ${g.toExponential(2)} (light ring would give ${LAMBDA.toFixed(3)})`);
