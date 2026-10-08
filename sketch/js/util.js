/* 공용 도우미: 수학, 난수, 색 변환(sRGB ↔ Lab), 캔버스 */
(function () {
  const U = {};

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  // 재생(replay) 때 같은 결과가 나오도록 시드 있는 난수
  U.rng = function (seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // 좌표 해시 → 0..1 (종이 결 같은 고정 노이즈)
  U.hash2 = function (x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  U.hexToRgb = function (hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  U.rgbToHex = (r, g, b) =>
    '#' + [r, g, b].map((v) => Math.round(U.clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');

  // ---- sRGB ↔ CIE Lab (D65) ----
  const LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const finv = (t) => { const t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; };
  const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

  // r,g,b: 0..255 정수. out: [L, a, b]
  U.rgbToLab = function (r, g, b, out) {
    const R = LIN[r], G = LIN[g], B = LIN[b];
    const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
    const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
    const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
    out[0] = 116 * y - 16; out[1] = 500 * (x - y); out[2] = 200 * (y - z);
    return out;
  };
  U.labToRgb = function (L, a, b, out) {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
    const X = 0.95047 * finv(fx), Y = finv(fy), Z = 1.08883 * finv(fz);
    out[0] = U.clamp(gam(3.2406 * X - 1.5372 * Y - 0.4986 * Z) * 255, 0, 255);
    out[1] = U.clamp(gam(-0.9689 * X + 1.8758 * Y + 0.0415 * Z) * 255, 0, 255);
    out[2] = U.clamp(gam(0.0557 * X - 0.204 * Y + 1.057 * Z) * 255, 0, 255);
    return out;
  };

  U.canvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };
  U.copyCanvas = function (src) {
    const c = U.canvas(src.width, src.height);
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  };

  // 알파가 있는 영역의 경계 상자. 없으면 null
  U.alphaBounds = function (data, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (data[row + x * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };

  window.SK = window.SK || {};
  SK.U = U;
})();
