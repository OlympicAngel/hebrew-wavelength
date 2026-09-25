/** הלובי: מי מחובר, איך מזמינים שחקנים, והגדרות המשחק (עריכה חיה למארח, תקציר לשאר) */
import { el, on, esc, toast } from '../dom.js';
import { showQR, scanQR } from '../qr.js';
import { MAX_PLAYERS, maxSwaps, resolveMode } from '../../game/engine.js';
import { PACKS } from '../../data/packs.js';

const TIMERS = [
  { value: 0, label: 'ללא הגבלה' },
  { value: 30, label: '30 שניות' },
  { value: 45, label: '45 שניות' },
  { value: 60, label: 'דקה' },
];

const MODES = [
  { value: 'competitive', emoji: '🏆', name: 'תחרותי', desc: 'ניקוד אישי, פודיום בסוף, וחבלה מסוכנת בכל סיבוב' },
  { value: 'shared', emoji: '🤝', name: 'משותף', desc: 'ניקוד קבוצתי אחד לכולם, עם מד הישג בסוף' },
];

const ROUND_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10];

/** @returns {string} HTML לקבוצת כפתורי טיימר עם מפתח ייחודי (כדי שכמה קבוצות לא יתנגשו) */
function timerPicker(key, label, current) {
  return `<h3>${label}</h3>
    <div class="row wrap" data-timer-group="${key}">
      ${TIMERS.map((t) => `<button class="chip ${t.value === current ? 'on' : ''}" data-timer="${key}:${t.value}">${t.label}</button>`).join('')}
    </div>`;
}

/** @returns {string} פאנל ההגדרות המלא - עריכה חיה למארח, מול רשימת השחקנים שכבר הצטרפו */
function settingsEditorHtml(config, players) {
  const totalTurns = config.rounds * Math.max(1, players.length);
  return `<h3>הגדרות</h3>
    <div>
      <p class="muted">מספר סיבובים (כל שחקן נותן רמז פעם אחת בכל סיבוב)</p>
      <div class="row wrap" data-rounds>
        ${ROUND_OPTIONS.map((n) => `<button class="chip ${n === config.rounds ? 'on' : ''}" data-round="${n}">${n}</button>`).join('')}
      </div>
      <p class="muted">עם ${players.length} שחקנים זה <b>${totalTurns}</b> תורות בסה"כ · עד <b>${maxSwaps(config)}</b> החלפות קלף לשחקן.</p>
    </div>
    ${timerPicker('clue', '⏱️ זמן לחשוב על רמז', config.clueSeconds)}
    ${timerPicker('guess', '⏱️ זמן לניחוש', config.guessSeconds)}
    <div>
      <h3>מצב משחק</h3>
      <div class="stack" data-modes>
        ${MODES.map(
          (m) => `<button class="chip ${m.value === config.mode ? 'on' : ''}" data-mode="${m.value}"
                    style="text-align:start;border-radius:14px;padding:12px 14px">
                    <div>${m.emoji} <b>${m.name}</b></div>
                    <div class="muted" style="font-size:.8rem">${m.desc}</div>
                  </button>`,
        ).join('')}
      </div>
      <p class="muted">עם שני שחקנים בלבד המצב המשותף נכפה אוטומטית.</p>
    </div>
    <div>
      <div class="row between"><h3>חפיסות</h3><button class="btn-ghost btn-small" data-toggle-all>הכל</button></div>
      <div class="row wrap" data-packs>
        ${PACKS.map(
          (p) => `<button class="chip ${config.packIds.includes(p.id) ? 'on' : ''}" data-pack="${p.id}" title="${p.desc}">${p.emoji} ${p.name}
                    <span class="muted">${p.pairs.length}</span></button>`,
        ).join('')}
      </div>
    </div>`;
}

/** @returns {string} תקציר קריא-בלבד להגדרות, למי שאינו המארח */
function settingsSummaryHtml(view, players) {
  const names = view.config.packIds.length === PACKS.length
    ? 'כל החפיסות'
    : PACKS.filter((p) => view.config.packIds.includes(p.id)).map((p) => `${p.emoji} ${p.name}`).join(' · ');
  const effectiveMode = resolveMode(view.config, players);
  const modeNote =
    effectiveMode === 'shared'
      ? players.length === 2
        ? '🤝 מצב משותף (נכפה עם 2 שחקנים)'
        : '🤝 מצב משותף'
      : '🏆 מצב תחרותי (עם חבלה!)';
  const totalTurns = view.config.rounds * Math.max(1, players.length);
  return `<h3>הגדרות</h3>
    <p class="muted">${view.config.rounds} סיבובים (${totalTurns} תורות) · עד ${maxSwaps(view.config)} החלפות קלף לשחקן</p>
    <p class="muted">${view.config.clueSeconds ? `${view.config.clueSeconds} שנ' לרמז` : 'בלי טיימר לרמז'} ·
      ${view.config.guessSeconds ? `${view.config.guessSeconds} שנ' לניחוש` : 'בלי טיימר לניחוש'}</p>
    <p class="muted">${modeNote}</p>
    <p class="muted">${esc(names)}</p>`;
}

export function lobbyScreen(ctx) {
  const isHost = ctx.session.isHost;
  const kind = ctx.session.transport.kind;
  let scanner = null;
  let latestView = null;

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

  /* ------------------------------------------------- עריכת הגדרות חיה (מארח בלבד) */

  on(root, 'click', '[data-round]', (_, btn) => ctx.act('config', { config: { rounds: +btn.dataset.round } }));

  on(root, 'click', '[data-timer]', (_, btn) => {
    const [key, value] = btn.dataset.timer.split(':');
    ctx.act('config', { config: { [key === 'clue' ? 'clueSeconds' : 'guessSeconds']: +value } });
  });

  on(root, 'click', '[data-mode]', (_, btn) => ctx.act('config', { config: { mode: btn.dataset.mode } }));

  on(root, 'click', '[data-pack]', (_, btn) => {
    const current = latestView.config.packIds;
    const id = btn.dataset.pack;
    if (current.includes(id) && current.length === 1) return toast('צריך לפחות חפיסה אחת');
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    ctx.act('config', { config: { packIds: next } });
  });

  on(root, 'click', '[data-toggle-all]', () => {
    if (latestView.config.packIds.length === PACKS.length) return;
    ctx.act('config', { config: { packIds: PACKS.map((p) => p.id) } });
  });

  /* --------------------------------------------------------------- עדכון מצב */

  function update(view) {
    latestView = view;
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

    root.querySelector('[data-settings]').innerHTML = isHost
      ? settingsEditorHtml(view.config, players)
      : settingsSummaryHtml(view, players);

    const startBtn = root.querySelector('[data-start]');
    if (startBtn) {
      startBtn.disabled = players.length < 2;
      startBtn.textContent = players.length < 2 ? 'צריך לפחות 2 שחקנים' : 'מתחילים! 🚀';
    }
  }

  return { el: root, update, destroy: () => scanner?.stop() };
}
