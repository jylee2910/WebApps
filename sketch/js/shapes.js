/* 대충 그린 획을 깔끔한 도형으로: 직선 · 호 · 꺾은선 · 원 · 타원 · 삼각형 · 사각형 · 다각형 */
(function () {
  const U = SK.U;
  const DEG = Math.PI / 180;

  function pathLength(P) {
    let L = 0;
    for (let i = 1; i < P.length; i++) L += U.dist(P[i - 1], P[i]);
    return L;
  }

  function resample(P, n) {
    const L = pathLength(P);
    if (L === 0) return [P[0]];
    const step = L / (n - 1), out = [{ x: P[0].x, y: P[0].y }];
    let acc = 0;
    for (let i = 1; i < P.length; i++) {
      let a = P[i - 1];
      const b = P[i];
      let d = U.dist(a, b);
      while (acc + d >= step && d > 0) {
        const t = (step - acc) / d;
        const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        out.push(q);
        a = q; d = U.dist(a, b); acc = 0;
      }
      acc += d;
    }
    while (out.length < n) out.push({ x: P[P.length - 1].x, y: P[P.length - 1].y });
    return out.slice(0, n);
  }

  function segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    let t = L2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
    t = U.clamp(t, 0, 1);
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function rdp(P, eps) {
    if (P.length < 3) return P.slice();
    let maxD = 0, idx = 0;
    const a = P[0], b = P[P.length - 1];
    for (let i = 1; i < P.length - 1; i++) {
      const d = segDist(P[i], a, b);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= eps) return [a, b];
    const l = rdp(P.slice(0, idx + 1), eps), r = rdp(P.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }

  function polyError(R, V, closed) {
    let sum = 0;
    const n = V.length, m = closed ? n : n - 1;
    for (const p of R) {
      let best = Infinity;
      for (let i = 0; i < m; i++) best = Math.min(best, segDist(p, V[i], V[(i + 1) % n]));
      sum += best;
    }
    return sum / R.length;
  }

  // 꼭짓점 정리: 너무 가까운 것 합치고, 거의 일직선인 꼭짓점 제거
  function cleanVertices(V, L) {
    let changed = true;
    V = V.slice();
    while (changed && V.length > 3) {
      changed = false;
      for (let i = 0; i < V.length; i++) {
        const a = V[(i - 1 + V.length) % V.length], b = V[i], c = V[(i + 1) % V.length];
        const ang1 = Math.atan2(b.y - a.y, b.x - a.x), ang2 = Math.atan2(c.y - b.y, c.x - b.x);
        let turn = Math.abs(ang2 - ang1);
        if (turn > Math.PI) turn = 2 * Math.PI - turn;
        if (turn < 24 * DEG || U.dist(a, b) < L * 0.05) {
          V.splice(i, 1); changed = true; break;
        }
      }
    }
    return V;
  }

  function sampleOutline(V, closed, spacing) {
    const out = [];
    const n = V.length, m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const a = V[i], b = V[(i + 1) % n];
      const k = Math.max(1, Math.ceil(U.dist(a, b) / spacing));
      for (let j = 0; j < k; j++) out.push({ x: a.x + (b.x - a.x) * (j / k), y: a.y + (b.y - a.y) * (j / k) });
    }
    out.push(closed ? { x: V[0].x, y: V[0].y } : { x: V[n - 1].x, y: V[n - 1].y });
    if (closed && out.length > 2) out.push({ x: out[1].x, y: out[1].y }); // 이음새가 안 보이게 살짝 겹침
    return out;
  }

  function ellipsePts(cx, cy, rx, ry, rot, spacing, a0 = 0, a1 = Math.PI * 2) {
    const per = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const n = Math.max(24, Math.ceil((per * Math.abs(a1 - a0)) / (Math.PI * 2) / spacing));
    const c = Math.cos(rot), s = Math.sin(rot), out = [];
    for (let i = 0; i <= n; i++) {
      const t = a0 + ((a1 - a0) * i) / n;
      const x = Math.cos(t) * rx, y = Math.sin(t) * ry;
      out.push({ x: cx + x * c - y * s, y: cy + x * s + y * c });
    }
    return out;
  }

  function snapAngle(a, b) {
    const ang = Math.atan2(b.y - a.y, b.x - a.x), L = U.dist(a, b);
    const snapped = Math.round(ang / (45 * DEG)) * 45 * DEG;
    if (Math.abs(snapped - ang) < 5 * DEG) return { x: a.x + Math.cos(snapped) * L, y: a.y + Math.sin(snapped) * L };
    return b;
  }

  function circle3(a, b, c) {
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-6) return null;
    const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
    const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
    const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
    return { x, y, r: Math.hypot(a.x - x, a.y - y) };
  }

  function fitEllipse(R) {
    let mx = 0, my = 0;
    for (const p of R) { mx += p.x; my += p.y; }
    mx /= R.length; my /= R.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of R) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    let rot = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const c = Math.cos(rot), s = Math.sin(rot);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of R) {
      const dx = p.x - mx, dy = p.y - my, u = dx * c + dy * s, v = -dx * s + dy * c;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const rx = (u1 - u0) / 2, ry = (v1 - v0) / 2;
    const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
    const cx = mx + uc * c - vc * s, cy = my + uc * s + vc * c;
    if (rx < 2 || ry < 2) return null;
    let err = 0;
    for (const p of R) {
      const dx = p.x - cx, dy = p.y - cy, u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
      err += Math.abs(Math.hypot(u, v) - 1);
    }
    // 거의 수평/수직이면 반듯하게
    const deg = ((rot / DEG) % 90 + 90) % 90;
    if (deg < 7 || deg > 83) rot = Math.round(rot / (90 * DEG)) * 90 * DEG;
    return { cx, cy, rx, ry, rot, err: err / R.length };
  }

  function makeRect(V) {
    const angs = V.map((p, i) => { const q = V[(i + 1) % 4]; return Math.atan2(q.y - p.y, q.x - p.x); });
    // 직각 검사
    for (let i = 0; i < 4; i++) {
      let t = Math.abs(angs[(i + 1) % 4] - angs[i]) % Math.PI;
      if (Math.abs(t - Math.PI / 2) > 18 * DEG) return null;
    }
    let cx = 0, cy = 0;
    for (const p of V) { cx += p.x; cy += p.y; }
    cx /= 4; cy /= 4;
    // 주 방향: 첫 변 방향(180° 주기)을 평균
    let rot = angs[0];
    const deg = ((rot / DEG) % 90 + 90) % 90;
    if (deg < 8 || deg > 82) rot = Math.round(rot / (90 * DEG)) * 90 * DEG;
    const c = Math.cos(rot), s = Math.sin(rot);
    let hu = 0, hv = 0;
    for (const p of V) {
      const dx = p.x - cx, dy = p.y - cy;
      hu += Math.abs(dx * c + dy * s); hv += Math.abs(-dx * s + dy * c);
    }
    hu /= 4; hv /= 4;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({
      x: cx + a * hu * c - b * hv * s, y: cy + a * hu * s + b * hv * c,
    }));
  }

  /* points: [{x,y,p}] (문서 좌표). 반환: { kind, label, pts } 또는 null */
  function detect(points) {
    if (points.length < 4) return null;
    const L = pathLength(points);
    if (L < 24) return null;
    const R = resample(points, 96);
    const first = R[0], last = R[R.length - 1];
    const de = U.dist(first, last);
    const spacing = 2;
    const closed = de < 0.17 * L;

    if (!closed) {
      let maxDev = 0;
      for (const p of R) maxDev = Math.max(maxDev, segDist(p, first, last));
      if (maxDev < 0.045 * L + 1.5) {
        const end = snapAngle(first, last);
        return { kind: 'line', label: '직선', pts: sampleOutline([first, end], false, spacing) };
      }
      const V = rdp(R, Math.max(3, 0.04 * L));
      const mid = R[R.length >> 1];
      const circ = circle3(first, mid, last);
      if (circ && circ.r < L * 2.5) {
        let err = 0;
        for (const p of R) err += Math.abs(Math.hypot(p.x - circ.x, p.y - circ.y) - circ.r);
        err /= R.length * circ.r;
        if (err < 0.05 && V.length > 3) {
          const a0 = Math.atan2(first.y - circ.y, first.x - circ.x);
          let a1 = Math.atan2(last.y - circ.y, last.x - circ.x);
          const am = Math.atan2(mid.y - circ.y, mid.x - circ.x);
          // 중간점을 지나는 방향으로 돌기
          const norm = (t) => ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          const ccw = norm(am - a0) < norm(a1 - a0);
          a1 = ccw ? a0 + norm(a1 - a0) : a0 - norm(a0 - a1);
          return { kind: 'arc', label: '호', pts: ellipsePts(circ.x, circ.y, circ.r, circ.r, 0, spacing, a0, a1) };
        }
      }
      if (V.length <= 5 && polyError(R, V, false) < 0.02 * L) {
        return { kind: 'polyline', label: '꺾은선', pts: sampleOutline(V, false, spacing) };
      }
      return null;
    }

    // ---- 닫힌 도형 ----
    const el = fitEllipse(R);
    let V = rdp(R, Math.max(3, 0.035 * L));
    if (U.dist(V[0], V[V.length - 1]) < 0.12 * L) V.pop();
    V = cleanVertices(V, L);
    const meanR = el ? (el.rx + el.ry) / 2 : L / (2 * Math.PI);
    const pErr = V.length >= 3 ? polyError(R, V, true) / meanR : Infinity;
    const eErr = el ? el.err : Infinity;

    if (el && eErr < 0.1 && (eErr < pErr * 0.9 || V.length > 6)) {
      if (Math.abs(el.rx - el.ry) / Math.max(el.rx, el.ry) < 0.16) {
        const r = (el.rx + el.ry) / 2;
        return { kind: 'circle', label: '원', pts: ellipsePts(el.cx, el.cy, r, r, 0, spacing, -Math.PI / 2, Math.PI * 1.5 + 0.05) };
      }
      return { kind: 'ellipse', label: '타원', pts: ellipsePts(el.cx, el.cy, el.rx, el.ry, el.rot, spacing, 0, Math.PI * 2 + 0.05) };
    }
    if (V.length >= 3 && V.length <= 12 && pErr < 0.12) {
      if (V.length === 3) return { kind: 'triangle', label: '삼각형', pts: sampleOutline(V, true, spacing) };
      if (V.length === 4) {
        const rect = makeRect(V);
        if (rect) return { kind: 'rect', label: '사각형', pts: sampleOutline(rect, true, spacing) };
        return { kind: 'quad', label: '사각형', pts: sampleOutline(V, true, spacing) };
      }
      return { kind: 'polygon', label: V.length + '각형', pts: sampleOutline(V, true, spacing) };
    }
    return null;
  }

  SK.Shapes = { detect, resample, pathLength };
})();
