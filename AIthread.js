;(() => {
  // ======== 設定ここから ========
  const AI_ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbxfbgiH_UbANgCPusGIW1zsTxhp3WUBe_eqBlsmwMVIBYdUhUjbZNzjEGITaiB4XwJ6jQ/exec';
  const INSERT_MODE = 'append';   // 'replace' or 'append'
  const TRIGGER_KEY = '/';        // "/"でポップアップ
  const CLIENT_TOKEN = 'your-light-token'; // GASと揃える
  const DBG = false;              // trueにするとコンソールにログが出ます
  // ======== 設定ここまで ========

  const log = (...a) => { if (DBG) console.log('[ai-help]', ...a); };

  // スタイル
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
    border: 0; border-radius: 12px; padding: 10px 12px;
    cursor: pointer; color: #fff; font-weight: 700;
    background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 45%, #2563eb 70%, #1d4ed8 100%);
    box-shadow: 0 8px 20px rgba(37,99,235,.25);
    transition: transform .08s ease, filter .2s ease, box-shadow .2s ease;
    position: relative; overflow: hidden;
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
  .ai-float-btn {
    position:absolute; right:6px; bottom:6px; z-index:9998;
    font-size:12px; padding:4px 6px; border:0; border-radius:8px;
    background:rgba(37,99,235,.12); color:#1d4ed8; cursor:pointer;
  }
  `;
  document.head.appendChild(style);

  // ========== ユーティリティ ==========
  function closeAnyPop() {
    document.querySelectorAll('.ai-help-pop').forEach(el => el.remove());
  }
  function getSelectionText() {
    const sel = window.getSelection?.();
    return sel && sel.rangeCount > 0 ? sel.toString() : '';
  }
  function getEditorText(el) {
    if (el.tagName === 'TEXTAREA') return el.value;
    if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox') return el.innerText;
    return '';
  }
  function setEditorText(el, text) {
    if (el.tagName === 'TEXTAREA') {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.innerText = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  function isAtLineStart(el) {
    if (el.tagName === 'TEXTAREA') {
      const caretPos = el.selectionStart != null ? el.selectionStart : 0;
      const before = el.value.slice(0, caretPos);
      const currentLine = before.split(/\n/).pop() || '';
      return currentLine.trim().length === 0;
    }
    const txt = getEditorText(el);
    return txt.trim().length === 0 || /\s$/.test(txt);
  }

  // ポップアップ生成
  function showPop(anchorEl, insertCb, contextGetter) {
    closeAnyPop();
    const rect = anchorEl.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'ai-help-pop';
    pop.innerHTML = `
      <div class="ai-help-hint">下書き/選択テキストを文脈にAIへ投げます。</div>
      <div class="ai-help-row"><input type="text" placeholder="例：要点を整理して提案文に整えて" /></div>
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
    pop.style.top = (window.scrollY + rect.top + rect.height + 6) + 'px';
    pop.style.left = (window.scrollX + rect.left) + 'px';

    const input = pop.querySelector('input');
    const btn = pop.querySelector('button[data-do="ask"]');
    const toneSel = pop.querySelector('select[data-role="tone"]');

    btn.addEventListener('click', async () => {
      const userAsk = (input.value || '').trim() || '改善提案をください';
      const tone = toneSel.value || '';
      const context = contextGetter();
      const payload = { token: CLIENT_TOKEN, ask: userAsk, context, options: { tone } };
      btn.disabled = true; btn.textContent = 'AIが考えています…';
      try {
        const res = await fetch(AI_ENDPOINT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        const reply = data.reply || data.text || data.choices?.[0]?.message?.content || '';
        if (reply) insertCb(reply);
        closeAnyPop();
      } catch (err) {
        alert('AI呼び出しに失敗: ' + err);
        btn.disabled = false; btn.textContent = 'AIに相談する';
      }
    });
  }

  // 浮遊ボタン
  function addFloatingButton(el) {
    if (el._ai_float_btn) return;
    const btn = document.createElement('button');
    btn.textContent = '✨AI'; btn.className = 'ai-float-btn';
    btn.addEventListener('click', () => {
      showPop(el, (aiText) => {
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
    el.parentElement.style.position = 'relative';
    el.parentElement.appendChild(btn);
    el._ai_float_btn = btn;
  }

  // エディタ検出・アタッチ
  function findEditors() {
    return Array.from(document.querySelectorAll('textarea,[contenteditable="true"],div[role="textbox"]'))
      .filter(el => el.offsetParent !== null && el.clientHeight > 0);
  }
  function attachToEditor(el) {
    if (el._ai_help_wired) return;
    el._ai_help_wired = true;
    log('attach', el);

    // "/" で開く
    el.addEventListener('keydown', (e) => {
      if (e.isComposing) return; // 日本語入力中は無視
      if (e.key === TRIGGER_KEY && isAtLineStart(el)) {
        e.preventDefault();
        showPop(el, (aiText) => {
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
      }
    });

    // Ctrl/Cmd+K でも開ける
    el.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        showPop(el, (aiText) => {
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
      }
    });

    // 浮遊ボタン
    addFloatingButton(el);
  }

  // 監視して常にアタッチ
  const mo = new MutationObserver(() => { findEditors().forEach(attachToEditor); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => { findEditors().forEach(attachToEditor); }, 2000);
  findEditors().forEach(attachToEditor);
})();

console.log("エディタ候補:", findEditors());

