/** הלובי: מי מחובר, איך מזמינים שחקנים, ומתי מתחילים */
import { el, on, esc, toast } from '../dom.js';
import { showQR, scanQR } from '../qr.js';
import { MAX_PLAYERS, maxSwaps, resolveMode } from '../../game/engine.js';
import { PACKS } from '../../data/packs.js';

export function lobbyScreen(ctx) {
  const isHost = ctx.session.isHost;
  const kind = ctx.session.transport.kind;
  let scanner = null;

  const root = el(`
    <div class="stack fade-in">
      <div class="topbar">
        <button class="btn-ghost btn-small" data-leave>יציאה</button>
        <span>לובי</span>
      </div>

      <div class="card" data-invite></div>

      <div class="card">
        <div class="row between"><h3>שחקנים</h3><span class="muted" data-count></span></div>
        <div class="players" data-players></div>
      </div>

      <div class="card" data-settings></div>

      ${isHost
        ? `<button class="btn-primary btn-block" data-start disabled>מתחילים!</button>`
        : `<p class="center muted">מחכים שהמארח יתחיל את המשחק...</p>`}
    </div>`);

  /* ----------------------------------------------- אזור ההזמנה לפי סוג חיבור */

  const invite = root.querySelector('[data-invite]');
  if (!isHost) invite.innerHTML = '<p class="center">מחוברים! ממתינים לשאר השחקנים 👋</p>';
  else if (kind === 'code')
    invite.innerHTML = `<h3>קוד החדר</h3>
      <div class="code-box">${esc(ctx.session.code ?? '----')}</div>
      <p class="muted center">השחקנים בוחרים "הצטרפו למשחק" ומקלידים את הקוד</p>`;
  else if (kind === 'local')
    invite.innerHTML = `<h3>מכשיר אחד</h3>
      <p class="muted">פתחו כרטיסייה נוספת באותה כתובת, בחרו "הצטרפו למשחק" ← "מכשיר אחד".</p>`;
  else
    invite.innerHTML = `<h3>הזמנת שחקן</h3>
      <p class="muted">כל שחקן מצטרף בסריקה הדדית: הוא סורק את הקוד שלכם, ואתם סורקים את התשובה שלו.</p>
      <div class="qr-box" data-offer-qr hidden></div>
      <video id="scan-video" playsinline muted hidden></video>
      <button class="btn-primary btn-block" data-invite-btn>הזמינו שחקן 📷</button>`;

  /** סבב הזמנה מלא ברשת מקומית: הצגת הצעה ← סריקת התשובה */
  async function runInvite(btn) {
    const qrBox = root.querySelector('[data-offer-qr]');
    const video = root.querySelector('#scan-video');
    try {
      btn.disabled = true;
      btn.textContent = 'מכין קוד...';
      const { offer, accept } = await ctx.session.invite();
      qrBox.hidden = false;
      await showQR(qrBox, offer);
      btn.textContent = 'סרקו עכשיו את התשובה של השחקן';
      btn.disabled = false;

      await new Promise((resolve) => btn.addEventListener('click', resolve, { once: true }));
      qrBox.hidden = true;
      video.hidden = false;
      btn.disabled = true;
      btn.textContent = 'סורק...';
      scanner = await scanQR(video);
      const answer = await scanner.result;
      video.hidden = true;
      await accept(answer);
      toast('השחקן צורף 🎉');
    } catch (err) {
      toast(err.message || 'ההזמנה נכשלה');
    } finally {
      scanner?.stop();
      scanner = null;
      video.hidden = true;
      btn.disabled = false;
      btn.textContent = 'הזמינו שחקן 📷';
    }
  }

  on(root, 'click', '[data-invite-btn]', (e, btn) => {
    if (btn.dataset.busy) return;
    btn.dataset.busy = '1';
    runInvite(btn).finally(() => delete btn.dataset.busy);
  });

  on(root, 'click', '[data-kick]', (_, btn) => ctx.act('kick', { playerId: btn.dataset.kick }));
  on(root, 'click', '[data-start]', () => ctx.act('start'));
  on(root, 'click', '[data-leave]', () => ctx.leave());

  /* --------------------------------------------------------------- עדכון מצב */

  function update(view) {
    const players = view.players;
    root.querySelector('[data-count]').textContent = `${players.length}/${MAX_PLAYERS}`;
    root.querySelector('[data-players]').innerHTML = players
      .map(
        (p) => `<div class="player">
            <span style="font-size:1.4rem">${p.avatar}</span>
            <span class="name">${esc(p.name)}</span>
            ${p.isHost ? '<span class="badge">מארח</span>' : ''}
            ${p.id === view.you ? '<span class="badge">אתם</span>' : ''}
            ${isHost && !p.isHost ? `<button class="btn-ghost btn-small" style="margin-inline-start:auto" data-kick="${p.id}">הסרה</button>` : ''}
          </div>`,
      )
      .join('');

    const names = view.config.packIds.length === PACKS.length
      ? 'כל החפיסות'
      : PACKS.filter((p) => view.config.packIds.includes(p.id)).map((p) => `${p.emoji} ${p.name}`).join(' · ');
    const effectiveMode = resolveMode(view.config, players);
    const modeNote =
      effectiveMode === 'shared'
        ? players.length === 2
          ? '🤝 מצב משותף (נכפה עם 2 שחקנים)'
          : '🤝 מצב משותף'
        : '🏆 מצב תחרותי';
    root.querySelector('[data-settings]').innerHTML = `<h3>הגדרות</h3>
      <p class="muted">${view.config.rounds} סיבובים · עד ${maxSwaps(view.config)} החלפות קלף לשחקן</p>
      <p class="muted">${view.config.clueSeconds ? `${view.config.clueSeconds} שנ' לרמז` : 'בלי טיימר לרמז'} ·
        ${view.config.guessSeconds ? `${view.config.guessSeconds} שנ' לניחוש` : 'בלי טיימר לניחוש'}</p>
      <p class="muted">${modeNote}</p>
      <p class="muted">${esc(names)}</p>`;

    const startBtn = root.querySelector('[data-start]');
    if (startBtn) {
      startBtn.disabled = players.length < 2;
      startBtn.textContent = players.length < 2 ? 'צריך לפחות 2 שחקנים' : 'מתחילים! 🚀';
    }
  }

  return { el: root, update, destroy: () => scanner?.stop() };
}
