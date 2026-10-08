/* 펜 종류와 획(stroke) 엔진.
   입력 점 → 2차 곡선으로 부드럽게 → 일정 간격 샘플 → 각 펜이 샘플 사이를 그림.
   획은 별도 캔버스에 불투명하게 그려지고, 앱이 펜의 합성 모드·불투명도로 그림 레이어에 얹는다. */
(function () {
  const U = SK.U;
  const TAU = Math.PI * 2;

  const taper = (t) => (t >= 1 ? 1 : t <= 0 ? 0.12 : 0.12 + 0.88 * Math.sin((t * Math.PI) / 2));

  function roundSeg(ctx, a, b, w, style) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const crayonPatterns = new Map();
  function crayonPattern(ctx, rgb) {
    const key = rgb.r + ',' + rgb.g + ',' + rgb.b;
    if (crayonPatterns.has(key)) return crayonPatterns.get(key);
    const S = 128, c = U.canvas(S, S), g = c.getContext('2d');
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = 0.55 * U.hash2(x, y) + 0.45 * U.hash2((x >> 2) + 911, (y >> 1) + 37);
      const i = (y * S + x) * 4;
      img.data[i] = rgb.r; img.data[i + 1] = rgb.g; img.data[i + 2] = rgb.b;
      img.data[i + 3] = n > 0.38 ? 150 + 105 * n : 0;
    }
    g.putImageData(img, 0, 0);
    const p = ctx.createPattern(c, 'repeat');
    crayonPatterns.set(key, p);
    return p;
  }

  function spray(ctx, s, st, amount) {
    const r = st.size * 0.5;
    const n = Math.ceil(amount * r * 0.9 * (0.25 + s.p));
    ctx.fillStyle = st.color;
    ctx.globalAlpha = 0.1 + 0.3 * s.p;
    const rnd = st.rand;
    for (let i = 0; i < n; i++) {
      // 가우스 분포: 가운데 진하고 가장자리 옅게
      const g = Math.sqrt(-2 * Math.log(rnd() + 1e-6)) * 0.42;
      if (g > 1) continue;
      const ang = rnd() * TAU, rr = g * r;
      const d = 0.8 + rnd() * 1.2;
      ctx.fillRect(s.x + Math.cos(ang) * rr, s.y + Math.sin(ang) * rr, d, d);
    }
    ctx.globalAlpha = 1;
  }

  const BRUSHES = {
    pen: {
      name: '펜', icon: 'pen', hint: '또렷한 선 · 글씨 쓰기 좋아요',
      size: 5, opacity: 1, minW: 0.3, taperIn: 0.6, taperOut: 0.6,
      draw(ctx, a, b, st) { roundSeg(ctx, a, b, (a.w + b.w) / 2, st.color); },
    },
    brush: {
      name: '붓', icon: 'brush', hint: '누르는 힘과 속도로 굵기가 크게 변해요',
      size: 22, opacity: 1, minW: 0.04, curveBias: 1.4, taperIn: 1.6, taperOut: 2.8,
      init(st) {
        const r = st.rand, n = 9;
        st.data.bristles = Array.from({ length: n }, (_, i) => ({
          o: (i / (n - 1) - 0.5) * 0.95 + (r() - 0.5) * 0.08,
          t: 0.12 + r() * 0.22,
          lift: Math.abs(i / (n - 1) - 0.5) * 1.3 + r() * 0.3,
        }));
      },
      draw(ctx, a, b, st) {
        const w = (a.w + b.w) / 2;
        roundSeg(ctx, a, b, w * 0.72, st.color);
        const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
        if (L < 0.01) return;
        const nx = -dy / L, ny = dx / L, p = (a.p + b.p) / 2;
        for (const br of st.data.bristles) {
          if (br.lift > p + 0.55) continue; // 살살 누르면 바깥 털이 들려 마른 붓 느낌
          const ox = nx * br.o * w, oy = ny * br.o * w;
          roundSeg(ctx, { x: a.x + ox, y: a.y + oy }, { x: b.x + ox, y: b.y + oy }, Math.max(0.6, w * br.t), st.color);
        }
      },
    },
    pencil: {
      name: '연필', icon: 'pencil', hint: '종이 결이 살아나는 거친 선',
      size: 4, opacity: 0.9, minW: 0.55, taperIn: 0.4,
      draw(ctx, a, b, st) {
        const len = Math.max(0.6, U.dist(a, b));
        const w = (a.w + b.w) / 2, r = w / 2 + 0.4, p = (a.p + b.p) / 2;
        const n = Math.ceil(len * w * 0.9 + 2);
        const rnd = st.rand, tooth = 0.62 - 0.42 * p;
        ctx.fillStyle = st.color;
        ctx.globalAlpha = 0.18 + 0.5 * p;
        for (let i = 0; i < n; i++) {
          const t = rnd(), ang = rnd() * TAU, rr = Math.sqrt(rnd()) * r;
          const x = a.x + (b.x - a.x) * t + Math.cos(ang) * rr;
          const y = a.y + (b.y - a.y) * t + Math.sin(ang) * rr;
          if (U.hash2(x | 0, y | 0) < tooth) continue; // 종이 요철의 오목한 곳은 비워둠
          ctx.fillRect(x, y, 1.15, 1.15);
        }
        ctx.globalAlpha = 1;
      },
    },
    marker: {
      name: '마커', icon: 'marker', hint: '겹칠수록 진해지는 반투명 마커',
      size: 24, opacity: 0.55, minW: 0.82, mode: 'multiply',
      draw(ctx, a, b, st) { roundSeg(ctx, a, b, (a.w + b.w) / 2, st.color); },
    },
    calli: {
      name: '캘리', icon: 'calli', hint: '펜촉 방향에 따라 획이 굵고 가늘어져요',
      size: 16, opacity: 1, minW: 0.35, taperIn: 0.3,
      draw(ctx, a, b, st) {
        const vx = Math.cos(-Math.PI / 4), vy = Math.sin(-Math.PI / 4);
        const ha = a.w / 2, hb = b.w / 2;
        ctx.fillStyle = st.color; ctx.strokeStyle = st.color;
        ctx.lineWidth = 1; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x - vx * ha, a.y - vy * ha);
        ctx.lineTo(a.x + vx * ha, a.y + vy * ha);
        ctx.lineTo(b.x + vx * hb, b.y + vy * hb);
        ctx.lineTo(b.x - vx * hb, b.y - vy * hb);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      },
    },
    crayon: {
      name: '크레용', icon: 'crayon', hint: '왁스처럼 틈이 보이는 선',
      size: 16, opacity: 1, minW: 0.55, taperIn: 0.3,
      draw(ctx, a, b, st) {
        const w = ((a.w + b.w) / 2) * (0.82 + st.rand() * 0.3);
        roundSeg(ctx, a, b, w, crayonPattern(ctx, st.rgb));
      },
    },
    spray: {
      name: '에어브러시', icon: 'spray', hint: '누르고 있으면 계속 뿌려져요',
      size: 46, opacity: 1, minW: 1, pad: 0.6, spacing: 3,
      draw(ctx, a, b, st) { spray(ctx, b, st, U.dist(a, b) / 5 + 0.25); },
      tick(ctx, s, st) { spray(ctx, s, st, 0.8); },
    },
    neon: {
      name: '네온', icon: 'neon', hint: '빛나는 선 · 검정 종이에서 멋져요',
      size: 9, opacity: 1, minW: 1, pad: 3.2, full: true,
      renderFull(ctx, st) {
        const path = st.data.path;
        if (!path) return;
        const w = st.size;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.shadowColor = st.color;
        ctx.strokeStyle = st.color;
        ctx.lineWidth = w;
        ctx.shadowBlur = w * 2.4; ctx.stroke(path);
        ctx.shadowBlur = w * 1.1; ctx.stroke(path);
        const { r, g, b } = st.rgb;
        ctx.strokeStyle = `rgb(${r + (255 - r) * 0.75},${g + (255 - g) * 0.75},${b + (255 - b) * 0.75})`;
        ctx.lineWidth = Math.max(1, w * 0.38);
        ctx.shadowBlur = w * 0.6; ctx.stroke(path);
        ctx.shadowBlur = 0;
      },
      onSample(s, prev, st) {
        if (!st.data.path) { st.data.path = new Path2D(); st.data.path.moveTo(s.x, s.y); st.data.path.lineTo(s.x + 0.01, s.y); }
        else st.data.path.lineTo(s.x, s.y);
      },
    },
    rainbow: {
      name: '무지개', icon: 'rainbow', hint: '그을수록 색이 바뀌어요',
      size: 12, opacity: 1, minW: 0.35, taperIn: 0.6, taperOut: 0.6,
      draw(ctx, a, b, st) {
        const hue = (st.hue0 + b.d * 0.45) % 360;
        roundSeg(ctx, a, b, (a.w + b.w) / 2, `hsl(${hue} 88% 56%)`);
      },
    },
    sketchy: {
      name: '스케치', icon: 'sketchy', hint: '가까운 선끼리 실처럼 이어져요',
      size: 10, opacity: 1, minW: 0.2, pad: 1, spacing: 2,
      init(st) { st.data.pts = []; st.data.pending = null; },
      draw(ctx, a, b, st, ti) {
        const D = st.data;
        if (ti === 0) {
          D.pending = null;
          const last = D.pts[D.pts.length - 1];
          if (last && U.dist(last, b) < 2.5) return;
          const lines = [];
          if (last) lines.push([last.x, last.y, b.x, b.y, 0.55]);
          const R = st.size * 5, R2 = R * R, rnd = st.rand;
          const start = Math.max(0, D.pts.length - 900);
          for (let j = start; j < D.pts.length - 2; j++) {
            const q = D.pts[j], dx = q.x - b.x, dy = q.y - b.y, d2 = dx * dx + dy * dy;
            if (d2 < R2 && rnd() > d2 / R2 * 0.9 + 0.12) {
              lines.push([b.x + dx * 0.28, b.y + dy * 0.28, q.x - dx * 0.28, q.y - dy * 0.28, 0.07 + 0.13 * b.p]);
            }
          }
          D.pts.push({ x: b.x, y: b.y });
          D.pending = lines;
        }
        if (!D.pending) return;
        ctx.strokeStyle = st.color;
        ctx.lineWidth = Math.max(0.6, st.size * 0.09);
        ctx.lineCap = 'round';
        for (const l of D.pending) {
          ctx.globalAlpha = l[4];
          ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(l[2], l[3]); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
    },
    eraser: {
      name: '지우개', icon: 'eraser', hint: '그린 것만 지워요 · 펜 뒤꼭지로도 돼요',
      size: 26, opacity: 1, minW: 0.5, mode: 'destination-out', noShapes: true,
      draw(ctx, a, b) { roundSeg(ctx, a, b, (a.w + b.w) / 2, '#000'); },
    },
  };
  for (const [id, b] of Object.entries(BRUSHES)) b.id = id;

  // ---------------------------------------------------------------
  class Stroke {
    /* opt: { ctx, brush, color, size, transforms, seed } */
    constructor(opt) {
      Object.assign(this, opt);
      this.rgb = U.hexToRgb(this.color);
      this.seed = opt.seed ?? ((Math.random() * 1e9) | 0);
      this.pts = [];
      this.total = null;
      this.spacing = this.brush.spacing ?? U.clamp(this.size * 0.12, 0.8, 3);
      this.reset();
    }
    reset() {
      this.rand = U.rng(this.seed);
      this.hue0 = (this.seed % 360);
      this.data = {};
      this.lastS = null;
      this.cur = null;
      this.n = 0;
      this.bbox = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      this.brush.init && this.brush.init(this);
    }
    widthAt(p, d) {
      const b = this.brush;
      if (b.curveBias) p = Math.pow(p, b.curveBias);
      let w = this.size * (b.minW + (1 - b.minW) * p);
      if (!this.noTaper) {
        if (b.taperIn) w *= taper(d / (this.size * b.taperIn));
        if (b.taperOut && this.total != null) w *= taper((this.total - d) / (this.size * b.taperOut));
      }
      return Math.max(0.35, w);
    }
    emit(x, y, p) {
      const prev = this.lastS;
      const d = prev ? prev.d + Math.hypot(x - prev.x, y - prev.y) : 0;
      const s = { x, y, p, d, w: 0 };
      s.w = this.widthAt(p, d);
      const pad = s.w * (this.brush.pad ?? 0.6) + 3;
      const bb = this.bbox;
      if (x - pad < bb.x0) bb.x0 = x - pad; if (x + pad > bb.x1) bb.x1 = x + pad;
      if (y - pad < bb.y0) bb.y0 = y - pad; if (y + pad > bb.y1) bb.y1 = y + pad;
      if (this.brush.onSample) this.brush.onSample(s, prev, this);
      if (this.brush.draw) this.drawSeg(prev || s, s);
      this.lastS = s;
    }
    drawSeg(a, b) {
      const ctx = this.ctx, T = this.transforms;
      for (let i = 0; i < T.length; i++) {
        const m = T[i];
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        this.brush.draw(ctx, a, b, this, i);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // a → b 를 c 를 조절점으로 하는 2차 곡선으로 샘플링
    walk(a, c, b) {
      const len = Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y);
      const steps = Math.max(1, Math.ceil(len / this.spacing));
      for (let k = 1; k <= steps; k++) {
        const t = k / steps, u = 1 - t;
        this.emit(
          u * u * a.x + 2 * u * t * c.x + t * t * b.x,
          u * u * a.y + 2 * u * t * c.y + t * t * b.y,
          a.p + (b.p - a.p) * t
        );
      }
      this.cur = b;
    }
    add(pt) {
      const P = this.pts;
      if (!this.replaying) P.push(pt);
      this.n++;
      const n = this.n;
      if (n === 1) { this.emit(pt.x, pt.y, pt.p); this.cur = pt; return; }
      const A = P[n - 2], B = P[n - 1];
      const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, p: (A.p + B.p) / 2 };
      if (n === 2) this.walk(this.cur, { x: (this.cur.x + mid.x) / 2, y: (this.cur.y + mid.y) / 2 }, mid);
      else this.walk(this.cur, A, mid);
    }
    finish() {
      const P = this.pts, last = P[P.length - 1];
      if (this.n > 1 && this.cur && (this.cur.x !== last.x || this.cur.y !== last.y)) {
        this.walk(this.cur, { x: (this.cur.x + last.x) / 2, y: (this.cur.y + last.y) / 2 }, last);
      }
    }
    tick() {
      if (!this.brush.tick || !this.lastS) return;
      const ctx = this.ctx;
      for (const m of this.transforms) {
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        this.brush.tick(ctx, this.lastS, this);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // 전체를 다시 그림(끝 가늘어짐 반영, 도형 보정 후)
    replay(points) {
      if (points) this.pts = points;
      const total = this.total;
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
      this.reset();
      this.total = total;
      this.replaying = true;
      for (const p of this.pts) this.add(p);
      this.finish();
      this.replaying = false;
      this.render();
    }
    get length() { return this.lastS ? this.lastS.d : 0; }
    // 끝을 가늘게 하려면 한 번 더 그린다
    finalize() {
      this.finish();
      if (this.brush.taperOut && this.pts.length > 2) {
        this.total = this.length;
        this.replay();
      }
      this.render();
    }
    render() {
      if (!this.brush.full) return;
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      for (const m of this.transforms) {
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        this.brush.renderFull(ctx, this);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  // 오른쪽 패널의 펜 미리보기
  function renderPreview(canvas, brush, opt) {
    const W = canvas.width, H = canvas.height;
    const g = canvas.getContext('2d');
    const c = U.hexToRgb(opt.color);
    const dark = brush.id === 'neon' || (brush.id !== 'eraser' && 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 215);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = dark ? '#16181d' : '#ffffff';
    g.fillRect(0, 0, W, H);
    const off = U.canvas(W, H);
    const size = Math.min(opt.size * 2, H * 0.5);
    const st = new Stroke({
      ctx: off.getContext('2d'), brush, color: brush.id === 'eraser' ? '#000000' : opt.color,
      size, transforms: [[1, 0, 0, 1, 0, 0]], seed: 7,
    });
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      st.add({ x: 24 + t * (W - 48), y: H / 2 + Math.sin(t * Math.PI * 2) * H * 0.22, p: Math.sin(t * Math.PI) * 0.85 + 0.1 });
    }
    st.finalize();
    if (brush.id === 'eraser') {
      g.fillStyle = '#c9ced8';
      g.fillRect(0, H * 0.25, W, H * 0.5);
    }
    g.globalCompositeOperation = brush.mode || 'source-over';
    g.globalAlpha = opt.opacity;
    g.drawImage(off, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  SK.BRUSHES = BRUSHES;
  SK.Stroke = Stroke;
  SK.renderPreview = renderPreview;
})();
