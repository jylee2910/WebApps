/* 이미지에 녹이기: 그린 선을 배경 사진의 빛·색감·질감·입자에 맞춘다.
   생성형 AI 없이 Lab 색공간에서 계산하므로 빠르고, 슬라이더로 바로 미리볼 수 있다. */
(function () {
  const U = SK.U;
  const SCALE = 4; // 국소 평균은 1/4 해상도에서 계산

  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    const win = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      let acc = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) acc += src[row + U.clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = acc / win;
        acc += src[row + Math.min(x + r + 1, w - 1)] - src[row + Math.max(x - r, 0)];
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[U.clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / win;
        acc += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x];
      }
    }
    return out;
  }
  const blur2 = (a, w, h, r) => boxBlur(boxBlur(a, w, h, r), w, h, r);

  function bilinear(arr, sw, sh, fx, fy) {
    fx = U.clamp(fx, 0, sw - 1); fy = U.clamp(fy, 0, sh - 1);
    const x0 = fx | 0, y0 = fy | 0, x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
    const tx = fx - x0, ty = fy - y0;
    const a = arr[y0 * sw + x0], b = arr[y0 * sw + x1], c = arr[y1 * sw + x0], d = arr[y1 * sw + x1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }

  function prepare(bgCanvas, drawCanvas) {
    const w = drawCanvas.width, h = drawCanvas.height;
    const D = drawCanvas.getContext('2d').getImageData(0, 0, w, h);
    const bounds = U.alphaBounds(D.data, w, h);
    if (!bounds) return { error: 'empty' };
    const bg = bgCanvas.getContext('2d').getImageData(0, 0, w, h).data;

    // 1/4 해상도 Lab + 넓은 흐림 = 주변의 빛과 색
    const sw = Math.ceil(w / SCALE), sh = Math.ceil(h / SCALE);
    const sc = U.canvas(sw, sh), sg = sc.getContext('2d');
    sg.imageSmoothingQuality = 'high';
    sg.drawImage(bgCanvas, 0, 0, sw, sh);
    const sd = sg.getImageData(0, 0, sw, sh).data;
    const sL = new Float32Array(sw * sh), sA = new Float32Array(sw * sh), sB = new Float32Array(sw * sh);
    const lab = [0, 0, 0];
    let Lsum = 0, Csum = 0;
    for (let i = 0; i < sw * sh; i++) {
      U.rgbToLab(sd[i * 4], sd[i * 4 + 1], sd[i * 4 + 2], lab);
      sL[i] = lab[0]; sA[i] = lab[1]; sB[i] = lab[2];
      Lsum += lab[0]; Csum += Math.hypot(lab[1], lab[2]);
    }
    const r = Math.max(2, Math.round(Math.max(sw, sh) * 0.02));
    const Lm = blur2(sL, sw, sh, r), Am = blur2(sA, sw, sh, r), Bm = blur2(sB, sw, sh, r);

    // 사진의 잔 노이즈(입자) 크기 추정
    let nz = 0, cnt = 0;
    const rnd = U.rng(42);
    const lum = (i) => (0.2126 * bg[i] + 0.7152 * bg[i + 1] + 0.0722 * bg[i + 2]) / 2.55;
    for (let k = 0; k < 20000; k++) {
      const x = 1 + ((rnd() * (w - 2)) | 0), y = 1 + ((rnd() * (h - 2)) | 0);
      const i = (y * w + x) * 4;
      const avg = (lum(i - 4) + lum(i + 4) + lum(i - w * 4) + lum(i + w * 4)) / 4;
      nz += Math.abs(lum(i) - avg); cnt++;
    }

    // 그린 선의 평균 채도
    let sc2 = 0, sn = 0;
    const d = D.data;
    for (let y = bounds.y; y < bounds.y + bounds.h; y += 2) for (let x = bounds.x; x < bounds.x + bounds.w; x += 2) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 128) continue;
      U.rgbToLab(d[i], d[i + 1], d[i + 2], lab);
      sc2 += Math.hypot(lab[1], lab[2]); sn++;
    }

    const pad = 6;
    const rx = Math.max(0, bounds.x - pad), ry = Math.max(0, bounds.y - pad);
    const region = { x: rx, y: ry, w: Math.min(w, bounds.x + bounds.w + pad) - rx, h: Math.min(h, bounds.y + bounds.h + pad) - ry };

    return {
      w, h, D, bg, region, sw, sh, Lm, Am, Bm,
      Lg: Lsum / (sw * sh), chromaImg: Csum / (sw * sh), chromaStroke: sn ? sc2 / sn : 0,
      noise: cnt ? nz / cnt : 0,
      original: drawCanvas.getContext('2d').getImageData(region.x, region.y, region.w, region.h),
    };
  }

  /* params: strength, light, color, texture, edge, grain (각 0..1). 반환: 영역 ImageData */
  function render(P, params) {
    const { w, D, bg, region: R, sw, sh, Lm, Am, Bm } = P;
    const k = params.strength;
    const kl = k * params.light, kc = k * params.color, kt = k * params.texture, kg = k * params.grain;
    const n = R.w * R.h;

    // 영역을 premultiplied float로
    let pr = new Float32Array(n), pg = new Float32Array(n), pb = new Float32Array(n), pa = new Float32Array(n);
    const d = D.data;
    for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
      const i = ((R.y + y) * w + R.x + x) * 4, j = y * R.w + x, a = d[i + 3] / 255;
      pr[j] = d[i] * a; pg[j] = d[i + 1] * a; pb[j] = d[i + 2] * a; pa[j] = a;
    }
    // 가장자리 부드럽게 (사진의 초점감에 맞춤)
    const er = Math.round(params.edge * k * 3.5);
    if (er >= 1) {
      pr = blur2(pr, R.w, R.h, er); pg = blur2(pg, R.w, R.h, er); pb = blur2(pb, R.w, R.h, er); pa = blur2(pa, R.w, R.h, er);
    }

    const out = new ImageData(R.w, R.h), o = out.data;
    const lab = [0, 0, 0], bl = [0, 0, 0], rgb = [0, 0, 0];
    const satRatio = P.chromaStroke > 1 ? U.clamp(P.chromaImg / P.chromaStroke, 0.55, 1.1) : 1;
    const sat = U.lerp(1, satRatio, kc * 0.8);
    const grainAmp = kg * (P.noise * 1.6 + 1.2);

    for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
      const j = y * R.w + x, a = pa[j];
      if (a < 0.004) continue;
      const X = R.x + x, Y = R.y + y;
      U.rgbToLab(
        U.clamp(Math.round(pr[j] / a), 0, 255) | 0,
        U.clamp(Math.round(pg[j] / a), 0, 255) | 0,
        U.clamp(Math.round(pb[j] / a), 0, 255) | 0, lab);
      const fx = (X + 0.5) / SCALE - 0.5, fy = (Y + 0.5) / SCALE - 0.5;
      const lm = bilinear(Lm, sw, sh, fx, fy), am = bilinear(Am, sw, sh, fx, fy), bm = bilinear(Bm, sw, sh, fx, fy);

      // 빛 따르기: 어두운 곳에 그린 선은 어둡게, 밝은 곳은 밝게
      let L = lab[0] * Math.pow((lm + 6) / (P.Lg + 6), kl);
      L += kl * 0.18 * (lm - P.Lg);
      // 색감 맞추기: 사진의 채도 수준과 주변 색 기운
      let A = lab[1] * sat + kc * 0.45 * am;
      let B = lab[2] * sat + kc * 0.45 * bm;
      // 질감 비치기: 사진의 밝기 결을 선 위로
      const bi = (Y * w + X) * 4;
      U.rgbToLab(bg[bi], bg[bi + 1], bg[bi + 2], bl);
      L += kt * 0.8 * U.clamp(bl[0] - lm, -32, 32);
      A += kt * 0.25 * (bl[1] - am);
      B += kt * 0.25 * (bl[2] - bm);
      // 입자감: 사진의 노이즈만큼
      if (grainAmp > 0) {
        const g = (U.hash2(X, Y) + U.hash2(X + 17, Y + 31) + U.hash2(X + 5, Y + 71) - 1.5) * 2;
        L += g * grainAmp;
      }
      U.labToRgb(U.clamp(L, 0, 100), A, B, rgb);
      const oi = j * 4;
      o[oi] = rgb[0]; o[oi + 1] = rgb[1]; o[oi + 2] = rgb[2];
      o[oi + 3] = U.clamp(a * (1 - 0.08 * kt) * 255, 0, 255);
    }
    return out;
  }

  SK.Harmonize = { prepare, render };
})();
