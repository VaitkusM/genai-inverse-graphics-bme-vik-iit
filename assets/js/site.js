/* Theme toggle + hero scene.
 *
 * The hero performs the course pipeline in one loop:
 *   input (a typed prompt and a sketch) -> +noise -> (denoise, step by step) -> a 2D image
 *   -> (inverse: 2D -> 3D) -> a Gaussian-splat model seen by orbiting cameras
 *   -> (graphics: 3D -> 2D) -> image
 * The stage rail under the hero highlights whichever step is on screen, and seeks on click.
 *
 * One distance field defines the cat. It is ray-traced once into the "generated image",
 * and sampled into the Gaussians that a small WebGL2 splat rasteriser draws.
 */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------- Theme ---------- */
  var toggle = document.querySelector('.theme-toggle');

  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch (e) {}
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      setTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
    });
  }

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function (e) {
    var saved = null;
    try { saved = localStorage.getItem('theme'); } catch (err) {}
    if (!saved) root.setAttribute('data-theme', e.matches ? 'light' : 'dark');
  });

  /* kramdown emits a header row of non-breaking spaces for header-less tables */
  Array.prototype.forEach.call(document.querySelectorAll('thead'), function (th) {
    if (!th.textContent.replace(/ /g, '').trim()) th.hidden = true;
  });

  /* ---------- Hero scene ---------- */
  var canvas = document.querySelector('.hero-canvas');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var rail = document.querySelector('.rail');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var FX = 0.85, FY = 1.1, PXS = 0.01;                 // image frame half-extents, pixel size
  var IW = Math.round(2 * FX / PXS), IH = Math.round(2 * FY / PXS);
  var CAM = 4.2, LIGHT = [-0.42, 0.58, 0.7], FILL = [0.72, -0.2, 0.66];

  var seed = 20260223;
  function rand() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function gauss() {
    var u = 1 - rand(), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function smooth(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }
  function ramp01(a, b, x) { return smooth((x - a) / (b - a)); }

  /* ---- The cat as a smooth distance field: blended ellipsoids and tapered capsules ---- */
  function sE(x, y, z, cx, cy, cz, rx, ry, rz, m) {
    x = (x - cx) / rx; y = (y - cy) / ry; z = (z - cz) / rz;
    return (Math.sqrt(x * x + y * y + z * z) - 1) * m;
  }
  function sC(x, y, z, ax, ay, az, bx, by, bz, ra, rb) {
    bx -= ax; by -= ay; bz -= az; x -= ax; y -= ay; z -= az;
    var h = (x * bx + y * by + z * bz) / (bx * bx + by * by + bz * bz);
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    x -= bx * h; y -= by * h; z -= bz * h;
    return Math.sqrt(x * x + y * y + z * z) - (ra + (rb - ra) * h);
  }
  function sm(a, b, k) { var h = k - Math.abs(a - b); if (h < 0) h = 0; h /= k; return (a < b ? a : b) - h * h * k * 0.25; }

  /* The tail lies on the ground, curled round the right side to the front paws. */
  var TAIL = [[0.1, -0.9, -0.5], [0.8, -0.94, -0.52], [0.82, -0.945, 0.58], [0.2, -0.95, 0.6]];
  var TX = [], TY = [], TZ = [], TR = [];
  function tailAt(s) {
    var q = 1 - s, c = [0, 0, 0];
    for (var k = 0; k < 3; k++) {
      c[k] = q * q * q * TAIL[0][k] + 3 * q * q * s * TAIL[1][k] + 3 * q * s * s * TAIL[2][k] + s * s * s * TAIL[3][k];
    }
    return c;
  }
  for (var ti = 0; ti <= 10; ti++) {
    var tc = tailAt(ti / 10);
    TX.push(tc[0]); TY.push(tc[1]); TZ.push(tc[2]); TR.push(0.066 * (1 - 0.42 * ti / 10));
  }
  var tlD = 9, tlT = 0;
  function tailNear(x, y, z) {               // distance to the tail's surface, and where along it
    tlD = 9;
    for (var i = 0; i < 10; i++) {
      var bx = TX[i + 1] - TX[i], by = TY[i + 1] - TY[i], bz = TZ[i + 1] - TZ[i], px = x - TX[i], py = y - TY[i], pz = z - TZ[i];
      var h = (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz);
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      px -= bx * h; py -= by * h; pz -= bz * h;
      var d = Math.sqrt(px * px + py * py + pz * pz) - (TR[i] + (TR[i + 1] - TR[i]) * h);
      if (d < tlD) { tlD = d; tlT = i + h; }
    }
  }

  var HS = 1.13, HPY = 0.36, HPZ = 0.12;      // the head is modelled at unit size, then scaled about the top of the neck
  function headD(x, y, z) {
    var q = x < 0 ? -x : x;
    var h = sE(x, y, z, 0, 0.475, 0.16, 0.205, 0.18, 0.2, 0.18);             // skull
    h = sm(h, sE(q, y, z, 0.105, 0.41, 0.23, 0.11, 0.085, 0.1, 0.085), 0.06);       // cheeks
    h = sm(h, sC(x, y, z, 0, 0.52, 0.32, 0, 0.44, 0.39, 0.04, 0.03), 0.04);  // bridge of the nose
    h = sm(h, sE(x, y, z, 0, 0.405, 0.335, 0.075, 0.05, 0.065, 0.05), 0.05); // muzzle
    h = sm(h, sE(q, y, z, 0.035, 0.395, 0.365, 0.045, 0.036, 0.04, 0.036), 0.025);  // whisker pads
    h = sm(h, sE(x, y, z, 0, 0.356, 0.325, 0.045, 0.03, 0.04, 0.03), 0.03);  // chin
    // ears: thin cones, hollowed from the front
    var zz = (z - 0.11) * 2.1;
    var e = sC(q, y, zz, 0.13, 0.58, 0, 0.2, 0.8, -0.05, 0.12, 0.016);
    var c = sC(q, y, zz - 0.1, 0.135, 0.615, 0, 0.196, 0.755, -0.05, 0.088, 0.004);
    e = -sm(-e, c, 0.025) * 0.47;
    h = sm(h, e, 0.03);
    return h;
  }

  function sdf(x, y, z) {
    var q = x < 0 ? -x : x;                                                    // left/right symmetry
    var d = sE(x, y, z, 0, -0.68, -0.2, 0.34, 0.32, 0.36, 0.32);                // rump
    d = sm(d, sC(x, y, z, 0, -0.55, -0.16, 0, 0.05, 0.03, 0.31, 0.215), 0.1);   // back and ribcage, leaning forward
    d = sm(d, sE(x, y, z, 0, -0.1, 0.14, 0.19, 0.25, 0.14, 0.14), 0.09);        // breast
    d = sm(d, sE(q, y, z, 0.19, -0.03, 0.07, 0.115, 0.22, 0.15, 0.115), 0.1);   // shoulders
    d = sm(d, sC(x, y, z, 0, 0.1, 0.04, 0, 0.36, 0.12, 0.2, 0.165), 0.09);      // neck
    d = sm(d, sE(q, y, z, 0.25, -0.7, -0.06, 0.18, 0.28, 0.3, 0.18), 0.08);     // thighs
    d = sm(d, sE(q, y, z, 0.3, -0.957, 0.2, 0.062, 0.043, 0.13, 0.043), 0.04);  // hind paws
    d = sm(d, sC(q, y, z, 0.13, -0.1, 0.2, 0.122, -0.9, 0.3, 0.092, 0.06), 0.05);    // forelegs
    d = sm(d, sE(q, y, z, 0.124, -0.955, 0.37, 0.07, 0.046, 0.1, 0.046), 0.035);    // fore paws
    if (y > 0.2) d = sm(d, headD(x / HS, HPY + (y - HPY) / HS, HPZ + (z - HPZ) / HS) * HS, 0.06);
    if (y < -0.78 && x > -0.1) {
      for (var i = 0; i < 10; i++) {
        d = sm(d, sC(x, y, z, TX[i], TY[i], TZ[i], TX[i + 1], TY[i + 1], TZ[i + 1], TR[i], TR[i + 1]), i ? 0.02 : 0.06);
      }
    }
    return d;
  }
  var gnx = 0, gny = 0, gnz = 1;
  function grad(x, y, z) {
    var e = 0.003;
    gnx = sdf(x + e, y, z) - sdf(x - e, y, z);
    gny = sdf(x, y + e, z) - sdf(x, y - e, z);
    gnz = sdf(x, y, z + e) - sdf(x, y, z - e);
    var l = Math.sqrt(gnx * gnx + gny * gny + gnz * gnz) || 1;
    gnx /= l; gny /= l; gnz /= l;
  }

  function hash3(i, j, k) {
    var n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1440662683);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function noise3(x, y, z) {                  // smooth value noise, 0..1
    var i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
    x -= i; y -= j; z -= k;
    x = x * x * (3 - 2 * x); y = y * y * (3 - 2 * y); z = z * z * (3 - 2 * z);
    var a = hash3(i, j, k), b = hash3(i + 1, j, k), c = hash3(i, j + 1, k), d = hash3(i + 1, j + 1, k);
    var e = hash3(i, j, k + 1), f = hash3(i + 1, j, k + 1), g = hash3(i, j + 1, k + 1), h = hash3(i + 1, j + 1, k + 1);
    a += (b - a) * x; c += (d - c) * x; e += (f - e) * x; g += (h - g) * x;
    a += (c - a) * y; e += (g - e) * y;
    return a + (e - a) * z;
  }

  /* Surface look: a tabby coat with a white bib, muzzle and socks. Hue runs along the ramp,
     sat says how much of it shows through the grey of the fur, tone is brightness.
     Kinds: 1 fur, 2 iris, 3 pupil, 4 nose leather, 5 highlight. */
  var EYE = [0.088, 0.492, 0.052, 0.034];    // centre x, y; half-width, half-height
  var pHue = 0, pSat = 0.5, pTone = 1, pKind = 1;
  function paint(x, y, z, nx, ny, nz) {
    var ao = sdf(x + nx * 0.08, y + ny * 0.08, z + nz * 0.08) / 0.08;
    var hk = 1 + (HS - 1) * ramp01(0.3, 0.4, y);                               // head-local coordinates above the neck
    x /= hk; y = HPY + (y - HPY) / hk; z = HPZ + (z - HPZ) / hk;
    var ax = x < 0 ? -x : x;
    var ex = ax - EYE[0], ey = y - EYE[1] - 0.25 * ex;                         // almond, outer corner higher
    var er = (ex / EYE[2]) * (ex / EYE[2]) + (ey / EYE[3]) * (ey / EYE[3]);
    if (z > 0.24 && er < 1) {
      var px = ex / 0.0125, py = ey / 0.031;
      if (px * px + py * py < 1) { pKind = 3; pHue = 1; pSat = 1; pTone = 1; return; }
      var rr = Math.min(1, Math.sqrt(ex * ex + ey * ey) / 0.047);
      pKind = 2; pHue = 0.76 + 0.24 * rr; pSat = 1;
      pTone = (1.12 - 0.5 * rr * rr) * (1 - 0.35 * ramp01(0.006, 0.03, ey)) * (0.9 + 0.2 * noise3(x * 160, y * 160, z * 160));
      return;
    }
    if (z > 0.37 && y > 0.411 && y < 0.449 && ax < (y - 0.408) * 0.72 + 0.003) { pKind = 4; pHue = 0; pSat = 0; pTone = 0.95; return; }
    pKind = 1;
    pSat = 1;
    pTone = 0.45 + 0.55 * (ao < 0 ? 0 : ao > 1 ? 1 : ao);
    var w = noise3(x * 4.5 + 7, y * 4.5, z * 4.5) - 0.5, w2 = noise3(x * 11, y * 11 + 3, z * 11) - 0.5;
    var onTail = 0, stripe;
    pHue = 0.5 * ramp01(-0.25, 0.3, z * 0.7 - ny * 0.25 + w * 0.5);            // darker along the back, paler beneath
    if (y < -0.8) { tailNear(x, y, z); onTail = ramp01(0.03, 0.005, tlD); }
    if (y > 0.3) {                                                            // head: an M on the brow, bars on the cheeks
      var brow = Math.sin(ax * 62 + w * 5 + 0.4), cheek = Math.sin((y - 0.34 * ax) * 78 + w * 5);
      var kc = ramp01(0.1, 0.16, ax) * ramp01(0.52, 0.47, y);
      stripe = (brow + (cheek - brow) * kc) * ramp01(0.5, 0.56, y + kc) * (1 - ramp01(0.56, 0.62, y) * ramp01(0.1, 0.2, nz) * ramp01(0.09, 0.13, ax));
    } else {                                                                  // body and legs: bars across the spine
      stripe = Math.sin((y + 0.5 * z - 0.22 * ax) * 27 + w * 7 + w2 * 2);
    }
    if (onTail > 0) stripe += (Math.sin(tlT * 3.6 + 0.8) - stripe) * onTail;   // rings on the tail
    stripe = ramp01(0.25, 0.8, stripe);
    // white: bib, muzzle and chin, socks
    var bib = ramp01(0.0, 0.14, z + w * 0.08) * ramp01(0.21, 0.07, ax + w2 * 0.05) * ramp01(0.34, 0.16, y) * ramp01(-0.5, -0.28, y + w * 0.1);
    var muz = ramp01(0.27, 0.31, z) * ramp01(0.115, 0.07, ax + w2 * 0.03) * ramp01(0.455, 0.425, y - 0.5 * ax);
    var sock = ramp01(-0.84, -0.9, y + w2 * 0.05) * ramp01(0.04, 0.12, z) * (1 - onTail);
    var white = Math.max(bib, muz, sock);
    var inEar = ramp01(0.6, 0.66, y) * ramp01(0.15, 0.4, nz) * ramp01(0.08, 0.12, ax);
    pTone *= 1 - 0.62 * stripe * (1 - white) * (1 - inEar);
    pSat *= 1 - 0.86 * white; pTone *= 1 + 0.5 * white;
    pHue += (1 - pHue) * inEar; pSat *= 1 - 0.25 * inEar; pTone *= 1 - 0.1 * inEar;
    pTone *= 1 - 0.62 * ramp01(1.75, 1.05, er) * (z > 0.24 ? 1 : 0);          // dark rims round the eyes
    if (z > 0.36 && ax < 0.006 && y > 0.383 && y < 0.412) pTone *= 0.5;        // the line under the nose
  }

  /* ---- Colours from the CSS tokens ---- */
  /* ---- Colours from the CSS tokens ---- */
  var stops = [], bgRGB = [11, 13, 18], darkRGB = [11, 13, 18];
  var lineCol = '#888', surfaceCol = '#111', accentCol = '#88f', camCols = ['#888', '#888', '#888'];

  function hexToRgb(h) {
    h = h.trim().replace('#', '');
    if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  var rc = [0, 0, 0];
  function rampRGB(h) {
    var f = (h < 0 ? 0 : h > 1 ? 1 : h) * (stops.length - 1), a = Math.floor(f), t = f - a;
    var s0 = stops[a], s1 = stops[Math.min(a + 1, stops.length - 1)];
    rc[0] = s0[0] + (s1[0] - s0[0]) * t; rc[1] = s0[1] + (s1[1] - s0[1]) * t; rc[2] = s0[2] + (s1[2] - s0[2]) * t;
  }
  /* Natural colours, independent of the theme. Fur runs from the darker back (hue 0) through the
     lighter flanks (0.5) to the pink skin inside the ears (1); sat fades it to white. */
  var FURS = [[158, 104, 58], [206, 152, 94], [222, 158, 148]], WHITE = [242, 238, 230];
  var IRIS = [[118, 150, 66], [208, 170, 56]], LEATHER = [196, 124, 128];
  function albedo(kind, hue, sat) {           // into rc
    if (kind === 3) { rc[0] = darkRGB[0]; rc[1] = darkRGB[1]; rc[2] = darkRGB[2]; return; }
    if (kind === 4) { rc[0] = LEATHER[0]; rc[1] = LEATHER[1]; rc[2] = LEATHER[2]; return; }
    if (kind === 5) { rc[0] = rc[1] = rc[2] = 255; return; }
    var c, t;
    if (kind === 2) {                          // iris: green by the pupil, gold at the rim
      t = Math.min(1, Math.max(0, (hue - 0.76) / 0.24));
      for (c = 0; c < 3; c++) rc[c] = IRIS[0][c] + (IRIS[1][c] - IRIS[0][c]) * t;
      return;
    }
    t = Math.min(1, Math.max(0, hue)) * 2;
    var a = FURS[t < 1 ? 0 : 1], b = FURS[t < 1 ? 1 : 2];
    t -= t < 1 ? 0 : 1;
    for (c = 0; c < 3; c++) rc[c] = WHITE[c] + (a[c] + (b[c] - a[c]) * t - WHITE[c]) * sat;
  }
  function readTheme() {
    var cs = getComputedStyle(root), isLight = root.getAttribute('data-theme') === 'light';
    lineCol = (cs.getPropertyValue('--text-muted') || '#888').trim();
    surfaceCol = (cs.getPropertyValue('--bg') || '#111').trim();
    accentCol = (cs.getPropertyValue('--r1') || '#88f').trim();
    stops = [];
    for (var i = 1; i <= 5; i++) stops.push(hexToRgb(cs.getPropertyValue('--r' + i) || '#888888'));
    bgRGB = hexToRgb(cs.getPropertyValue('--bg') || '#101010');
    darkRGB = isLight ? hexToRgb(cs.getPropertyValue('--text-heading') || '#101010') : [8, 9, 14];
    camCols = [0.12, 0.5, 0.82].map(function (h) { rampRGB(h); return 'rgb(' + rc.map(Math.round).join(',') + ')'; });
  }

  /* ---- Views of the distance field, ray-traced: the generated image and the cameras' pictures ---- */
  function makeView(w, h, pxs, az, el) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return { w: w, h: h, pxs: pxs, az: az, el: el, row: 0, canvas: c,
             kind: new Uint8Array(w * h), hue: new Float32Array(w * h), sat: new Float32Array(w * h), lit: new Float32Array(w * h), rim: new Float32Array(w * h) };
  }
  var NP = IW * IH, mainView = makeView(IW, IH, PXS, 0, 0);
  var LEVELS = [new Float32Array(NP * 3), new Float32Array(NP * 3), new Float32Array(NP * 3), new Float32Array(NP * 3)];
  var NE = NP * 3 + 4099, EPS = new Float32Array(NE);
  for (var ei = 0; ei < NE; ei++) EPS[ei] = Math.max(-1.25, Math.min(1.25, gauss() * 0.55));
  var imgC = mainView.canvas, ictx = imgC.getContext('2d'), imgData = ictx.createImageData(IW, IH), imgKey = '';
  var imageReady = false;

  function traceRow(V, j) {   // camera on the direction (az, el), framed like the scene camera
    var ca = Math.cos(-V.az), sa = Math.sin(-V.az), ce = Math.cos(V.el), se = Math.sin(V.el);
    var oy = CAM * se, ozv = CAM * ce, ox = -ozv * sa, oz = ozv * ca;
    var y = FY - (j + 0.5) * V.pxs;
    for (var i = 0; i < V.w; i++) {
      var x = -FX + (i + 0.5) * V.pxs, k = j * V.w + i;
      var dl = Math.sqrt(x * x + y * y + CAM * CAM), dx = x / dl, dy = y / dl, dz = -CAM / dl;
      var vy = dy * ce + dz * se, vz = -dy * se + dz * ce, mx = dx * ca - vz * sa, mz = dx * sa + vz * ca;
      var t = CAM - 1.3, tEnd = CAM + 1.3, hit = false, px = 0, py = 0, pz = 0;
      for (var s = 0; s < 64 && t < tEnd; s++) {
        px = ox + mx * t; py = oy + vy * t; pz = oz + mz * t;
        var d = sdf(px, py, pz);
        if (d < 0.0025) { hit = true; break; }
        t += d * 0.92 + 0.001;
      }
      if (!hit) { V.kind[k] = 0; continue; }
      grad(px, py, pz);
      paint(px, py, pz, gnx, gny, gnz);
      // normal into this camera's frame, so every view is lit the same way
      var nxr = gnx * ca + gnz * sa, nzr = -gnx * sa + gnz * ca, nyr = gny * ce - nzr * se;
      nzr = gny * se + nzr * ce;
      var diff = Math.max(0, nxr * LIGHT[0] + nyr * LIGHT[1] + nzr * LIGHT[2]);
      var fill = Math.max(0, nxr * FILL[0] + nyr * FILL[1] + nzr * FILL[2]);
      V.kind[k] = pKind; V.hue[k] = pHue; V.sat[k] = pSat;
      V.lit[k] = pKind === 3 || pKind === 5 ? 1 : (0.24 + 0.82 * diff + 0.2 * fill) * pTone;
      V.rim[k] = pKind === 1 ? Math.pow(1 - Math.abs(nxr * dx + nyr * dy + nzr * dz), 3) * 0.4 : 0;
    }
  }
  function blur(src, dst, r) {     // separable box blur, edges clamped
    var tmp = new Float32Array(NP * 3), x, y, c, k, acc, n = 2 * r + 1;
    for (y = 0; y < IH; y++) for (x = 0; x < IW; x++) for (c = 0; c < 3; c++) {
      acc = 0;
      for (k = -r; k <= r; k++) acc += src[(y * IW + Math.min(IW - 1, Math.max(0, x + k))) * 3 + c];
      tmp[(y * IW + x) * 3 + c] = acc / n;
    }
    for (y = 0; y < IH; y++) for (x = 0; x < IW; x++) for (c = 0; c < 3; c++) {
      acc = 0;
      for (k = -r; k <= r; k++) acc += tmp[(Math.min(IH - 1, Math.max(0, y + k)) * IW + x) * 3 + c];
      dst[(y * IW + x) * 3 + c] = acc / n;
    }
  }
  function colourView(V, X) {   // X: rgb floats, 0..255
    var c, shot = splatsReady && gl ? shootView(V) : null;   // once the model exists, its own rendering
    for (var j = 0; j < V.h; j++) {
      var y = FY - (j + 0.5) * V.pxs;
      for (var i = 0; i < V.w; i++) {
        var x = -FX + (i + 0.5) * V.pxs, k = j * V.w + i, o = k * 3;
        if (shot || V.kind[k] === 0) {                         // backdrop: wall, floor, contact shadow
          var floor = y < -0.985, g = floor ? 0.2 : 0.1 + 0.07 * (y + FY) / (2 * FY);
          rampRGB(floor ? 0.3 : 0.08);
          var sh = Math.exp(-(x * x / 0.5 + (y + 1.0) * (y + 1.0) / 0.006)) * 0.5;
          var vg = 1 - 0.13 * (x * x / (FX * FX) + y * y / (FY * FY));
          for (c = 0; c < 3; c++) X[o + c] = (bgRGB[c] + (rc[c] - bgRGB[c]) * g) * (1 - sh) * vg;
          if (shot) {
            var sa = shot[k * 4 + 3] / 255;
            for (c = 0; c < 3; c++) X[o + c] += (shot[k * 4 + c] - X[o + c]) * sa;
          }
        } else {
          albedo(V.kind[k], V.hue[k], V.sat[k]);
          var L = Math.min(1.2, V.lit[k]) + V.rim[k];
          for (c = 0; c < 3; c++) X[o + c] = Math.min(255, rc[c] * L);
        }
      }
    }
  }
  function colourImage() {
    colourView(mainView, LEVELS[0]);
    blur(LEVELS[0], LEVELS[1], 4); blur(LEVELS[1], LEVELS[2], 8); blur(LEVELS[2], LEVELS[3], 16);
    imgKey = '';
  }
  function colourThumb(V) {
    var X = new Float32Array(V.w * V.h * 3), g = V.canvas.getContext('2d'), im = g.createImageData(V.w, V.h);
    colourView(V, X);
    for (var i = 0, q = 0; i < X.length; i += 3, q += 4) { im.data[q] = X[i]; im.data[q + 1] = X[i + 1]; im.data[q + 2] = X[i + 2]; im.data[q + 3] = 255; }
    g.putImageData(im, 0, 0);
  }
  /* x_t = a(t) * (a blurry-then-sharp estimate of the image) + b(t) * fresh Gaussian noise per step */
  /* Alongside x_t the network's current clean estimate is kept, and both are reduced
     to half, quarter, eighth and sixteenth size: the U-Net's feature maps. */
  var estC = document.createElement('canvas');
  estC.width = IW; estC.height = IH;
  var ectx = estC.getContext('2d'), estData = ectx.createImageData(IW, IH);
  function mipChain() {
    return [2, 4, 8, 16].map(function (d) {
      var c = document.createElement('canvas');
      c.width = Math.round(IW / d); c.height = Math.round(IH / d);
      return c;
    });
  }
  var mipX = mipChain(), mipE = mipChain();
  function reduce(src, chain) {
    var prev = src;
    chain.forEach(function (c) {
      var g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.drawImage(prev, 0, 0, c.width, c.height);
      prev = c;
    });
  }
  function renderImage(T, step) {
    var key = T.toFixed(4) + ':' + step;
    if (key === imgKey) return;
    imgKey = key;
    var ph = T * Math.PI / 2, a = Math.sin(ph), b = Math.pow(Math.cos(ph), 1.5);
    var lv = 3 * Math.pow(1 - T, 1.4), l0 = Math.floor(lv), f = lv - l0, A = LEVELS[l0], B = LEVELS[Math.min(3, l0 + 1)];
    var off = (step * 7919) % 4099, d = imgData.data, e = estData.data;
    for (var i = 0, q = 0, n = NP * 3; i < n; i += 3, q += 4) {
      var r0 = A[i] + (B[i] - A[i]) * f, g0 = A[i + 1] + (B[i + 1] - A[i + 1]) * f, b0 = A[i + 2] + (B[i + 2] - A[i + 2]) * f;
      e[q] = r0; e[q + 1] = g0; e[q + 2] = b0; e[q + 3] = 255;
      d[q] = a * r0 + b * (128 + 100 * EPS[i + off]);
      d[q + 1] = a * g0 + b * (128 + 100 * EPS[i + 1 + off]);
      d[q + 2] = a * b0 + b * (128 + 100 * EPS[i + 2 + off]);
      d[q + 3] = 255;
    }
    ictx.putImageData(imgData, 0, 0);
    ectx.putImageData(estData, 0, 0);
    reduce(imgC, mipX); reduce(estC, mipE);
  }

  /* ---- The 3D model as Gaussians: centre, two scaled tangent axes, normal, colour ---- */
  var SMAX = 32768, SM = 0, STRIDE = 22;
  var SRC = new Float32Array(SMAX * STRIDE), DST = new Float32Array(SMAX * STRIDE);
  var Shue = new Float32Array(SMAX), Ssat = new Float32Array(SMAX), Skind = new Uint8Array(SMAX), skeys = new Float64Array(SMAX);
  var splatsReady = false;

  function addSplat(cx, cy, cz, nx, ny, nz, tx, ty, tz, s1, s2, hue, kind, alpha, tone, spec) {
    if (SM >= SMAX) return;
    // make t a unit tangent, b = n x t
    var k = tx * nx + ty * ny + tz * nz; tx -= nx * k; ty -= ny * k; tz -= nz * k;
    var l = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (l < 0.05) { tx = ny; ty = -nx; tz = 0; l = Math.sqrt(tx * tx + ty * ty) || 1; if (l === 1 && !tx && !ty) tx = 1; }
    tx /= l; ty /= l; tz /= l;
    var bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx, o = SM * STRIDE;
    SRC[o] = cx; SRC[o + 1] = cy; SRC[o + 2] = cz;
    SRC[o + 3] = tx * s1; SRC[o + 4] = ty * s1; SRC[o + 5] = tz * s1;
    SRC[o + 6] = bx * s2; SRC[o + 7] = by * s2; SRC[o + 8] = bz * s2;
    SRC[o + 9] = nx; SRC[o + 10] = ny; SRC[o + 11] = nz;
    SRC[o + 15] = alpha; SRC[o + 16] = tone; SRC[o + 17] = spec;
    SRC[o + 18] = gauss(); SRC[o + 19] = gauss(); SRC[o + 20] = gauss(); SRC[o + 21] = rand() * 0.93;   // training: start offset, birth
    Shue[SM] = hue; Ssat[SM] = pSat; Skind[SM] = kind; SM++;
  }
  var spx = 0, spy = 0, spz = 0;
  function surfacePoint(x0, x1, y0, y1, z0, z1) {   // drop a random point onto the surface
    for (;;) {
      var x = x0 + rand() * (x1 - x0), y = y0 + rand() * (y1 - y0), z = z0 + rand() * (z1 - z0), d = sdf(x, y, z);
      if (d > 0.2 || d < -0.2) continue;
      for (var it = 0; it < 6 && (d > 0.002 || d < -0.002); it++) {
        grad(x, y, z);
        x -= gnx * d; y -= gny * d; z -= gnz * d;
        d = sdf(x, y, z);
      }
      if (d < 0.004 && d > -0.004) { grad(x, y, z); spx = x; spy = y; spz = z; return; }
    }
  }
  /* An undercoat of round splats just beneath the surface keeps the body solid; over it lie
     thin strands combed the way the fur grows: back from the nose, down the body, along the tail. */
  var COAT = 6500, FUR = 27500;
  function sampleFur(count) {
    for (var i = 0; i < count && SM < FUR; i++) {
      surfacePoint(-0.5, 0.95, -1.03, 0.93, -0.66, 0.66);
      var x = spx, y = spy, z = spz, nx = gnx, ny = gny, nz = gnz;
      paint(x, y, z, nx, ny, nz);
      if (pKind !== 1) continue;
      if (SM < COAT) {
        var r = 0.016 * Math.exp(gauss() * 0.2);
        addSplat(x - nx * 0.006, y - ny * 0.006, z - nz * 0.006, nx, ny, nz, gauss(), gauss(), gauss(), r, r * 0.9,
          pHue, 1, 0.94, pTone * 0.92, 0);
        continue;
      }
      var fx = gauss() * 0.3, fy = -1, fz = -0.25 + gauss() * 0.3, face = y > 0.3 && z > 0.12;
      if (y > 0.3) { fx = x * 4 + gauss() * 0.25; fy = (y - 0.44) * 4 + gauss() * 0.25; fz = (z - 0.46) * 4; }
      if (y < -0.8) {
        tailNear(x, y, z);
        if (tlD < 0.02) { var k = Math.min(9, Math.floor(tlT)); fx = TX[k + 1] - TX[k]; fy = TY[k + 1] - TY[k]; fz = TZ[k + 1] - TZ[k]; }
      }
      var len = (face ? 0.0085 : 0.0165) * Math.exp(gauss() * 0.28), lift = rand() * 0.005;
      addSplat(x + nx * lift, y + ny * lift, z + nz * lift, nx, ny, nz, fx, fy, fz,
        len, face ? 0.0042 : 0.0052,
        pHue + gauss() * 0.012, 1, 0.86, pTone * (0.8 + rand() * 0.36), 0.04);
    }
    return SM >= FUR;
  }
  function sampleDetails() {
    var i, sx, it, pd;
    var WX = 0, WY = 0;
    function frontZ(x, y) {                    // head-local x, y -> the world point on the face (WX, WY, returned z)
      WX = x * HS; WY = HPY + (y - HPY) * HS;
      var z = 0.7; for (it = 0; it < 30; it++) { pd = sdf(WX, WY, z); z -= pd; if (pd < 0.0008) break; }
      grad(WX, WY, z); return z;
    }
    function headPoint(x0, x1, y0, y1, z0, z1) {
      surfacePoint(x0 * HS, x1 * HS, HPY + (y0 - HPY) * HS, HPY + (y1 - HPY) * HS, HPZ + (z0 - HPZ) * HS, HPZ + (z1 - HPZ) * HS);
    }
    for (sx = -1; sx <= 1; sx += 2) {
      for (i = 0; i < 520; i++) {                         // iris: small round splats
        if (sx < 0) headPoint(-0.16, -0.02, 0.43, 0.56, 0.25, 0.42); else headPoint(0.02, 0.16, 0.43, 0.56, 0.25, 0.42);
        paint(spx, spy, spz, gnx, gny, gnz);
        if (pKind !== 2) continue;
        addSplat(spx + gnx * 0.007, spy + gny * 0.007, spz + gnz * 0.007, gnx, gny, gnz, gauss(), gauss(), gauss(), 0.0062 * HS, 0.0058 * HS, pHue, 2, 0.96, pTone, 0.05);
        SRC[(SM - 1) * STRIDE + 21] = 0.45 + rand() * 0.25;   // eyes resolve late in training
      }
      pSat = 1;
      for (i = -2; i <= 2; i++) {                         // pupil: a column of upright Gaussians
        var py = EYE[1] + i * 0.0105, pz = frontZ(sx * EYE[0], py), a = Math.abs(i);
        addSplat(WX + gnx * 0.013, WY + gny * 0.013, pz + gnz * 0.013, gnx, gny, gnz, 0, 1, 0, (0.0108 - a * 0.0016) * HS, (0.0064 - a * 0.0012) * HS, 1, 3, 0.99, 1, 0);
        SRC[(SM - 1) * STRIDE + 21] = 0.72 + rand() * 0.15;
      }
      var gz = frontZ(sx * EYE[0] - 0.014, EYE[1] + 0.012);   // the light, reflected in the eye
      addSplat(WX + gnx * 0.02, WY + gny * 0.02, gz + gnz * 0.02, gnx, gny, gnz, 1, 0, 0, 0.005, 0.005, 1, 5, 0.97, 1, 0);
      SRC[(SM - 1) * STRIDE + 21] = 0.9;
      pSat = 0.04;
      [[0.05, 0.4, 0.14, 0.24], [0.055, 0.392, 0.02, 0.25], [0.05, 0.384, -0.1, 0.23], [0.04, 0.378, -0.2, 0.18],   // whiskers
       [0.07, 0.545, 0.55, 0.11], [0.085, 0.55, 0.75, 0.1]].forEach(function (wk) {                                  // and brows
        var dl = Math.sqrt(1 + wk[2] * wk[2] + 0.02), dx = sx / dl, wy = wk[2] / dl, dz = 0.14 / dl, half = wk[3] / 2 * HS;
        var bz = frontZ(sx * wk[0], wk[1]);
        addSplat(WX + dx * half, WY + wy * half, bz + dz * half, -dz, 0, dx, dx, wy, dz, half / 3, 0.0019, 0.5, 1, 0.5, 1.5, 0);
        SRC[(SM - 1) * STRIDE + 21] = 0.93;
      });
    }
    for (i = 0; i < 260; i++) {                           // nose leather
      headPoint(-0.04, 0.04, 0.4, 0.46, 0.36, 0.43);
      paint(spx, spy, spz, gnx, gny, gnz);
      if (pKind === 4) addSplat(spx + gnx * 0.006, spy + gny * 0.006, spz + gnz * 0.006, gnx, gny, gnz, 1, 0, 0, 0.0062, 0.0058, 0, 4, 0.97, pTone, 0.12), SRC[(SM - 1) * STRIDE + 21] = 0.8;
    }
    // normalise the normals
    for (i = 0; i < SM; i++) {
      var o = i * STRIDE + 9, l = Math.sqrt(SRC[o] * SRC[o] + SRC[o + 1] * SRC[o + 1] + SRC[o + 2] * SRC[o + 2]) || 1;
      SRC[o] /= l; SRC[o + 1] /= l; SRC[o + 2] /= l;
    }
  }
  function colourSplats() {
    for (var i = 0; i < SM; i++) {
      var o = i * STRIDE + 12;
      albedo(Skind[i], Shue[i], Ssat[i]);
      SRC[o] = rc[0] / 255; SRC[o + 1] = rc[1] / 255; SRC[o + 2] = rc[2] / 255;
    }
  }

  /* ---- WebGL2 splat rasteriser (drawn off-screen, then composited into the 2D scene) ---- */
  var glc = document.createElement('canvas'), gl = null, glProg = null, glBuf = null, U = {};
  function initGL() {
    try { gl = glc.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true }); } catch (e) { gl = null; }
    if (!gl) return;
    var vs = '#version 300 es\n' +
      'layout(location=0) in vec2 aCorner; layout(location=1) in vec3 aCenter; layout(location=2) in vec3 aAxis1;' +
      'layout(location=3) in vec3 aAxis2; layout(location=4) in vec3 aNormal; layout(location=5) in vec3 aColor; layout(location=6) in vec3 aMisc; layout(location=7) in vec4 aRnd;' +
      'uniform mat3 uRot; uniform float uTrain, uCam, uBandY, uBandW; uniform vec2 uS, uO; uniform vec3 uL, uF;' +
      'out vec2 vUv; out vec4 vCol; out float vBand;' +
      'void main(){' +
      ' float w = uBandW > 0.0 ? 1.0 - smoothstep(uBandW * 0.55, uBandW, abs(aCenter.y - uBandY)) : 0.0;' +
      // training: few, large, displaced Gaussians densify and settle
      ' float left = 1.0 - uTrain, born = smoothstep(0.0, 0.05, 0.035 + 0.965 * uTrain * uTrain - aRnd.w);' +
      ' float grow = mix(1.0, 3.1, left * left);' +
      ' vec3 p = aCenter + aRnd.xyz * 0.07 * left * left + (aAxis1 * aCorner.x + aAxis2 * aCorner.y * mix(1.0, 1.7, left)) * 3.0 * grow * mix(1.0, 0.52, w);' +
      ' vec3 v = uRot * p; float k = uCam / (uCam - v.z);' +
      ' gl_Position = born > 0.0 ? vec4(v.xy * k * uS + uO, 0.0, 1.0) : vec4(2.0, 2.0, 0.0, 1.0);' +
      ' vec3 n = normalize(uRot * aNormal);' +
      ' if (n.z < 0.0) { if (w > 0.02) gl_Position = vec4(2.0, 2.0, 0.0, 1.0); n = -n; }' +
      ' float diff = max(dot(n, uL), 0.0), fill = max(dot(n, uF), 0.0);' +
      ' vec3 c = aColor * (0.24 + 0.82 * diff + 0.2 * fill) * aMisc.y;' +
      ' c += aColor * pow(1.0 - n.z, 3.0) * 0.4;' +
      ' c += aMisc.z * pow(max(dot(n, normalize(uL + vec3(0.0, 0.0, 1.0))), 0.0), 40.0);' +
      ' vCol = vec4(min(c, vec3(1.0)), aMisc.x * born * mix(1.0, 0.8, left)); vUv = aCorner; vBand = w; }';
    var fs = '#version 300 es\nprecision mediump float; in vec2 vUv; in vec4 vCol; in float vBand; out vec4 o;' +
      'void main(){ float r2 = dot(vUv, vUv); if (r2 > 1.0) discard;' +
      ' float g = exp(-4.5 * r2), hard = 1.0 - smoothstep(0.5, 0.56, r2);' +     // shrunk splats show as crisp ellipses
      ' float a = mix(vCol.a * g, hard, vBand); o = vec4(vCol.rgb * mix(1.0, 1.08 - 0.75 * r2, vBand) * a, a); }';
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    var v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
    glProg = gl.createProgram();
    if (!v || !f) { gl = null; return; }
    gl.attachShader(glProg, v); gl.attachShader(glProg, f); gl.linkProgram(glProg);
    if (!gl.getProgramParameter(glProg, gl.LINK_STATUS)) { gl = null; return; }
    ['uRot', 'uTrain', 'uCam', 'uS', 'uO', 'uBandY', 'uBandW', 'uL', 'uF'].forEach(function (n) { U[n] = gl.getUniformLocation(glProg, n); });
    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    glBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, glBuf);
    gl.bufferData(gl.ARRAY_BUFFER, DST.byteLength, gl.DYNAMIC_DRAW);
    for (var a = 1; a <= 6; a++) {
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 3, gl.FLOAT, false, STRIDE * 4, (a - 1) * 12);
      gl.vertexAttribDivisor(a, 1);
    }
    gl.enableVertexAttribArray(7);
    gl.vertexAttribPointer(7, 4, gl.FLOAT, false, STRIDE * 4, 72);
    gl.vertexAttribDivisor(7, 1);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  function nrm(v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
  var Ln = nrm(LIGHT), Fn = nrm(FILL);
  function renderSplats(train, bandY, bandW, cw, ch, sx, sy, ox, oy, count) {
    if (glc.width !== cw || glc.height !== ch) { glc.width = cw; glc.height = ch; }
    var SM = count;
    // back-to-front
    for (var i = 0; i < SM; i++) {
      var o = i * STRIDE, zv = -SRC[o] * say + SRC[o + 2] * cay;
      zv = SRC[o + 1] * sax + zv * cax;
      skeys[i] = Math.floor((zv + 8) * 4096) * 65536 + i;
    }
    var keys = skeys.subarray(0, SM); keys.sort();
    for (var n = 0; n < SM; n++) {
      var s = (keys[n] % 65536) * STRIDE, d = n * STRIDE;
      for (var k = 0; k < STRIDE; k++) DST[d + k] = SRC[s + k];
    }
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(glProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, glBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, DST, 0, SM * STRIDE);
    gl.uniformMatrix3fv(U.uRot, false, [cay, say * sax, -say * cax, 0, cax, sax, say, -cay * sax, cay * cax]);
    gl.uniform1f(U.uTrain, train); gl.uniform1f(U.uCam, CAM);
    gl.uniform2f(U.uS, sx, sy);
    gl.uniform2f(U.uO, ox, oy);
    gl.uniform1f(U.uBandY, bandY); gl.uniform1f(U.uBandW, bandW);
    gl.uniform3fv(U.uL, Ln); gl.uniform3fv(U.uF, Fn);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, SM);
  }
  /* A camera's picture, rendered from the finished splats, so that
     the pictures and the model are the same thing. Returns RGBA at the view's size. */
  var shotC = document.createElement('canvas'), shotX = shotC.getContext('2d', { willReadFrequently: true }), SHOT_SS = 4;
  function shootView(V) {
    var a = cay, b = say, c = cax, d = sax;
    cay = Math.cos(-V.az); say = Math.sin(-V.az); cax = Math.cos(V.el); sax = Math.sin(V.el);
    renderSplats(1, 0, 0, V.w * SHOT_SS, V.h * SHOT_SS, 1 / FX, 1 / FY, 0, 0, SM);
    cay = a; say = b; cax = c; sax = d;
    shotC.width = V.w; shotC.height = V.h;
    shotX.imageSmoothingQuality = 'high';
    shotX.drawImage(glc, 0, 0, V.w, V.h);
    return shotX.getImageData(0, 0, V.w, V.h).data;
  }

  /* ---- The sketch input ("Vázlat / Kép"), in image-plane coordinates ---- */
  var sketch = [], sketchLen = 0;
  (function buildSketch() {
    function wob() { return gauss() * 0.008; }
    function ellipse(c, r, a0, a1, n) {
      var pts = [];
      for (var i = 0; i <= n; i++) {
        var a = a0 + (a1 - a0) * i / n;
        pts.push([c[0] + r[0] * Math.cos(a) + wob(), c[1] + r[1] * Math.sin(a) + wob()]);
      }
      sketch.push(pts);
    }
    var PI = Math.PI;
    ellipse([0, -0.46], [0.4, 0.52], PI * 0.62, PI * 2.38, 40);           // body
    ellipse([0, 0.47], [0.23, 0.2], -PI * 0.4, PI * 1.4, 36);             // head
    [-1, 1].forEach(function (s) {                                         // ears
      sketch.push([[s * 0.21 + wob(), 0.56 + wob()], [s * 0.2 + wob(), 0.8 + wob()], [s * 0.06 + wob(), 0.65 + wob()]]);
    });
    var tail = [];                                                         // tail, curled round to the front
    for (var i = 0; i <= 16; i++) {
      var a = -PI * 0.5 + PI * 1.05 * (1 - i / 16);
      tail.push([0.38 + 0.26 * Math.cos(a) * (1 - 0.25 * i / 16) + wob(), -0.9 + 0.085 * Math.sin(a) + wob()]);
    }
    sketch.push(tail);
    [-1, 1].forEach(function (s) { ellipse([s * 0.088, 0.492], [0.05, 0.034], 0, PI * 2, 14); });   // eyes
    sketch.push([[-0.026, 0.447], [0.026, 0.447], [0, 0.414], [-0.026, 0.447]]);                    // nose
    [-1, 1].forEach(function (s) {                                                                   // whiskers
      sketch.push([[s * 0.06, 0.4], [s * 0.3, 0.43]]);
      sketch.push([[s * 0.06, 0.385], [s * 0.3, 0.355]]);
    });
    // two feet set apart, each a low arch with toe marks
    [-1, 1].forEach(function (s) {
      ellipse([s * 0.13, -0.99], [0.085, 0.07], 0, PI, 10);
      sketch.push([[s * 0.105 + wob(), -0.98], [s * 0.105 + wob(), -0.945]]);
      sketch.push([[s * 0.155 + wob(), -0.98], [s * 0.155 + wob(), -0.945]]);
    });
    [1, 2, 3, 5, 6, 7, 8, 9, 10, 11].forEach(function (k) {                 // the head, at the model's scale
      sketch[k].forEach(function (pt) { pt[0] *= HS; pt[1] = HPY + (pt[1] - HPY) * HS; });
    });
    sketch.forEach(function (pts) { sketchLen += pts.length - 1; });
  })();

  /* ---- Three cameras looking at the model. The first is the one the generated image
     was "taken" from; the other two hold further views of the same subject. ---- */
  var cams = [[0, 0], [2.2, 0.5], [4.25, 0.2]].map(function (c, idx) {
    var r = 1.3, pos = [r * Math.cos(c[1]) * Math.sin(c[0]), r * Math.sin(c[1]), r * Math.cos(c[1]) * Math.cos(c[0])];
    var f = nrm([-pos[0], -pos[1], -pos[2]]), rt = nrm([-f[2], 0, f[0]]);
    var up = [rt[1] * f[2] - rt[2] * f[1], rt[2] * f[0] - rt[0] * f[2], rt[0] * f[1] - rt[1] * f[0]];
    var d = 0.25, w = 0.125, h = 0.162;      // image plane with the picture's proportions
    function at(sx, sy, e) {
      return [pos[0] + f[0] * d + rt[0] * w * sx + up[0] * (h * sy + e),
              pos[1] + f[1] * d + rt[1] * w * sx + up[1] * (h * sy + e),
              pos[2] + f[2] * d + rt[2] * w * sx + up[2] * (h * sy + e)];
    }
    return { pos: pos, f: f, rt: rt, up: up, d: d, w: w, h: h, idx: idx, targets: [],
             TL: at(-1, 1, 0), TR: at(1, 1, 0), BR: at(1, -1, 0), BL: at(-1, -1, 0),
             mark: [at(-0.4, 1, 0), at(0, 1, 0.07), at(0.4, 1, 0)],   // "this way up"
             view: idx ? makeView(68, 88, 0.025, c[0], c[1]) : mainView };
  });
  function pickTargets() {   // surface points each camera can actually see, inside its field of view
    cams.forEach(function (c) {
      c.targets = [];
      for (var tries = 0; c.targets.length < 5 && tries < 20000; tries++) {
        var k = ((rand() * FUR) | 0) * STRIDE;
        var vx = SRC[k] - c.pos[0], vy = SRC[k + 1] - c.pos[1], vz = SRC[k + 2] - c.pos[2];
        var depth = vx * c.f[0] + vy * c.f[1] + vz * c.f[2];
        if (depth <= 0 || SRC[k + 9] * vx + SRC[k + 10] * vy + SRC[k + 11] * vz > -0.35 * depth) continue;
        var a = (vx * c.rt[0] + vy * c.rt[1] + vz * c.rt[2]) / depth * c.d, b = (vx * c.up[0] + vy * c.up[1] + vz * c.up[2]) / depth * c.d;
        if (Math.abs(a) < c.w * 0.85 && Math.abs(b) < c.h * 0.85) c.targets.push(k);
      }
    });
  }

  /* ---- Background build: nothing here is needed until the input step has played ---- */
  var jobs = [];
  function traceJob(V) { return function () { for (var n = 0; n < 6 && V.row < V.h; n++) traceRow(V, V.row++); return V.row >= V.h; }; }
  initGL();
  if (!gl) {                                 // no WebGL2: the pictures are ray-traced, and the loop stays on the image
    jobs.push(traceJob(mainView));
    jobs.push(function () { colourImage(); imageReady = true; redrawIdle(); return true; });
  } else {                                   // otherwise every picture is a rendering of the splats
    jobs.push(function () { return sampleFur(400); });
    jobs.push(function () {
      sampleDetails(); colourSplats(); pickTargets(); splatsReady = true;
      colourImage(); colourThumb(cams[1].view); colourThumb(cams[2].view); imageReady = true;
      redrawIdle(); return true;
    });
  }
  function pump() {
    var t = performance.now();
    while (jobs.length && performance.now() - t < 9) { if (jobs[0]()) jobs.shift(); }
    if (jobs.length) setTimeout(pump, 0);
  }

  /* ---- Layout and projection ---- */
  var W = 0, H = 0, dpr = 1;
  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
  }
  var cx = 0, cy = 0, R = 1, cay = 1, say = 0, cax = 1, sax = 0;
  var out = [0, 0, 0, 0];

  function project(x, y, z) {
    var xr = x * cay + z * say, zr = -x * say + z * cay;
    var yr = y * cax - zr * sax; zr = y * sax + zr * cax;
    var k = CAM / (CAM - zr);
    out[0] = cx + xr * R * k; out[1] = cy - yr * R * k; out[2] = k; out[3] = zr;
  }
  function planePath(pts, upto) {   // polyline on the image plane
    for (var i = 0; i < pts.length && i <= upto; i++) {
      project(pts[i][0], pts[i][1], 0);
      if (i) ctx.lineTo(out[0], out[1]); else ctx.moveTo(out[0], out[1]);
    }
  }
  var FRAME = [[-FX, -FY], [FX, -FY], [FX, FY], [-FX, FY]];

  /* Timeline (seconds). */
  var T_NOISE = 3.2, T_DEN = 4.6, T_IMG = 9.4, T_LIFT = 11.2, T_3D = 15.6, T_FLAT = 22.4, T_BACK = 25, T_OUT = 25.6, LOOP = 26.6;
  var STEPS = 30, STILL = 17;

  function stageAt(p) {
    return p < T_NOISE ? 'input' : p < T_DEN ? 'noise' : p < T_IMG ? 'net' : p < T_LIFT ? 'image'
      : p < T_3D ? 'inverse' : p < T_FLAT ? 'model' : p < T_BACK ? 'forward' : 'image';
  }

  /* The prompt card: a chat glyph and lines of text being typed. */
  var CARD = { x0: -1.2, x1: -0.1, y0: 0.92, y1: 1.26 };
  var BARS = [[1.185, 0.62], [1.09, 0.5], [0.995, 0.3]];
  function drawPrompt(p, alpha) {
    var c = CARD;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = surfaceCol; ctx.strokeStyle = lineCol; ctx.lineWidth = 1;
    ctx.beginPath();
    planePath([[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]], 9);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.strokeStyle = accentCol; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    var gx = c.x0 + 0.08, gy = c.y1 - 0.08;
    planePath([[gx, gy], [gx + 0.2, gy], [gx + 0.2, gy - 0.13], [gx + 0.09, gy - 0.13], [gx + 0.04, gy - 0.18], [gx + 0.04, gy - 0.13], [gx, gy - 0.13]], 9);
    ctx.closePath(); ctx.stroke();

    var typed = Math.min(1, Math.max(0, (p - 0.35) / 1.5)) * 3, bx = c.x0 + 0.38, last = null;
    ctx.strokeStyle = lineCol; ctx.lineCap = 'round';
    BARS.forEach(function (b, k) {
      var f = Math.min(1, Math.max(0, typed - k));
      if (f <= 0) return;
      project(bx, b[0], 0); var ax = out[0], ay = out[1];
      project(bx + b[1] * f, b[0], 0);
      ctx.lineWidth = Math.max(2, R * 0.03);
      ctx.globalAlpha = alpha * 0.6;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(out[0], out[1]); ctx.stroke();
      last = [bx + b[1] * f + 0.04, b[0]];
    });
    if (last && p < T_NOISE && (p * 1.8) % 1 < 0.55) {   // cursor
      ctx.strokeStyle = accentCol; ctx.lineWidth = 2; ctx.globalAlpha = alpha;
      ctx.beginPath(); planePath([[last[0], last[1] - 0.04], [last[0], last[1] + 0.04]], 9); ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  function drawSketch(p, alpha, onImage) {
    var upto = smooth((p - 1.1) / 1.9) * sketchLen, done = 0;
    ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    for (var s = 0; s < sketch.length && done < upto; s++) {
      planePath(sketch[s], Math.ceil(upto - done));
      done += sketch[s].length - 1;
    }
    // over the noise the lines turn white; blended, not switched
    if (onImage < 1) { ctx.globalAlpha = alpha * (1 - onImage); ctx.strokeStyle = lineCol; ctx.stroke(); }
    if (onImage > 0) { ctx.globalAlpha = alpha * onImage; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    ctx.setLineDash([]); ctx.lineCap = 'butt';
  }

  /* The network, as a U-Net around the image. Left, top to bottom: the noisy image is
     encoded into ever coarser feature maps. Right, bottom to top: the clean estimate is
     decoded back up. Skip connections pass through at each level. One trip per sampling step. */
  var UW = [0.34, 0.25, 0.18, 0.12], UX = FX + 0.25, UTOP = 0.84, UGAP = 0.09, UY = [], UH = [];
  (function () {
    var y = UTOP;
    UW.forEach(function (w) { var h = w * IH / IW; UH.push(h); UY.push(y - h / 2); y -= h + UGAP; });
  })();
  function chevron(x, y, dx, dy) {   // small arrowhead pointing along (dx, dy)
    var s = 0.028;
    ctx.beginPath();
    planePath([[x - dx * s - dy * s, y - dy * s + dx * s], [x, y], [x - dx * s + dy * s, y - dy * s - dx * s]], 9);
    ctx.stroke();
  }
  function drawNet(alpha, T, sec) {
    var active = T > 0 && T < 1 ? Math.floor(((T * STEPS) % 1) * 8) : -1;
    var decA = smooth(T / 0.12);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // conditioning from the prompt
    ctx.strokeStyle = accentCol; ctx.lineWidth = 1; ctx.globalAlpha = alpha * 0.7;
    ctx.setLineDash([3, 4]); ctx.lineDashOffset = -sec * 16;
    ctx.beginPath(); planePath([[-UX, CARD.y0], [-UX, UTOP]], 9); ctx.stroke();
    ctx.setLineDash([]);

    for (var side = -1; side <= 1; side += 2) {
      for (var k = 0; k < 4; k++) {
        var w = UW[k], h = UH[k], x0 = side * UX - w / 2, x1 = x0 + w, y0 = UY[k] - h / 2, y1 = y0 + h;
        var idx = side < 0 ? k : 7 - k, on = idx === active, c;
        // channels: more of them as the resolution drops
        ctx.strokeStyle = lineCol; ctx.lineWidth = 1;
        for (c = k + 1; c >= 1; c--) {
          var ox = side * 0.017 * c, oy = 0.017 * c;
          ctx.globalAlpha = alpha * 0.32;
          ctx.beginPath(); planePath([[x0 + ox, y0 + oy], [x1 + ox, y0 + oy], [x1 + ox, y1 + oy], [x0 + ox, y1 + oy]], 9); ctx.closePath(); ctx.stroke();
        }
        ctx.globalAlpha = alpha; ctx.fillStyle = surfaceCol;
        ctx.beginPath(); planePath([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 9); ctx.closePath(); ctx.fill();
        drawQuad(side < 0 ? mipX[k] : mipE[k], [x0, y1, 0], [x1, y1, 0], [x0, y0, 0], alpha * (side < 0 ? 1 : decA), true);
        ctx.globalAlpha = alpha * (on ? 1 : 0.75);
        ctx.strokeStyle = on ? accentCol : lineCol; ctx.lineWidth = on ? 2 : 1;
        ctx.beginPath(); planePath([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], 9); ctx.closePath(); ctx.stroke();

        // link between this tile and the image: data in / out at the top, skips below
        var xi = side < 0 ? x1 : x0, xf = side * FX;
        ctx.strokeStyle = k === 0 ? accentCol : lineCol; ctx.lineWidth = 1;
        ctx.globalAlpha = alpha * (k === 0 ? 0.9 : 0.5);
        if (k) { ctx.setLineDash([2, 4]); ctx.lineDashOffset = -sec * 12; }
        ctx.beginPath(); planePath([[xi, UY[k]], [xf, UY[k]]], 9); ctx.stroke();
        ctx.setLineDash([]);
        if (k === 0) chevron(side < 0 ? xi + 0.004 : xf, UY[k], -1, 0);

        // flow down the encoder, up the decoder
        if (k < 3) {
          ctx.strokeStyle = lineCol; ctx.globalAlpha = alpha * 0.8;
          var gy = y0 - UGAP / 2;
          chevron(side * UX, gy + side * -0.012, 0, side < 0 ? -1 : 1);
        }
      }
    }
    ctx.lineCap = 'butt';
  }

  var lastStage = null, lastAy = 0, lastAx = 0, lastR = 1, lastCx = 0, lastCy = 0, lastModel = false;
  var viewer = { on: false, mix: 0, yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0, splats: false };
  var hero = canvas.parentElement;
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function mix3(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }

  /* An image drawn on a quad in the scene (affine from three projected corners). */
  function drawQuad(src, TL, TR, BL, alpha, crisp) {
    project(TL[0], TL[1], TL[2]); var ox = out[0], oy = out[1];
    project(TR[0], TR[1], TR[2]); var exx = out[0] - ox, exy = out[1] - oy;
    project(BL[0], BL[1], BL[2]); var eyx = out[0] - ox, eyy = out[1] - oy;
    ctx.setTransform(dpr * exx / src.width, dpr * exy / src.width, dpr * eyx / src.height, dpr * eyy / src.height, dpr * ox, dpr * oy);
    ctx.imageSmoothingEnabled = !crisp;
    ctx.globalAlpha = alpha;
    ctx.drawImage(src, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function path3(pts, close) {
    for (var i = 0; i < pts.length; i++) {
      project(pts[i][0], pts[i][1], pts[i][2]);
      if (i) ctx.lineTo(out[0], out[1]); else ctx.moveTo(out[0], out[1]);
    }
    if (close) ctx.closePath();
  }

  function drawCam(c, alpha, rayA, sec, picture) {
    if (alpha <= 0.01) return;
    project(c.pos[0], c.pos[1], c.pos[2]);
    var axp = out[0], ayp = out[1], col = camCols[c.idx];
    if (picture) drawQuad(c.view.canvas, c.TL, c.TR, c.BL, alpha * 0.95, false);
    ctx.lineWidth = 1; ctx.strokeStyle = col; ctx.fillStyle = col;
    if (rayA > 0.01) {                       // rays through the picture to the surface they see
      ctx.setLineDash([3, 5]); ctx.lineDashOffset = -sec * 16;
      ctx.globalAlpha = alpha * rayA * 0.7;
      ctx.beginPath();
      c.targets.forEach(function (k) {
        project(SRC[k], SRC[k + 1], SRC[k + 2]);
        ctx.moveTo(axp, ayp); ctx.lineTo(out[0], out[1]);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    path3([c.TL, c.TR, c.BR, c.BL], true);
    [c.TL, c.TR, c.BR, c.BL].forEach(function (cr) {
      project(cr[0], cr[1], cr[2]);
      ctx.moveTo(axp, ayp); ctx.lineTo(out[0], out[1]);
    });
    ctx.stroke();
    ctx.beginPath(); path3(c.mark, true); ctx.fill();
    ctx.beginPath(); ctx.arc(axp, ayp, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  function draw(sec, animate) {
    var p = sec % LOOP;
    var use3d = splatsReady && gl;           // without WebGL2 the loop stays on the image
    var view = viewer.on && use3d, vmix = use3d ? smooth(viewer.mix) : 0;
    if (view) p = T_3D + 0.3;                // the viewer holds the finished model
    var in3d = use3d && p >= T_LIFT && p < T_BACK;

    var T = p < T_DEN ? 0 : p < T_IMG ? (p - T_DEN) / (T_IMG - T_DEN) : 1;       // denoising progress
    var s = in3d ? clamp01((p - T_LIFT) / (T_3D - T_LIFT)) : 0;                   // inverse: 2D -> 3D
    var r = in3d ? clamp01((p - T_FLAT) / (T_BACK - T_FLAT)) : 0;                 // graphics: 3D -> 2D
    var picK = in3d ? smooth(s / 0.3) * (1 - smooth((r - 0.5) / 0.5)) : 0;        // picture: 0 full frame, 1 on its camera
    var train = in3d ? smooth((s - 0.2) / 0.8) : 0;                               // fitting the Gaussians
    var modelA = in3d ? smooth((s - 0.14) / 0.16) * (1 - smooth((r - 0.4) / 0.45)) : 0;
    var camA = in3d ? smooth((s - 0.1) / 0.25) * (1 - smooth((r - 0.3) / 0.45)) : 0;
    var rayA = in3d ? (s < 1 ? smooth((s - 0.22) / 0.15) : 0.45) * (1 - smooth(r / 0.3)) : 0;
    // Turntable. The first camera (and the picture riding on it) swings 0.6 rad clear of the model
    // while it is fitted, the model then makes most of a turn, and the camera swings back to the
    // front only as its picture grows into the frame again.
    var u = in3d ? clamp01((p - T_LIFT) / (T_FLAT - T_LIFT)) : 0;
    var turn = in3d ? 0.6 * smooth(s / 0.35) + (Math.PI * 2 - 1.2) * (u - 0.8 * Math.sin(2 * Math.PI * u) / (2 * Math.PI)) + 0.6 * smooth(r / 0.6) : 0;
    if (!animate && in3d) { turn = 0.62; }
    var noiseIn = smooth((p - T_NOISE) / (T_DEN - T_NOISE)), fadeOut = 1 - smooth((p - T_OUT) / (LOOP - T_OUT - 0.2));

    if (rail && animate) {
      var st = view ? 'model' : stageAt(p);
      if (st !== lastStage) { rail.setAttribute('data-active', st); lastStage = st; }
    }

    var wide = W > 820;
    cx = wide ? W * 0.755 : W * 0.5;
    cy = wide ? H * 0.5 : 176;
    R = wide ? Math.min(H * 0.36, W * 0.185) : Math.min(124, W * 0.32);

    var ay = turn, ax = 0.2 * (in3d ? smooth(s / 0.4) * (1 - smooth((r - 0.5) / 0.5)) : 0);
    if (vmix > 0) {                          // the viewer's camera, eased back to the loop's on release
      var dy = viewer.yaw - ay; dy -= Math.PI * 2 * Math.round(dy / (Math.PI * 2));
      ay += dy * vmix; ax += (viewer.pitch - ax) * vmix;
      R *= 1 + (viewer.zoom - 1) * vmix; cx += viewer.panX * vmix; cy += viewer.panY * vmix;
    }
    lastAy = ay; lastAx = ax; lastR = R; lastCx = cx; lastCy = cy;
    var hasModel = in3d && modelA > 0.6;
    if (hasModel !== lastModel) { lastModel = hasModel; hero.classList.toggle('has-model', hasModel); }
    cay = Math.cos(ay); say = Math.sin(ay); cax = Math.cos(ax); sax = Math.sin(ax);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    // the picture's quad: the full frame, or the first camera's image plane, or in between
    var c0 = cams[0];
    var qTL = mix3([-FX, FY, 0], c0.TL, picK), qTR = mix3([FX, FY, 0], c0.TR, picK);
    var qBL = mix3([-FX, -FY, 0], c0.BL, picK), qBR = mix3([FX, -FY, 0], c0.BR, picK);
    var imgA = noiseIn * fadeOut;
    function drawPicture() {
      if (imgA > 0.01 && imageReady) {
        renderImage(T, T < 1 ? Math.floor(T * STEPS) : STEPS);
        drawQuad(imgC, qTL, qTR, qBL, imgA, picK < 0.75);
      }
      ctx.lineWidth = 1;
      ctx.beginPath(); path3([qTL, qTR, qBR, qBL], true);
      ctx.strokeStyle = lineCol; ctx.globalAlpha = 0.55 * (1 - picK); ctx.stroke();
      ctx.strokeStyle = camCols[0]; ctx.globalAlpha = picK; ctx.stroke();
    }

    if (!in3d) {
      drawPicture();
      if (p < T_LIFT) {
        // sampling progress under the frame
        if (T > 0 && T < 1) {
          var barA = smooth(T / 0.04) * smooth((1 - T) / 0.06);
          ctx.strokeStyle = lineCol; ctx.globalAlpha = 0.35 * barA; ctx.lineWidth = 2;
          ctx.beginPath(); planePath([[-FX, -FY - 0.07], [FX, -FY - 0.07]], 9); ctx.stroke();
          ctx.globalAlpha = barA; ctx.strokeStyle = accentCol;
          ctx.beginPath(); planePath([[-FX, -FY - 0.07], [-FX + 2 * FX * Math.floor(T * STEPS) / STEPS, -FY - 0.07]], 9); ctx.stroke();
        }
        // the sketch stays on as guidance while the image denoises
        var skA = p < T_NOISE ? 0.9 : p < T_DEN ? 0.9 - 0.25 * noiseIn : p < T_IMG ? 0.65 * (1 - smooth((p - T_DEN) / (T_IMG - T_DEN - 1.6))) : 0;
        if (skA > 0.01) drawSketch(p, skA, smooth((p - T_NOISE) / 1.1));
        var prA = smooth(p / 0.4) * (1 - smooth((p - T_IMG) / 1.4));
        if (prA > 0.01) drawPrompt(p, prA);
        var netA = smooth((p - T_NOISE) / 1.2) * (1 - smooth((p - T_IMG) / 1.2));
        if (netA > 0.01 && imageReady) drawNet(netA, T, sec);
      }
      ctx.globalAlpha = 1;
      return;
    }

    /* ---- the 3D scene ---- */
    // turntable ring on the ground
    ctx.strokeStyle = lineCol; ctx.lineWidth = 1; ctx.globalAlpha = 0.45 * modelA;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    for (var g = 0; g <= 64; g++) {
      project(Math.cos(g / 64 * Math.PI * 2) * 0.98, -1.0, Math.sin(g / 64 * Math.PI * 2) * 0.98);
      if (g) ctx.lineTo(out[0], out[1]); else ctx.moveTo(out[0], out[1]);
    }
    ctx.stroke(); ctx.setLineDash([]);

    function camPass(front) {
      cams.forEach(function (c) {
        project(c.pos[0], c.pos[1], c.pos[2]);
        if ((out[3] > 0) !== front) return;
        if (c.idx === 0) { drawPicture(); drawCam(c, camA * picK, rayA, sec, false); }
        else drawCam(c, camA * (front ? 1 : 0.7), rayA, sec, true);
      });
    }
    camPass(false);

    // the model; during the hold a band sweeps down it in which the Gaussians shrink to show themselves
    var bp = (p - (T_3D + 0.6)) / (T_FLAT - 1 - T_3D), bandY = animate ? 1.25 - 2.5 * bp : -0.3;
    var bandW = !animate ? 0.24 : (bp > 0 && bp < 1 ? 0.24 : 0);
    if (view) { bandY = 0; bandW = viewer.splats ? 9 : 0; }   // in the viewer the reveal is a switch
    var gw = canvas.width, gh = canvas.height;                 // same size and framing as the 2D canvas
    renderSplats(animate ? train : 1, bandY, bandW, gw, gh, R * dpr / (gw / 2), R * dpr / (gh / 2), cx * dpr / (gw / 2) - 1, 1 - cy * dpr / (gh / 2), SM);
    ctx.globalAlpha = animate ? modelA : 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(glc, 0, 0, W, H);

    camPass(true);
    ctx.globalAlpha = 1;
  }

  /* ---- run control: a clock that can be paused, and sought from the rail ---- */
  var START = { input: 0, noise: T_NOISE, net: T_DEN, image: T_IMG, inverse: T_LIFT, model: T_3D, forward: T_FLAT };
  var SHOW = { input: 3, noise: 4.5, net: 7.4, image: 10.4, inverse: 13.3, model: 18.4, forward: 23.9 };  // a telling still of each
  var running = false, visible = true, paused = false, raf = 0, clock = 0, lastNow = 0;
  var idleAt = null;   // when stopped: the moment on show (null = the default still)
  var pauseBtn = document.querySelector('.hero-pause');

  // ?t=<seconds> opens paused at that moment (handy for checking a single step)
  var frozen = parseFloat((location.search.match(/[?&]t=([\d.]+)/) || [])[1]);
  if (!isNaN(frozen)) { paused = true; idleAt = frozen; }

  function redrawIdle() {
    if (running) return;
    if (idleAt === null) {
      if (rail) { rail.removeAttribute('data-active'); lastStage = null; }
      draw(STILL, false);
    } else {
      draw(idleAt, true);
    }
  }
  function frame(now) {
    raf = 0;
    if (!running) return;
    var dt = Math.max(0, Math.min(0.1, (now - lastNow) / 1000)); lastNow = now;
    clock += dt;
    if (!viewer.on && viewer.mix > 0) viewer.mix = Math.max(0, viewer.mix - dt / 1.1);
    draw(clock, true);
    raf = requestAnimationFrame(frame);
  }
  function update() {
    var should = visible && !document.hidden && !reduceMotion.matches && !paused;
    if (should && !running) {
      running = true; idleAt = null; lastNow = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!should && running) {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (paused) idleAt = clock;
      redrawIdle();
    }
    if (pauseBtn) pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
  }
  function seek(stage) {
    if (!(stage in START)) return;
    if (viewer.on || viewer.mix > 0) { viewer.on = false; viewer.mix = 0; }
    if (running) { clock = START[stage] + 0.02; draw(clock, true); }
    else { idleAt = SHOW[stage]; clock = START[stage] + 0.02; redrawIdle(); }
  }

  if (rail) {
    Array.prototype.forEach.call(rail.querySelectorAll('[data-step]'), function (el) {
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.addEventListener('click', function () { seek(el.getAttribute('data-step')); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seek(el.getAttribute('data-step')); }
      });
    });
  }
  if (pauseBtn) {
    pauseBtn.addEventListener('click', function () {
      if (viewer.on) {                       // leaving the viewer: pick the loop back up at the model
        viewer.on = false; clock = T_3D + 0.4;
        if (reduceMotion.matches) viewer.mix = 0;
      }
      paused = !paused; update();
    });
  }

  readTheme();
  resize();
  redrawIdle();
  setTimeout(pump, 0);

  if ('ResizeObserver' in window) {
    new ResizeObserver(function () { resize(); redrawIdle(); }).observe(canvas);
  } else {
    window.addEventListener('resize', function () { resize(); redrawIdle(); });
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; update(); }).observe(canvas);
  }
  document.addEventListener('visibilitychange', update);
  reduceMotion.addEventListener('change', update);
  new MutationObserver(function () {
    readTheme();
    if (splatsReady) colourSplats();
    if (imageReady) colourImage();
    if (splatsReady) { colourThumb(cams[1].view); colourThumb(cams[2].view); }
    redrawIdle();
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---- Viewer: drag the model to orbit, shift- or right-drag to pan, scroll or pinch to zoom ---- */
  var pendingDraw = false, drag = null;
  function invalidate() {
    if (running || pendingDraw) return;
    pendingDraw = true;
    requestAnimationFrame(function () { pendingDraw = false; redrawIdle(); });
  }
  function enterViewer() {
    if (viewer.on) return true;
    if (!(splatsReady && gl) || !lastModel) return false;
    viewer.on = true; viewer.mix = 1;
    viewer.yaw = lastAy; viewer.pitch = lastAx; viewer.zoom = 1; viewer.panX = 0; viewer.panY = 0;
    paused = true; idleAt = clock;
    update();
    invalidate();
    return true;
  }
  function zoomBy(f) {
    viewer.zoom = Math.max(0.5, Math.min(6, viewer.zoom * f));
    invalidate();
  }
  function resetView() {
    viewer.yaw = 0.62; viewer.pitch = 0.2; viewer.zoom = 1; viewer.panX = 0; viewer.panY = 0;
    invalidate();
  }
  function overModel(e) {
    var r = canvas.getBoundingClientRect(), x = e.clientX - r.left - lastCx, y = e.clientY - r.top - lastCy;
    return x * x + y * y < lastR * lastR * 3.6;
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 && e.button !== 2) return;
    if (!viewer.on && (!overModel(e) || !enterViewer())) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    hero.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.pan) { viewer.panX += dx; viewer.panY += dy; }
    else {
      viewer.yaw += dx * 0.008;
      viewer.pitch = Math.max(-1.35, Math.min(1.35, viewer.pitch + dy * 0.008));
    }
    invalidate();
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null; hero.classList.remove('is-dragging');
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('contextmenu', function (e) { if (viewer.on) e.preventDefault(); });
  canvas.addEventListener('dblclick', function (e) { if (viewer.on && overModel(e)) resetView(); });
  canvas.addEventListener('wheel', function (e) {
    if (!viewer.on || !overModel(e)) return;         // elsewhere the page scrolls as usual
    e.preventDefault();
    zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016)));
  }, { passive: false });

  Array.prototype.forEach.call(document.querySelectorAll('.hero-view'), function (btn) {
    btn.addEventListener('click', function () {
      if (!enterViewer()) return;
      var what = btn.getAttribute('data-view');
      if (what === 'in') zoomBy(1.3);
      else if (what === 'out') zoomBy(1 / 1.3);
      else if (what === 'reset') resetView();
      else if (what === 'splats') {
        viewer.splats = !viewer.splats;
        btn.setAttribute('aria-pressed', viewer.splats ? 'true' : 'false');
        invalidate();
      }
    });
  });

  update();
})();
