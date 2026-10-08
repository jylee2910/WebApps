/* 끄적끄적 스케치북 — 앱 본체: 캔버스, 입력·필압, 도구, 되돌리기, 이미지, 저장 */
(function () {
  const U = SK.U, BR = SK.BRUSHES;
  const $ = (id) => document.getElementById(id);

  const viewport = $('viewport'), stage = $('stage');
  const bgC = $('bgCanvas'), drawC = $('drawCanvas'), guideC = $('guideCanvas');
  const bgX = bgC.getContext('2d', { willReadFrequently: true });
  const drawX = drawC.getContext('2d');
  const guideX = guideC.getContext('2d');
  const strokeC = U.canvas(1, 1), strokeX = strokeC.getContext('2d');
  const baseC = U.canvas(1, 1), baseX = baseC.getContext('2d');

  const TOOL_ORDER = ['pen', 'brush', 'pencil', 'marker', 'calli', 'crayon', 'spray', 'neon', 'rainbow', 'sketchy', 'eraser', '|', 'fill', 'picker', 'hand'];
  const OTHER_TOOLS = {
    fill: { name: '채우기', icon: 'fill', hint: '닫힌 곳을 눌러 색으로 채워요' },
    picker: { name: '스포이드', icon: 'picker', hint: '그림에서 색을 집어요 · Alt+클릭도 돼요' },
    hand: { name: '손', icon: 'hand', hint: '끌어서 캔버스를 옮겨요 · Space를 눌러도 돼요' },
  };
  const SWATCHES = ['#1b1f27', '#ffffff', '#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#0090ff',
    '#3e63dd', '#8e4ec6', '#d6409f', '#a18072', '#8b8d98', '#ffb3c1', '#a6e3ff', '#c4f1be'];
  const PAPERS = {
    white: '#ffffff', lined: '#fffefb', grid: '#ffffff', dots: '#fdfdfc', kraft: '#cdb089', black: '#15171c',
  };

  const S = {
    w: 0, h: 0,
    tool: 'pen', color: '#1b1f27', size: 5, opacity: 1,
    smoothing: 0.45, pressureMode: 'auto', curve: 1,
    symmetry: 'none', quickShape: true, layerBlend: 'source-over', paper: 'white',
    bg: { img: null, opacity: 1, rect: null },
    view: { z: 1, x: 0, y: 0 },
    toolSettings: {}, recent: [], dirty: false, penSeen: false,
  };

  // ---------------------------------------------------------------- toast
  let toastTimer = 0;
  function toast(msg, actionLabel, action) {
    const t = $('toast');
    t.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = msg;
    t.append(span);
    if (actionLabel) {
      const b = document.createElement('button');
      b.textContent = actionLabel;
      b.onclick = () => { t.classList.remove('show'); action(); };
      t.append(b);
    }
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), actionLabel ? 6500 : 3200);
  }

  // ---------------------------------------------------------------- document
  function setCanvasSize(c, w, h, css) {
    c.width = w; c.height = h;
    if (css) { c.style.width = w + 'px'; c.style.height = h + 'px'; }
  }
  function initDoc(w, h) {
    S.w = w; S.h = h;
    for (const c of [bgC, drawC, guideC]) setCanvasSize(c, w, h, true);
    setCanvasSize(strokeC, w, h); setCanvasSize(baseC, w, h);
    stage.style.width = w + 'px'; stage.style.height = h + 'px';
    $('docSize').textContent = `${w} × ${h}px`;
    renderBg();
    fitView();
  }

  function renderBg() {
    const g = bgX, w = S.w, h = S.h;
    g.globalAlpha = 1;
    g.fillStyle = PAPERS[S.paper];
    g.fillRect(0, 0, w, h);
    const unit = Math.max(16, Math.round(Math.max(w, h) / 48));
    const lw = Math.max(1, Math.round(w / 1600));
    g.lineWidth = lw;
    if (S.paper === 'lined') {
      g.strokeStyle = 'rgba(64,104,200,.28)';
      g.beginPath();
      for (let y = unit * 3; y < h; y += Math.round(unit * 1.5)) { g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); }
      g.stroke();
      g.strokeStyle = 'rgba(220,70,70,.35)';
      g.beginPath(); g.moveTo(unit * 3 + 0.5, 0); g.lineTo(unit * 3 + 0.5, h); g.stroke();
    } else if (S.paper === 'grid') {
      for (let pass = 0; pass < 2; pass++) {
        g.strokeStyle = pass ? 'rgba(50,90,180,.22)' : 'rgba(50,90,180,.10)';
        g.beginPath();
        for (let i = 0, x = 0; x < w; x += unit, i++) if ((i % 5 === 0) === !!pass) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); }
        for (let i = 0, y = 0; y < h; y += unit, i++) if ((i % 5 === 0) === !!pass) { g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); }
        g.stroke();
      }
    } else if (S.paper === 'dots') {
      g.fillStyle = 'rgba(30,36,50,.24)';
      const r = Math.max(1.2, unit / 22);
      for (let y = unit; y < h; y += unit) for (let x = unit; x < w; x += unit) {
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
    } else if (S.paper === 'kraft') {
      const rnd = U.rng(3);
      const n = (w * h) / 260;
      for (let i = 0; i < n; i++) {
        g.fillStyle = rnd() > 0.5 ? 'rgba(255,245,225,.10)' : 'rgba(90,60,30,.09)';
        g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1);
      }
    }
    if (S.bg.img) {
      const r = S.bg.rect;
      g.globalAlpha = S.bg.opacity;
      g.imageSmoothingQuality = 'high';
      g.drawImage(S.bg.img, r.x, r.y, r.w, r.h);
      g.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- view
  let vpRect = viewport.getBoundingClientRect();
  function applyView() {
    const v = S.view;
    stage.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.z})`;
    $('zoomChip').textContent = Math.round(v.z * (window.devicePixelRatio || 1) * 100) + '%';
    drawGuides();
  }
  function fitView() {
    vpRect = viewport.getBoundingClientRect();
    const pad = vpRect.width < 600 ? 12 : 32;
    const z = Math.min((vpRect.width - pad * 2) / S.w, (vpRect.height - pad * 2) / S.h);
    S.view = { z, x: (vpRect.width - S.w * z) / 2, y: (vpRect.height - S.h * z) / 2 };
    applyView();
  }
  function zoomAt(cx, cy, factor) {
    const v = S.view, px = cx - vpRect.left, py = cy - vpRect.top;
    const nz = U.clamp(v.z * factor, 0.04, 16);
    v.x = px - ((px - v.x) * nz) / v.z;
    v.y = py - ((py - v.y) * nz) / v.z;
    v.z = nz;
    applyView();
  }
  const toDoc = (cx, cy) => ({ x: (cx - vpRect.left - S.view.x) / S.view.z, y: (cy - vpRect.top - S.view.y) / S.view.z });

  // ---------------------------------------------------------------- symmetry
  function transforms() {
    const cx = S.w / 2, cy = S.h / 2, I = [1, 0, 0, 1, 0, 0];
    const rot = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]; };
    const MX = [-1, 0, 0, 1, 2 * cx, 0], MY = [1, 0, 0, -1, 0, 2 * cy];
    const mul = (m, n) => [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ];
    switch (S.symmetry) {
      case 'mx': return [I, MX];
      case 'my': return [I, MY];
      case 'quad': return [I, MX, MY, rot(Math.PI)];
      case 'r6': return [0, 1, 2, 3, 4, 5].map((k) => rot((k * Math.PI) / 3));
      case 'kaleido': return [0, 1, 2, 3, 4, 5].flatMap((k) => [rot((k * Math.PI) / 3), mul(rot((k * Math.PI) / 3), MX)]);
      default: return [I];
    }
  }
  function drawGuides() {
    const g = guideX;
    g.clearRect(0, 0, S.w, S.h);
    if (S.symmetry === 'none') return;
    const cx = S.w / 2, cy = S.h / 2, R = Math.hypot(S.w, S.h);
    g.save();
    g.strokeStyle = 'rgba(36,72,201,.45)';
    g.lineWidth = 1.2 / S.view.z;
    g.setLineDash([6 / S.view.z, 6 / S.view.z]);
    g.beginPath();
    const ray = (a) => { g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); };
    if (S.symmetry === 'mx' || S.symmetry === 'quad') { g.moveTo(cx, 0); g.lineTo(cx, S.h); }
    if (S.symmetry === 'my' || S.symmetry === 'quad') { g.moveTo(0, cy); g.lineTo(S.w, cy); }
    if (S.symmetry === 'r6') for (let k = 0; k < 6; k++) ray((k * Math.PI) / 3 - Math.PI / 2);
    if (S.symmetry === 'kaleido') for (let k = 0; k < 12; k++) ray((k * Math.PI) / 6 - Math.PI / 2);
    g.stroke();
    g.restore();
  }

  // ---------------------------------------------------------------- history
  const H = { undo: [], redo: [], bytes: 0, LIMIT: 320 * 1024 * 1024 };
  function pushHistory(entry) {
    H.undo.push(entry);
    H.redo = [];
    H.bytes += entry.bytes || 0;
    while (H.bytes > H.LIMIT && H.undo.length > 1) H.bytes -= H.undo.shift().bytes || 0;
    S.dirty = true;
    updateHistoryButtons();
  }
  function pixelsEntry(x, y, before, after) {
    return {
      bytes: before.data.length * 2,
      undo() { drawX.putImageData(before, x, y); },
      redo() { drawX.putImageData(after, x, y); },
    };
  }
  function undo() {
    if (stroke || harm) return;
    const e = H.undo.pop();
    if (!e) return;
    e.undo(); H.redo.push(e); updateHistoryButtons();
  }
  function redo() {
    if (stroke || harm) return;
    const e = H.redo.pop();
    if (!e) return;
    e.redo(); H.undo.push(e); updateHistoryButtons();
  }
  function updateHistoryButtons() {
    $('btnUndo').disabled = !H.undo.length;
    $('btnRedo').disabled = !H.redo.length;
  }

  // ---------------------------------------------------------------- composite helpers
  function composite() {
    const c = U.canvas(S.w, S.h), g = c.getContext('2d');
    g.drawImage(bgC, 0, 0);
    g.globalCompositeOperation = S.layerBlend;
    g.drawImage(drawC, 0, 0);
    return c;
  }
  function isDrawEmpty() {
    return !U.alphaBounds(drawX.getImageData(0, 0, S.w, S.h).data, S.w, S.h);
  }
  // 검색용: 그린 것만 잘라 정사각형으로
  function sketchSnapshot(size) {
    const d = drawX.getImageData(0, 0, S.w, S.h);
    const b = U.alphaBounds(d.data, S.w, S.h);
    if (!b) return null;
    const side = Math.max(b.w, b.h) * 1.16 + 8;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const c = U.canvas(size, size), g = c.getContext('2d');
    // 밝은 선(흰색·네온)은 어두운 바탕에 올려야 AI가 알아봐요
    let lum = 0, n = 0;
    for (let y = b.y; y < b.y + b.h; y += 3) for (let x = b.x; x < b.x + b.w; x += 3) {
      const i = (y * S.w + x) * 4;
      if (d.data[i + 3] > 128) { lum += 0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2]; n++; }
    }
    g.fillStyle = n && lum / n > 190 ? PAPERS.black : '#ffffff';
    g.fillRect(0, 0, size, size);
    g.imageSmoothingQuality = 'high';
    g.drawImage(drawC, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size);
    return c;
  }

  // ---------------------------------------------------------------- tools UI
  const rail = $('toolrail');
  function toolMeta(id) { return BR[id] || OTHER_TOOLS[id]; }
  function buildRail() {
    for (const id of TOOL_ORDER) {
      if (id === '|') { const s = document.createElement('div'); s.className = 'tool-sep'; rail.append(s); continue; }
      const m = toolMeta(id);
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = id;
      b.title = `${m.name} — ${m.hint}`;
      b.innerHTML = `<svg><use href="#i-${m.icon}"/></svg><span></span>`;
      b.lastChild.textContent = m.name;
      b.onclick = () => setTool(id);
      rail.append(b);
    }
  }
  function setTool(id) {
    if (BR[S.tool]) S.toolSettings[S.tool] = { size: S.size, opacity: S.opacity };
    S.tool = id;
    if (BR[id]) {
      const saved = S.toolSettings[id] || { size: BR[id].size, opacity: BR[id].opacity };
      S.size = saved.size; S.opacity = saved.opacity;
      $('size').value = S.size; $('opacity').value = Math.round(S.opacity * 100);
    }
    rail.querySelectorAll('.tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === id)));
    const m = toolMeta(id);
    $('toolName').textContent = m.name;
    $('toolHint').textContent = m.hint;
    viewport.classList.toggle('drawing-tool', !!BR[id]);
    viewport.classList.toggle('fill-tool', id === 'fill');
    viewport.classList.toggle('picker-tool', id === 'picker');
    viewport.classList.toggle('panning', id === 'hand');
    syncOutputs();
  }
  function syncOutputs() {
    $('sizeOut').textContent = S.size;
    $('opacityOut').textContent = Math.round(S.opacity * 100) + '%';
    $('smoothingOut').textContent = Math.round(S.smoothing * 100);
    const g = S.curve;
    $('curveOut').textContent = g < 0.85 ? '가볍게' : g > 1.2 ? '세게' : '보통';
    $('colorHex').textContent = S.color.toUpperCase();
    $('color').value = S.color;
    document.querySelectorAll('#swatches .swatch').forEach((s) => s.setAttribute('aria-pressed', String(s.dataset.c === S.color)));
    const pv = $('preview');
    pv.hidden = !BR[S.tool];
    if (BR[S.tool]) SK.renderPreview(pv, BR[S.tool], { size: S.size, opacity: S.opacity, color: S.color });
  }
  function setColor(c) {
    S.color = c.toLowerCase();
    syncOutputs();
  }
  function rememberColor() {
    S.recent = [S.color, ...S.recent.filter((c) => c !== S.color)].slice(0, 5);
    const r = $('recent');
    r.innerHTML = '';
    for (const c of S.recent) {
      const b = document.createElement('button');
      b.className = 'swatch'; b.style.background = c; b.title = c; b.dataset.c = c;
      b.onclick = () => setColor(c);
      r.append(b);
    }
  }

  function buildProps() {
    const sw = $('swatches');
    for (const c of SWATCHES) {
      const b = document.createElement('button');
      b.className = 'swatch'; b.style.background = c; b.dataset.c = c; b.title = c;
      b.onclick = () => setColor(c);
      sw.append(b);
    }
    $('color').addEventListener('input', (e) => setColor(e.target.value));
    $('size').addEventListener('input', (e) => { S.size = +e.target.value; syncOutputs(); updateCursorSize(); });
    $('opacity').addEventListener('input', (e) => { S.opacity = e.target.value / 100; syncOutputs(); });
    $('smoothing').addEventListener('input', (e) => { S.smoothing = e.target.value / 100; syncOutputs(); });
    $('curve').addEventListener('input', (e) => { S.curve = e.target.value / 100; syncOutputs(); });
    const seg = $('pressureMode');
    const setMode = (v) => {
      S.pressureMode = v;
      seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
    };
    seg.querySelectorAll('button').forEach((b) => (b.onclick = () => setMode(b.dataset.v)));
    setMode('auto');
    $('quickShape').addEventListener('change', (e) => (S.quickShape = e.target.checked));
    $('symmetry').addEventListener('change', (e) => { S.symmetry = e.target.value; drawGuides(); });
    $('layerBlend').addEventListener('change', (e) => { S.layerBlend = e.target.value; drawC.style.mixBlendMode = cssBlend(S.layerBlend); });
    $('paper').addEventListener('change', (e) => { S.paper = e.target.value; renderBg(); });
    $('bgOpacity').addEventListener('input', (e) => {
      S.bg.opacity = e.target.value / 100;
      $('bgOpacityOut').textContent = e.target.value + '%';
      renderBg();
    });
    $('btnRemoveBg').onclick = removeBackground;
    $('btnFitDoc').onclick = fitDocToImage;
  }
  const cssBlend = (op) => (op === 'source-over' ? 'normal' : op);

  // ---------------------------------------------------------------- pressure
  const meterFill = $('meterFill'), meterVal = $('meterVal'), meterSrc = $('meterSrc');
  function pressureOf(e, info) {
    const isPen = e.pointerType === 'pen';
    let p, src;
    const mode = S.pressureMode;
    if (mode === 'fixed' || (mode === 'pressure' && !isPen)) { p = 1; src = '고정'; }
    else if (isPen && mode !== 'velocity') { p = e.pressure > 0 ? e.pressure : 0.25; src = '펜 필압'; }
    else {
      // 속도 필압: 빠르게 그을수록 가늘게
      const t = e.timeStamp, lc = info.lastClient;
      if (lc) {
        const dt = Math.max(1, t - lc.t);
        const v = Math.hypot(e.clientX - lc.x, e.clientY - lc.y) / dt;
        const target = U.clamp(1.12 - v * 0.42, 0.16, 1);
        info.vp += (target - info.vp) * 0.18;
      }
      info.lastClient = { x: e.clientX, y: e.clientY, t };
      p = info.vp; src = '속도';
    }
    p = Math.pow(U.clamp(p, 0.02, 1), S.curve);
    meterFill.style.width = Math.round(p * 100) + '%';
    meterVal.textContent = p.toFixed(2);
    meterSrc.textContent = src;
    return p;
  }

  // ---------------------------------------------------------------- strokes
  let stroke = null, info = null, raf = 0, mode = null;
  const pointers = new Map();
  let pinch = null, pan = null, spaceDown = false, harm = null;

  function requestFrame() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    if (!stroke) return;
    stroke.render();
    composeLive();
  }
  function composeLive() {
    drawX.globalCompositeOperation = 'copy';
    drawX.globalAlpha = 1;
    drawX.drawImage(baseC, 0, 0);
    drawX.globalCompositeOperation = info.brush.mode || 'source-over';
    drawX.globalAlpha = info.opacity;
    drawX.drawImage(strokeC, 0, 0);
    drawX.globalCompositeOperation = 'source-over';
    drawX.globalAlpha = 1;
  }

  function beginStroke(e, brush) {
    baseX.globalCompositeOperation = 'copy';
    baseX.drawImage(drawC, 0, 0);
    baseX.globalCompositeOperation = 'source-over';
    strokeX.setTransform(1, 0, 0, 1, 0, 0);
    strokeX.clearRect(0, 0, S.w, S.h);
    const p = toDoc(e.clientX, e.clientY);
    info = {
      id: e.pointerId, type: e.pointerType, brush, opacity: brush.id === 'eraser' ? S.opacity : S.opacity,
      vp: 0.62, lastClient: null, snapped: false,
      sm: { x: p.x, y: p.y, p: 0 }, raw: p, holdAt: { x: e.clientX, y: e.clientY }, holdTimer: 0, sprayTimer: 0,
    };
    const pr = pressureOf(e, info);
    info.sm.p = pr;
    stroke = new SK.Stroke({
      ctx: strokeX, brush, color: S.color, size: brush.id === S.tool ? S.size : (S.toolSettings[brush.id]?.size ?? brush.size),
      transforms: transforms(),
    });
    stroke.add({ x: p.x, y: p.y, p: pr });
    info.last = { x: p.x, y: p.y };
    if (brush.tick) info.sprayTimer = setInterval(() => { if (stroke) { stroke.tick(); requestFrame(); } }, 33);
    armHold();
    mode = 'draw';
    $('emptyHint') && $('emptyHint').remove();
    requestFrame();
  }

  function addInput(ev) {
    if (!stroke || info.snapped) return;
    const p = toDoc(ev.clientX, ev.clientY);
    const pr = pressureOf(ev, info);
    info.raw = p;
    const a = 1 - S.smoothing * 0.9;
    const sm = info.sm;
    sm.x += (p.x - sm.x) * a;
    sm.y += (p.y - sm.y) * a;
    sm.p += (pr - sm.p) * Math.min(1, a * 1.6);
    if (Math.hypot(sm.x - info.last.x, sm.y - info.last.y) < 0.7) return;
    stroke.add({ x: sm.x, y: sm.y, p: sm.p });
    info.last = { x: sm.x, y: sm.y };
    if (Math.hypot(ev.clientX - info.holdAt.x, ev.clientY - info.holdAt.y) > 5) {
      info.holdAt = { x: ev.clientX, y: ev.clientY };
      armHold();
    }
    requestFrame();
  }

  // 손떨림 보정 때문에 늦게 따라오는 끝부분을 실제 펜 위치까지 채움
  function catchUp() {
    const sm = info.sm, r = info.raw;
    const d = Math.hypot(r.x - sm.x, r.y - sm.y);
    if (d < 0.7) return;
    const n = Math.min(12, Math.ceil(d / 3));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      stroke.add({ x: sm.x + (r.x - sm.x) * t, y: sm.y + (r.y - sm.y) * t, p: sm.p });
    }
    sm.x = r.x; sm.y = r.y;
    info.last = { x: r.x, y: r.y };
  }

  function armHold() {
    clearTimeout(info.holdTimer);
    if (!S.quickShape || info.brush.noShapes || info.brush.tick) return;
    info.holdTimer = setTimeout(trySnap, 520);
  }
  // 받침에 따라 '로' / '으로'
  function josaRo(word) {
    const c = word.charCodeAt(word.length - 1) - 0xac00;
    if (c < 0 || c > 11171) return '(으)로';
    const jong = c % 28;
    return jong === 0 || jong === 8 ? '로' : '으로';
  }
  function trySnap() {
    if (!stroke || info.snapped) return;
    catchUp();
    const shape = SK.Shapes.detect(stroke.pts);
    if (!shape) return;
    const ps = stroke.pts.map((p) => p.p).sort((a, b) => a - b);
    const med = ps[ps.length >> 1];
    stroke.noTaper = true;
    stroke.total = null;
    stroke.replay(shape.pts.map((q) => ({ x: q.x, y: q.y, p: med })));
    info.snapped = true;
    const badge = $('shapeBadge');
    badge.textContent = shape.label + josaRo(shape.label) + ' 다듬었어요';
    badge.hidden = false;
    clearTimeout(badge._t);
    badge._t = setTimeout(() => (badge.hidden = true), 1300);
    requestFrame();
  }

  function endStroke() {
    clearTimeout(info.holdTimer);
    clearInterval(info.sprayTimer);
    if (!info.snapped) { catchUp(); stroke.finalize(); } else stroke.render();
    composeLive();
    let x0, y0, x1, y1;
    if (stroke.transforms.length > 1) { x0 = 0; y0 = 0; x1 = S.w; y1 = S.h; }
    else {
      const b = stroke.bbox;
      x0 = U.clamp(Math.floor(b.x0), 0, S.w); y0 = U.clamp(Math.floor(b.y0), 0, S.h);
      x1 = U.clamp(Math.ceil(b.x1), 0, S.w); y1 = U.clamp(Math.ceil(b.y1), 0, S.h);
    }
    if (x1 > x0 && y1 > y0) {
      const before = baseX.getImageData(x0, y0, x1 - x0, y1 - y0);
      const after = drawX.getImageData(x0, y0, x1 - x0, y1 - y0);
      pushHistory(pixelsEntry(x0, y0, before, after));
    }
    if (info.brush.id !== 'eraser') rememberColor();
    stroke = null; info = null; mode = null;
  }
  function cancelStroke() {
    if (!stroke) return;
    clearTimeout(info.holdTimer);
    clearInterval(info.sprayTimer);
    drawX.globalCompositeOperation = 'copy';
    drawX.drawImage(baseC, 0, 0);
    drawX.globalCompositeOperation = 'source-over';
    stroke = null; info = null; mode = null;
  }

  // ---------------------------------------------------------------- fill & picker
  function floodFill(pt) {
    const w = S.w, h = S.h, x0 = Math.floor(pt.x), y0 = Math.floor(pt.y);
    if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return;
    const cd = composite().getContext('2d').getImageData(0, 0, w, h).data;
    const s = (y0 * w + x0) * 4, tr = cd[s], tg = cd[s + 1], tb = cd[s + 2];
    const tol = 42;
    const match = (i) => {
      const j = i * 4;
      return Math.abs(cd[j] - tr) <= tol && Math.abs(cd[j + 1] - tg) <= tol && Math.abs(cd[j + 2] - tb) <= tol;
    };
    const mask = new Uint8Array(w * h);
    let bx0 = x0, by0 = y0, bx1 = x0, by1 = y0;
    const stack = [x0, y0];
    while (stack.length) {
      const y = stack.pop();
      let x = stack.pop(), i = y * w + x;
      while (x >= 0 && !mask[i] && match(i)) { x--; i--; }
      x++; i++;
      let up = false, down = false;
      while (x < w && !mask[i] && match(i)) {
        mask[i] = 1;
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
        if (y > 0) { const u = i - w; if (!mask[u] && match(u)) { if (!up) { stack.push(x, y - 1); up = true; } } else up = false; }
        if (y < h - 1) { const d = i + w; if (!mask[d] && match(d)) { if (!down) { stack.push(x, y + 1); down = true; } } else down = false; }
        x++; i++;
      }
    }
    // 선 안쪽의 흐릿한 가장자리까지 1px 넓혀 틈 없애기
    bx0 = Math.max(0, bx0 - 1); by0 = Math.max(0, by0 - 1); bx1 = Math.min(w - 1, bx1 + 1); by1 = Math.min(h - 1, by1 + 1);
    const rw = bx1 - bx0 + 1, rh = by1 - by0 + 1;
    const before = drawX.getImageData(bx0, by0, rw, rh);
    const after = new ImageData(new Uint8ClampedArray(before.data), rw, rh);
    const o = after.data, c = U.hexToRgb(S.color), sa = S.opacity;
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const gx = bx0 + x, gy = by0 + y, gi = gy * w + gx;
      let on = mask[gi];
      if (!on) {
        for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1 && !on; dx++) {
          const nx = gx + dx, ny = gy + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny * w + nx]) on = 1;
        }
      }
      if (!on) continue;
      const j = (y * rw + x) * 4, da = o[j + 3] / 255, oa = sa + da * (1 - sa);
      o[j] = (c.r * sa + o[j] * da * (1 - sa)) / oa;
      o[j + 1] = (c.g * sa + o[j + 1] * da * (1 - sa)) / oa;
      o[j + 2] = (c.b * sa + o[j + 2] * da * (1 - sa)) / oa;
      o[j + 3] = oa * 255;
    }
    drawX.putImageData(after, bx0, by0);
    pushHistory(pixelsEntry(bx0, by0, before, after));
    rememberColor();
    $('emptyHint') && $('emptyHint').remove();
  }

  function pickColor(pt) {
    const x = Math.floor(pt.x), y = Math.floor(pt.y);
    if (x < 0 || y < 0 || x >= S.w || y >= S.h) return;
    const c = U.canvas(1, 1), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bgC, x, y, 1, 1, 0, 0, 1, 1);
    g.globalCompositeOperation = S.layerBlend;
    g.drawImage(drawC, x, y, 1, 1, 0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    setColor(U.rgbToHex(d[0], d[1], d[2]));
    toast('색을 집었어요 ' + S.color.toUpperCase());
  }

  // ---------------------------------------------------------------- pointer input
  const cursor = $('brushCursor');
  function updateCursorSize() {
    const d = Math.max(4, S.size * S.view.z);
    cursor.style.width = d + 'px'; cursor.style.height = d + 'px';
  }
  function moveCursor(e) {
    const show = !!BR[S.tool] && e.pointerType !== 'touch' && !spaceDown && mode !== 'pan' && mode !== 'pinch';
    cursor.hidden = !show;
    if (!show) return;
    cursor.style.left = e.clientX - vpRect.left + 'px';
    cursor.style.top = e.clientY - vpRect.top + 'px';
  }

  function touchPoints() { return [...pointers.values()].filter((p) => p.type === 'touch'); }

  viewport.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.zoom-chip')) return;
    e.preventDefault();
    $('props').classList.remove('open'); // 휴대폰: 캔버스를 만지면 설정 시트 닫기
    vpRect = viewport.getBoundingClientRect();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (e.pointerType === 'pen') S.penSeen = true;
    try { viewport.setPointerCapture(e.pointerId); } catch (_) { /* 이미 끝난 포인터 */ }

    const touches = touchPoints();
    if (e.pointerType === 'touch' && touches.length >= 2) {
      if (mode === 'draw' && info && info.type === 'touch') cancelStroke();
      const [a, b] = touches;
      pinch = { d0: Math.hypot(b.x - a.x, b.y - a.y), m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0: { ...S.view } };
      mode = 'pinch';
      return;
    }
    if (mode) return; // 이미 다른 포인터가 그리는 중

    const wantPan = e.button === 1 || spaceDown || S.tool === 'hand' || (e.pointerType === 'touch' && S.penSeen);
    if (wantPan) {
      pan = { x: e.clientX, y: e.clientY, v0: { ...S.view } };
      mode = 'pan';
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (harm) { toast('녹이기를 적용하거나 취소한 뒤에 그릴 수 있어요.'); return; }

    const pt = toDoc(e.clientX, e.clientY);
    if (e.altKey || S.tool === 'picker') { pickColor(pt); return; }
    if (S.tool === 'fill') { floodFill(pt); return; }
    const brush = e.pointerType === 'pen' && (e.buttons & 32) ? BR.eraser : BR[S.tool];
    if (!brush) return;
    beginStroke(e, brush);
  });

  viewport.addEventListener('pointermove', (e) => {
    const pp = pointers.get(e.pointerId);
    if (pp) { pp.x = e.clientX; pp.y = e.clientY; }
    moveCursor(e);
    if (mode === 'pinch') {
      const t = touchPoints();
      if (t.length < 2) return;
      const [a, b] = t;
      const d = Math.hypot(b.x - a.x, b.y - a.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const v0 = pinch.v0, nz = U.clamp(v0.z * (d / pinch.d0), 0.04, 16);
      const px = pinch.m0.x - vpRect.left, py = pinch.m0.y - vpRect.top;
      S.view = {
        z: nz,
        x: px - ((px - v0.x) * nz) / v0.z + (m.x - pinch.m0.x),
        y: py - ((py - v0.y) * nz) / v0.z + (m.y - pinch.m0.y),
      };
      applyView(); updateCursorSize();
      return;
    }
    if (mode === 'pan' && pan) {
      S.view.x = pan.v0.x + (e.clientX - pan.x);
      S.view.y = pan.v0.y + (e.clientY - pan.y);
      applyView();
      return;
    }
    if (mode === 'draw' && info && e.pointerId === info.id) {
      const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ce of list.length ? list : [e]) addInput(ce);
    }
  });

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (mode === 'pinch') { if (touchPoints().length < 2) { mode = null; pinch = null; } return; }
    if (mode === 'pan') { mode = null; pan = null; return; }
    if (mode === 'draw' && info && e.pointerId === info.id) {
      if (e.type === 'pointercancel') cancelStroke();
      else endStroke();
    }
  }
  viewport.addEventListener('pointerup', onUp);
  viewport.addEventListener('pointercancel', onUp);
  viewport.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') cursor.hidden = true; });
  viewport.addEventListener('contextmenu', (e) => e.preventDefault());
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    vpRect = viewport.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
    else { S.view.x -= e.deltaX; S.view.y -= e.deltaY; applyView(); }
    updateCursorSize();
  }, { passive: false });

  // ---------------------------------------------------------------- images
  const MAX_SIDE = 2400;
  function loadImg(src, cors) {
    return new Promise((res, rej) => {
      const i = new Image();
      if (cors) i.crossOrigin = 'anonymous';
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('이미지를 읽을 수 없어요'));
      i.src = src;
    });
  }
  function toSource(img) {
    const s = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = U.canvas(Math.max(1, Math.round(img.naturalWidth * s)), Math.max(1, Math.round(img.naturalHeight * s)));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  function snapshotDoc() {
    return { w: S.w, h: S.h, draw: U.copyCanvas(drawC), bg: { ...S.bg } };
  }
  function restoreDoc(st) {
    S.bg = { ...st.bg };
    if (st.w !== S.w || st.h !== S.h) initDoc(st.w, st.h); else renderBg();
    drawX.globalCompositeOperation = 'copy';
    drawX.drawImage(st.draw, 0, 0);
    drawX.globalCompositeOperation = 'source-over';
    syncBgBlock();
  }
  function docEntry(before, after) {
    return { bytes: before.w * before.h * 8, undo: () => restoreDoc(before), redo: () => restoreDoc(after) };
  }
  function syncBgBlock() {
    $('bgBlock').hidden = !S.bg.img;
    $('bgOpacity').value = Math.round(S.bg.opacity * 100);
    $('bgOpacityOut').textContent = Math.round(S.bg.opacity * 100) + '%';
    $('btnFitDoc').disabled = !S.bg.img || (S.bg.rect && S.bg.rect.w === S.w && S.bg.rect.h === S.h);
  }

  function setBackground(img) {
    const src = toSource(img);
    const before = snapshotDoc();
    if (isDrawEmpty()) {
      S.bg = { img: src, opacity: 1, rect: { x: 0, y: 0, w: src.width, h: src.height } };
      initDoc(src.width, src.height);
      drawX.clearRect(0, 0, S.w, S.h);
    } else {
      const s = Math.min(S.w / src.width, S.h / src.height);
      const w = src.width * s, h = src.height * s;
      S.bg = { img: src, opacity: S.bg.img ? S.bg.opacity : 1, rect: { x: (S.w - w) / 2, y: (S.h - h) / 2, w, h } };
      renderBg();
      toast('그린 그림을 지키려고 캔버스 크기는 그대로 두었어요.', '캔버스를 이미지 크기로', fitDocToImage);
    }
    pushHistory(docEntry(before, snapshotDoc()));
    syncBgBlock();
  }
  function fitDocToImage() {
    if (!S.bg.img) return;
    const before = snapshotDoc(), r = S.bg.rect, img = S.bg.img;
    const old = U.copyCanvas(drawC);
    S.bg = { ...S.bg, rect: { x: 0, y: 0, w: img.width, h: img.height } };
    initDoc(img.width, img.height);
    drawX.imageSmoothingQuality = 'high';
    drawX.drawImage(old, r.x, r.y, r.w, r.h, 0, 0, S.w, S.h);
    pushHistory(docEntry(before, snapshotDoc()));
    syncBgBlock();
  }
  function removeBackground() {
    const before = snapshotDoc();
    S.bg = { img: null, opacity: 1, rect: null };
    renderBg();
    pushHistory(docEntry(before, snapshotDoc()));
    syncBgBlock();
  }
  async function loadImageFile(file) {
    if (!file || !file.type.startsWith('image/')) { toast('이미지 파일만 불러올 수 있어요.'); return; }
    const url = URL.createObjectURL(file);
    try { setBackground(await loadImg(url)); toast('이미지를 불러왔어요. 위에 덧그려 보세요.'); }
    catch (e) { toast('이 이미지를 읽지 못했어요. PNG나 JPG로 다시 시도해 주세요.'); }
    finally { URL.revokeObjectURL(url); }
  }
  async function loadBackgroundFromURL(url) {
    setBackground(await loadImg(url, true));
  }

  $('btnOpen').onclick = () => $('fileInput').click();
  $('fileInput').addEventListener('change', (e) => { loadImageFile(e.target.files[0]); e.target.value = ''; });
  let dragDepth = 0;
  viewport.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; $('dropHint').hidden = false; });
  viewport.addEventListener('dragover', (e) => e.preventDefault());
  viewport.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropHint').hidden = true; } });
  viewport.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; $('dropHint').hidden = true;
    loadImageFile(e.dataTransfer.files[0]);
  });
  document.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); loadImageFile(item.getAsFile()); }
  });

  // ---------------------------------------------------------------- clear / save
  function clearDrawing() {
    if (isDrawEmpty()) return;
    const before = drawX.getImageData(0, 0, S.w, S.h);
    drawX.clearRect(0, 0, S.w, S.h);
    pushHistory({ bytes: before.data.length, undo: () => drawX.putImageData(before, 0, 0), redo: () => drawX.clearRect(0, 0, S.w, S.h) });
    toast('그림을 지웠어요.', '되돌리기', undo);
  }
  function save() {
    composite().toBlob((blob) => {
      if (!blob) { toast('저장하지 못했어요.'); return; }
      const a = document.createElement('a');
      const d = new Date(), pad = (n) => String(n).padStart(2, '0');
      a.download = `끄적끄적-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
      a.href = URL.createObjectURL(blob);
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      S.dirty = false;
      toast('PNG로 저장했어요.');
    }, 'image/png');
  }

  // ---------------------------------------------------------------- 이미지에 녹이기
  const sheet = $('blendSheet');
  const HKEYS = ['hStrength', 'hLight', 'hColor', 'hTexture', 'hEdge', 'hGrain'];
  let harmQueued = false;
  function harmParams() {
    const v = (id) => $(id).value / 100;
    return { strength: v('hStrength'), light: v('hLight'), color: v('hColor'), texture: v('hTexture'), edge: v('hEdge'), grain: v('hGrain') };
  }
  function renderHarm() {
    harmQueued = false;
    if (!harm) return;
    const out = SK.Harmonize.render(harm, harmParams());
    drawX.putImageData(out, harm.region.x, harm.region.y);
  }
  function queueHarm() { if (!harmQueued) { harmQueued = true; requestAnimationFrame(renderHarm); } }
  function openHarm() {
    if (!S.bg.img) {
      toast('먼저 사진을 불러와 그 위에 그려 주세요. 그린 선을 사진에 녹여요.', '이미지 불러오기', () => $('fileInput').click());
      return;
    }
    const prep = SK.Harmonize.prepare(bgC, drawC);
    if (prep.error) { toast('사진 위에 먼저 무언가를 그려 주세요.'); return; }
    harm = prep;
    search.close();
    sheet.hidden = false;
    renderHarm();
  }
  function closeHarm(apply) {
    if (!harm) return;
    const R = harm.region;
    if (apply) {
      const after = drawX.getImageData(R.x, R.y, R.w, R.h);
      pushHistory(pixelsEntry(R.x, R.y, harm.original, after));
      toast('사진에 녹였어요. 마음에 안 들면 되돌리기를 누르세요.');
    } else {
      drawX.putImageData(harm.original, R.x, R.y);
    }
    harm = null;
    sheet.hidden = true;
  }
  for (const id of HKEYS) {
    $(id).addEventListener('input', (e) => { e.target.nextElementSibling.textContent = e.target.value; queueHarm(); });
  }
  $('btnBlend').onclick = openHarm;
  $('blendApply').onclick = () => closeHarm(true);
  $('blendCancel').onclick = () => closeHarm(false);
  $('blendClose').onclick = () => closeHarm(false);
  const cmp = $('blendCompare');
  cmp.addEventListener('pointerdown', () => { if (harm) drawX.putImageData(harm.original, harm.region.x, harm.region.y); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) cmp.addEventListener(ev, () => { if (harm) renderHarm(); });

  // ---------------------------------------------------------------- 닮은 이미지
  const search = SK.Search.initUI({ sketchSnapshot, loadBackgroundFromURL, toast });
  $('btnSearch').onclick = () => {
    if (harm) closeHarm(false);
    if (search.isOpen) { search.close(); return; }
    if (!sketchSnapshot(8)) { toast('먼저 무언가를 대충 그려 주세요. 닮은 이미지를 찾아 드려요.'); return; }
    search.open();
    search.analyze();
  };

  // ---------------------------------------------------------------- buttons & keys
  $('btnUndo').onclick = undo;
  $('btnRedo').onclick = redo;
  $('btnClear').onclick = clearDrawing;
  $('btnSave').onclick = save;
  $('btnFit').onclick = () => { fitView(); updateCursorSize(); };
  $('btnProps').onclick = () => $('props').classList.toggle('open');
  $('zoomChip').addEventListener('dblclick', fitView);

  const KEY_TOOLS = { b: 'pen', e: 'eraser', g: 'fill', i: 'picker', h: 'hand', p: 'pencil', m: 'marker' };
  const DIGITS = ['pen', 'brush', 'pencil', 'marker', 'calli', 'crayon', 'spray', 'neon', 'rainbow', 'sketchy'];
  window.addEventListener('keydown', (e) => {
    const typing = e.target.closest && e.target.closest('input[type="text"], textarea, select');
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 's') { e.preventDefault(); save(); return; }
    if (mod && k === 'o') { e.preventDefault(); $('fileInput').click(); return; }
    if (mod && k === '0') { e.preventDefault(); fitView(); updateCursorSize(); return; }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); zoomAt(vpRect.left + vpRect.width / 2, vpRect.top + vpRect.height / 2, 1.25); updateCursorSize(); return; }
    if (mod && k === '-') { e.preventDefault(); zoomAt(vpRect.left + vpRect.width / 2, vpRect.top + vpRect.height / 2, 0.8); updateCursorSize(); return; }
    if (mod) return;
    if (e.key === ' ' && !spaceDown) {
      spaceDown = true; viewport.classList.add('panning'); cursor.hidden = true; e.preventDefault(); return;
    }
    if (e.key === 'Escape') { closeHarm(false); search.close(); $('resultModal').hidden = true; $('props').classList.remove('open'); return; }
    if (KEY_TOOLS[k]) { setTool(KEY_TOOLS[k]); return; }
    if (/^[0-9]$/.test(k)) { setTool(DIGITS[(+k + 9) % 10]); return; }
    if (k === '[' || k === ']') {
      S.size = U.clamp(Math.round(S.size * (k === ']' ? 1.18 : 0.85) + (k === ']' ? 1 : -1)), 1, 120);
      $('size').value = S.size; syncOutputs(); updateCursorSize();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') { spaceDown = false; viewport.classList.toggle('panning', S.tool === 'hand'); }
  });
  window.addEventListener('resize', () => { fitView(); updateCursorSize(); });
  window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------------------------------------------------------------- start
  buildRail();
  buildProps();
  vpRect = viewport.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = Math.round((vpRect.width - 48) * dpr), h = Math.round((vpRect.height - 48) * dpr);
  const s = Math.min(1, MAX_SIDE / Math.max(w, h));
  initDoc(Math.max(480, Math.round(w * s)), Math.max(480, Math.round(h * s)));
  setTool('pen');
  updateHistoryButtons();
  updateCursorSize();
  syncBgBlock();

  const hint = document.createElement('div');
  hint.className = 'empty-hint';
  hint.id = 'emptyHint';
  hint.innerHTML = '<b>마우스나 펜으로 그려 보세요</b><span>획 끝에서 잠깐 멈추면 원·직선·사각형으로 다듬어져요 · 사진을 끌어다 놓으면 위에 덧그릴 수 있어요</span>';
  viewport.append(hint);

  SK.app = { S, setTool, setColor, undo, redo, loadBackgroundFromURL, sketchSnapshot, composite, toast };
})();
