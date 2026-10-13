# Eikonal quasinormal modes at the Schwarzschild light ring

An interactive 3D page showing quasinormal modes of a Schwarzschild black hole in the eikonal
(geometric-optics) limit, as bundles of null geodesics at the light ring $r=3M$.

- **Bundle:** a thin bundle of rays orbiting the light ring. It spreads radially as $e^{\lambda t}$ with
  $\lambda=1/(3\sqrt3M)$ and focuses out of the plane every half orbit. Copies are restarted at regular
  intervals, using the rotation symmetry, and fade as $e^{-\lambda t/2}$, the mode's damping.
- **Ring:** rays starting on a great circle of the photon sphere with orbital planes tilted by $\iota$;
  $\iota=90^\circ$ sends all of them towards the north pole ($m=0$).
- **Spin 2:** rings of test particles at the light ring, deformed by the transverse strain of an
  $\ell=m$ mode, next to the ray bundle.

All rays are exact Schwarzschild null geodesics, integrated in the browser (`geodesic.js`, RK4 in
the orbital angle). `node test_geodesic.mjs` checks the integrator against the exact light-ring
frequency and Lyapunov exponent.

Open `index.html` through any static web server. Uses three.js and KaTeX from a CDN.

Part of the project *Visualizing gravitational waves* (task `t01-eikonal-lightring`).
MIT licence.
