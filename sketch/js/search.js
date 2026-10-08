/* 닮은 이미지 찾기
   1) 브라우저 안에서 CLIP 모델(transformers.js)이 낙서를 보고 무엇인지 추측
   2) 위키미디어 공용(Wikimedia Commons)에서 그 단어로 이미지 검색 (API 키 필요 없음)
   3) 찾은 이미지마다 CLIP 임베딩을 구해 내 그림과 얼마나 닮았는지로 다시 정렬 */
(function () {
  const TF_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
  const MODEL = 'Xenova/clip-vit-base-patch32';
  const U = SK.U;

  let M = null, loading = null;

  function normalize(v) {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * v[i];
    s = Math.sqrt(s) || 1;
    const o = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) o[i] = v[i] / s;
    return o;
  }
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

  async function load(onProgress) {
    if (M) return M;
    if (loading) return loading;
    loading = (async () => {
      const tf = await import(TF_URL);
      tf.env.allowLocalModels = false;
      const files = {};
      const cb = (e) => {
        if (e.status !== 'progress' || !e.total) return;
        files[e.file] = [e.loaded, e.total];
        let l = 0, t = 0;
        for (const k in files) { l += files[k][0]; t += files[k][1]; }
        onProgress && onProgress('download', l / t, t);
      };
      const opts = { progress_callback: cb, dtype: 'q8' };
      const [processor, tokenizer, vision, text] = await Promise.all([
        tf.AutoProcessor.from_pretrained(MODEL),
        tf.AutoTokenizer.from_pretrained(MODEL),
        tf.CLIPVisionModelWithProjection.from_pretrained(MODEL, opts),
        tf.CLIPTextModelWithProjection.from_pretrained(MODEL, opts),
      ]);
      const m = { tf, processor, tokenizer, vision, text };

      // 단어장 임베딩 (문장 두 가지를 평균)
      const L = SK.LABELS, templates = ['a drawing of a {}', 'a simple sketch of a {}'];
      const prompts = [];
      for (const l of L) for (const t of templates) prompts.push(t.replace('{}', l.en));
      const all = [];
      const CH = 60;
      for (let i = 0; i < prompts.length; i += CH) {
        all.push(...(await embedTexts(m, prompts.slice(i, i + CH))));
        onProgress && onProgress('prepare', Math.min(1, (i + CH) / prompts.length));
      }
      m.labelEmb = L.map((_, i) => {
        const a = all[i * 2], b = all[i * 2 + 1], v = new Float32Array(a.length);
        for (let k = 0; k < a.length; k++) v[k] = a[k] + b[k];
        return normalize(v);
      });
      M = m;
      return m;
    })();
    try { return await loading; } catch (e) { loading = null; throw e; }
  }

  async function embedTexts(m, texts) {
    const inputs = m.tokenizer(texts, { padding: true, truncation: true });
    const { text_embeds } = await m.text(inputs);
    const D = text_embeds.dims[1], data = text_embeds.data, out = [];
    for (let i = 0; i < texts.length; i++) out.push(normalize(data.subarray(i * D, (i + 1) * D)));
    return out;
  }

  async function embedRaw(m, raw) {
    const inputs = await m.processor(raw.rgb());
    const { image_embeds } = await m.vision(inputs);
    return normalize(image_embeds.data);
  }

  async function embedCanvas(m, canvas) {
    const g = canvas.getContext('2d');
    const d = g.getImageData(0, 0, canvas.width, canvas.height);
    return embedRaw(m, new m.tf.RawImage(new Uint8ClampedArray(d.data), canvas.width, canvas.height, 4));
  }

  function classify(m, emb, k = 6) {
    const sims = m.labelEmb.map((v) => dot(v, emb) * 100);
    const mx = Math.max(...sims);
    const ex = sims.map((s) => Math.exp(s - mx));
    const sum = ex.reduce((a, b) => a + b, 0);
    return ex.map((e, i) => ({ ...SK.LABELS[i], prob: e / sum }))
      .sort((a, b) => b.prob - a.prob).slice(0, k);
  }

  async function searchCommons(query, limit = 24) {
    const params = new URLSearchParams({
      action: 'query', format: 'json', origin: '*',
      generator: 'search', gsrsearch: query + ' filetype:bitmap', gsrnamespace: '6', gsrlimit: String(limit),
      prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '330',
      iiextmetadatafilter: 'LicenseShortName|Artist|ObjectName',
    });
    const res = await fetch('https://commons.wikimedia.org/w/api.php?' + params);
    if (!res.ok) throw new Error('검색 서버 응답 ' + res.status);
    const json = await res.json();
    const pages = Object.values((json.query && json.query.pages) || {});
    pages.sort((a, b) => (a.index || 0) - (b.index || 0));
    const strip = (h) => (h || '').replace(/<[^>]+>/g, '').trim();
    return pages.filter((p) => p.imageinfo && p.imageinfo[0].thumburl).map((p) => {
      const ii = p.imageinfo[0], md = ii.extmetadata || {};
      const big = ii.width > 1280 ? ii.thumburl.replace(/\/\d+px-/, '/1280px-') : ii.url;
      return {
        title: strip(md.ObjectName && md.ObjectName.value) || p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, ''),
        thumb: ii.thumburl, full: big, page: ii.descriptionurl,
        license: strip(md.LicenseShortName && md.LicenseShortName.value),
        artist: strip(md.Artist && md.Artist.value),
        score: null,
      };
    });
  }

  // ---------------------------------------------------------------- UI
  function initUI(app) {
    const $ = (id) => document.getElementById(id);
    const drawer = $('searchDrawer'), status = $('searchStatus'), prog = $('searchProgress'), progFill = $('searchProgressFill');
    const guesses = $('guesses'), results = $('results'), extLinks = $('extLinks'), thumb = $('sketchThumb');
    const qForm = $('queryForm'), qInput = $('queryInput'), btnAnalyze = $('btnAnalyze');
    let sketchEmb = null, runId = 0, modalItem = null, lastItems = [];

    const setStatus = (t) => { status.textContent = t; };
    const setProgress = (f) => {
      if (f == null) { prog.hidden = true; return; }
      prog.hidden = false; progFill.style.width = Math.round(f * 100) + '%';
    };

    function open() {
      drawer.hidden = false;
      const sk = app.sketchSnapshot(224);
      const g = thumb.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, thumb.width, thumb.height);
      if (sk) g.drawImage(sk, 0, 0, thumb.width, thumb.height);
      btnAnalyze.textContent = sketchEmb ? '다시 알아보기' : '내 그림 알아보기';
    }
    function close() { drawer.hidden = true; }

    function renderExt(q) {
      const e = encodeURIComponent(q);
      extLinks.innerHTML = '';
      const links = [
        ['Google 이미지', `https://www.google.com/search?tbm=isch&q=${e}`],
        ['Unsplash', `https://unsplash.com/s/photos/${e}`],
        ['Pinterest', `https://www.pinterest.com/search/pins/?q=${e}`],
      ];
      const lab = document.createElement('span');
      lab.textContent = '다른 곳에서:';
      lab.style.color = 'var(--ink-2)';
      extLinks.append(lab);
      for (const [t, u] of links) {
        const a = document.createElement('a');
        a.href = u; a.target = '_blank'; a.rel = 'noopener'; a.textContent = t;
        extLinks.append(a);
      }
    }

    function renderResults(items) {
      results.innerHTML = '';
      if (!items.length) {
        const p = document.createElement('p');
        p.className = 'empty-note';
        p.textContent = '찾은 이미지가 없어요. 다른 단어로 찾아보세요.';
        results.append(p);
        return;
      }
      const best = items.reduce((b, it) => (it.score != null && (b == null || it.score > b.score) ? it : b), null);
      items.forEach((it) => {
        const b = document.createElement('button');
        b.className = 'result' + (best === it ? ' best' : '');
        b.title = it.title;
        const img = document.createElement('img');
        img.src = it.thumb; img.alt = it.title; img.loading = 'lazy';
        b.append(img);
        if (it.score != null) {
          const s = document.createElement('span');
          s.className = 'score';
          s.textContent = '닮음 ' + Math.round(U.clamp((it.score - 0.15) / 0.2, 0, 1) * 100);
          b.append(s);
        }
        b.onclick = () => openModal(it);
        results.append(b);
      });
    }

    function renderGuesses(list, active) {
      guesses.innerHTML = '';
      for (const g of list) {
        const b = document.createElement('button');
        b.className = 'guess';
        b.setAttribute('aria-pressed', String(g.en === active));
        b.innerHTML = `<span></span><small>${Math.round(g.prob * 100)}%</small>`;
        b.firstChild.textContent = g.ko;
        b.onclick = () => { renderGuesses(list, g.en); qInput.value = g.en; runSearch(g.en, g.ko); };
        guesses.append(b);
      }
    }

    async function runSearch(query, display) {
      const id = ++runId;
      display = display || query;
      renderExt(query);
      setStatus(`‘${display}’ 이미지를 찾는 중…`);
      setProgress(0.15);
      let items;
      try {
        items = await searchCommons(query);
      } catch (e) {
        if (id !== runId) return;
        setProgress(null);
        setStatus('이미지 검색에 실패했어요. 인터넷 연결을 확인하고 다시 시도해 주세요. (' + e.message + ')');
        return;
      }
      if (id !== runId) return;
      lastItems = items;
      renderResults(items);
      if (!items.length) { setProgress(null); setStatus(`‘${display}’로 찾은 이미지가 없어요.`); return; }
      if (!M || !sketchEmb) {
        setProgress(null);
        setStatus(`‘${display}’ 이미지 ${items.length}개 · 그림을 알아보면 닮은 순서로 정렬돼요.`);
        return;
      }
      setStatus(`내 그림과 비교하는 중… 0/${items.length}`);
      let done = 0;
      const queue = items.slice();
      const worker = async () => {
        while (queue.length) {
          const it = queue.shift();
          try {
            const raw = await M.tf.RawImage.fromURL(it.thumb);
            if (id !== runId) return;
            it.score = dot(await embedRaw(M, raw), sketchEmb);
          } catch (e) { it.score = null; }
          done++;
          if (id !== runId) return;
          setProgress(0.15 + 0.85 * (done / items.length));
          setStatus(`내 그림과 비교하는 중… ${done}/${items.length}`);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (id !== runId) return;
      items.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
      renderResults(items);
      setProgress(null);
      setStatus(`‘${display}’ 이미지 ${items.length}개를 내 그림과 닮은 순서로 놓았어요. 눌러서 배경으로 불러와 덧그릴 수 있어요.`);
    }

    async function analyze() {
      const sk = app.sketchSnapshot(224);
      if (!sk) { setStatus('캔버스에 먼저 무언가를 그려 주세요. 대충 그려도 돼요.'); return; }
      open();
      btnAnalyze.disabled = true;
      const id = ++runId;
      try {
        setStatus('AI 모델을 준비하는 중… (처음 한 번 약 150MB를 받아 브라우저에 저장해요)');
        setProgress(0.02);
        const m = await load((phase, f, total) => {
          if (phase === 'download') {
            setProgress(f * 0.8);
            setStatus(`AI 모델 받는 중 ${Math.round(f * 100)}% · ${(total / 1048576).toFixed(0)}MB (처음 한 번만)`);
          } else {
            setProgress(0.8 + f * 0.2);
            setStatus('단어장을 익히는 중…');
          }
        });
        setStatus('그림을 들여다보는 중…');
        sketchEmb = await embedCanvas(m, sk);
        if (id !== runId) return;
        const top = classify(m, sketchEmb);
        renderGuesses(top, top[0].en);
        qInput.value = top[0].en;
        await runSearch(top[0].en, top[0].ko);
      } catch (e) {
        console.error(e);
        setProgress(null);
        setStatus('AI 모델을 불러오지 못했어요. 인터넷 연결을 확인해 주세요. 아래에 검색어를 직접 넣으면 이미지는 찾을 수 있어요.');
      } finally {
        btnAnalyze.disabled = false;
        btnAnalyze.textContent = '다시 알아보기';
      }
    }

    function openModal(it) {
      modalItem = it;
      $('modalImg').src = it.thumb;
      $('modalImg').alt = it.title;
      $('modalCap').textContent = [it.title, it.artist && '© ' + it.artist, it.license, 'Wikimedia Commons'].filter(Boolean).join(' · ');
      $('modalSource').href = it.page;
      $('resultModal').hidden = false;
    }
    const closeModal = () => { $('resultModal').hidden = true; };

    $('modalClose').onclick = closeModal;
    $('resultModal').addEventListener('click', (e) => { if (e.target.id === 'resultModal') closeModal(); });
    $('modalUse').onclick = async () => {
      if (!modalItem) return;
      const it = modalItem;
      closeModal();
      try {
        await app.loadBackgroundFromURL(it.full);
        app.toast('불러왔어요. 비침을 낮추면 따라 그리기 좋아요.');
      } catch (e) {
        app.toast('이미지를 불러오지 못했어요.');
      }
    };

    qForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let q = qInput.value.trim();
      if (!q) return;
      const hit = SK.LABELS.find((l) => l.ko === q);
      const display = q;
      if (hit) q = hit.en;
      guesses.querySelectorAll('.guess').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      runSearch(q, display);
    });
    btnAnalyze.onclick = analyze;
    $('searchClose').onclick = close;

    return { open, close, analyze, get isOpen() { return !drawer.hidden; } };
  }

  SK.Search = { initUI, load, searchCommons, classify };
})();
