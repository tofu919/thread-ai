;(() => {
  // ======== 設定ここから ========
  // GAS WebアプリURLに差し替え
  const AI_ENDPOINT_URL = 'https://script.google.com/macros/s/XXXX/exec';
  // 'replace' = 下書きを置換 / 'append' = 末尾追記
  const INSERT_MODE = 'append';
  // 空行で "/" を押すとポップ出す（Notion風）
  const TRIGGER_KEY = '/';
  // GAS側で照合する簡易トークン（※プリフライトを避けるため、ヘッダではなくボディに載せる）
  const CLIENT_TOKEN = 'your-light-token';
  // ======== 設定ここまで ========

  // スタイル注入（青グラデ＋光沢）
  const style = document.createElement('style');
  style.textContent = `
  .ai-help-pop {
    position: absolute; z-index: 9999; border: 1px solid #e5e7eb; border-radius: 10px;
    background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.08); padding: 10px; min-width: 280px;
    font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial;
  }
  .ai-help-hint { font-size:12px; color:#6b7280; margin:4px 2px 8px; }
  .ai-help-row { display:flex; gap:8px; }
  .ai-help-row input[type="text"] {
    flex:1; border:1px solid #e5e7eb; border-radius:8px; padding:10px;
  }
  .ai-help-actions { display:flex; gap:8px; margin-top:8px; align-items:center; }
  .ai-help-pop select {
    border:1px solid #e5e7eb; border-radius:8px; padding:8px; font-size:12px;
    background:#fff;
  }
  .ai-help-pop button {
    width: 100%;
    border: 0;
    border-radius: 12px;
    padding: 10px 12px;
    cursor: pointer;
    color: #fff;
    font-weight: 700;
    background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 45%, #2563eb 70%, #1d4ed8 100%);
    box-shadow: 0 8px 20px rgba(37,99,235,.25);
    transition: transform .08s ease, filter .2s ease, box-shadow .2s ease;
    position: relative;
    overflow: hidden;
  }
  .ai-help-pop button::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(to bottom, rgba(255,255,255,.22), rgba(255,255,255,0) 40%);
    pointer-events: none;
  }
  .ai-help-pop button:hover {
    filter: brightness(1.05); transform: translateY(-1px);
    box-shadow: 0 10px 24px rgba(37,99,235,.32);
  }
  .ai-help-pop button:active { transform: translateY(0); filter: brightness(0.98); }
  .ai-help-pop button:disabled { opacity: .7; cursor: default; box-shadow: none; }
  `;
  document.head.appendChild(style);

  function showPop(anchorEl, insertCb, contextGetter) {
    closeAnyPop();
    const rect = anchorEl.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'ai-help-pop';
    pop.innerHTML = `
      <div class="ai-help-hint">下書き/選択テキストを文脈にAIへ投げます。</div>
      <div class="ai-help-row">
        <input type="text" placeholder="例：要点を整理して提案文に整えて" />
      </div>
      <div class="ai-help-actions">
        <select data-role="tone">
          <option value="">トーン</option>
          <option value="丁寧で簡潔">丁寧で簡潔</option>
          <option value="カジュアル">カジュアル</option>
          <option value="結論先出し">結論先出し</option>
        </select>
        <button data-do="ask" style="flex:1;">AIに相談する</button>
      </div>
    `;
    document.body.appendChild(pop);

    // 位置
    const top = window.scrollY + rect.top + rect.height + 6;
    const left = Math.min(window.scrollX + rect.left, window.scrollX + window.innerWidth - pop.offsetWidth - 16);
    pop.style.top = `${top}px`; pop.style.left = `${left}px`;

    const input = pop.querySelector('input');
    const btn = pop.querySelector('button[data-do="ask"]');
    const toneSel = pop.querySelector('select[data-role="tone"]');

    function finish() { closeAnyPop(); }

    btn.addEventListener('click', async () => {
      const userAsk = (input.value || '').trim() || '改善提案をください';
      const tone = toneSel.value || '';
      const context = contextGetter();
      const payload = {
        token: CLIENT_TOKEN, // ← ヘッダではなくボディ
        ask: userAsk,
        context,
        options: { tone }
      };
      btn.disabled = true; const prev = btn.textContent;
      btn.textContent = 'AIが考えています…';
      try {
        const res = await fetch(AI_ENDPOINT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }, // ← カスタムヘッダは付けない（プリフライト回避）
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const reply = data.reply || data.text || data.choices?.[0]?.message?.content || '';
        if (reply) insertCb(reply);
        finish();
      } catch (err) {
        console.error(err);
        alert('AI呼び出しに失敗しました。エンドポイント設定を確認してください。');
        btn.disabled = false; btn.textContent = prev;
      }
    });

    const onDocClick = (e) => {
      if (!pop.contains(e.target) && e.target !== anchorEl) {
        finish();
        document.removeEventListener('mousedown', onDocClick, true);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
  }

  function closeAnyPop() {
    document.querySelectorAll('.ai-help-pop').forEach(el => el.remove());
  }

  function findEditors() {
    const tas = Array.from(document.querySelectorAll('textarea'))
      .filter(el => el.offsetParent !== null && el.clientHeight > 0);
    const edits = Array.from(document.querySelectorAll('[contenteditable="true"]'))
      .filter(el => el.offsetParent !== null && el.clientHeight > 0);
    return [...tas, ...edits];
  }

  function getSelectionText() {
    const sel = window.getSelection?.();
    return sel && sel.rangeCount > 0 ? sel.toString() : '';
  }

  function attachToEditor(el) {
    if (el._ai_help_wired) return;
    el._ai_help_wired = true;

    el.addEventListener('keydown', (e) => {
      if (e.key !== TRIGGER_KEY) return;
      try {
        const value = el.value ?? el.innerText ?? '';
        const caretPos = el.selectionStart != null ? el.selectionStart : value.length;
        const before = value.slice(0, caretPos);
        const currentLine = before.split(/\n/).pop() || '';
        if (currentLine.trim().length !== 0) return; // 行頭のみ
      } catch {}

      e.preventDefault();
      showPop(el, (aiText) => {
        if (!aiText) return;
        const draft = getEditorText(el);
        const merged = (INSERT_MODE === 'replace')
          ? aiText
          : (draft ? (draft.replace(/[ \t]*$/, '') + '\n\n' + aiText) : aiText);
        setEditorText(el, merged);
      }, () => ({
        draft: getEditorText(el),
        selection: getSelectionText(),
        title: document.title,
        url: location.href,
        surface: 'kintone-space-thread'
      }));
    });
  }

  function getEditorText(el) {
    if (el.tagName === 'TEXTAREA') return el.value;
    if (el.getAttribute('contenteditable') === 'true') return el.innerText;
    return '';
  }
  function setEditorText(el, text) {
    if (el.tagName === 'TEXTAREA') {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (el.getAttribute('contenteditable') === 'true') {
      el.innerText = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  const mo = new MutationObserver(() => { findEditors().forEach(attachToEditor); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  findEditors().forEach(attachToEditor);
})();
