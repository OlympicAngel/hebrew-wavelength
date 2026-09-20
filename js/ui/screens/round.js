/**
 * מסך הסיבוב - משרת את שלושת השלבים (רמז / ניחוש / חשיפה)
 * כדי שהחוגה תישאר אותו רכיב ולא "תקפוץ" בין מעברים.
 */
import { el, on, esc, vibrate } from '../dom.js';
import { Dial } from '../dial.js';
import { maxSwaps } from '../../game/engine.js';
import { PACKS } from '../../data/packs.js';

const packById = Object.fromEntries(PACKS.map((p) => [p.id, p]));
const MOVE_THROTTLE_MS = 70; // תדירות שידור תזוזת המחט החיה למארח - מספיק חלק, לא מציף את הרשת
const BOMB_WINDOW_RATIO = 0.2; // חייב להתאים ל-BOMB_WINDOW_RATIO ב-engine.js

export function roundScreen(ctx) {
  let myGuess = 50;
  let locked = false;
  let lastRound = 0;
  let tick = null;
  let lastMoveSent = 0;
  let lastVibrateValue = null;
  let lastBombAt = 0; // חותמת האירוע האחרון שכבר הוצג - game.lastBomb מתאפס לכל משחק חדש (ראו session.js)

  const dial = new Dial({
    interactive: false,
    onChange: (v) => {
      myGuess = v;
      // דיווח חי למארח (רק בזמן ניחוש בפועל, לפני נעילה) + משוב רטט קטן על כל "קליק" בסולם
      if (currentView?.phase === 'guess' && !locked && currentView.you !== currentView.psychicId) {
        const now = Date.now();
        if (now - lastMoveSent > MOVE_THROTTLE_MS) {
          lastMoveSent = now;
          ctx.act('guessMove', { value: v });
        }
      }
      if (lastVibrateValue == null || Math.abs(v - lastVibrateValue) >= 2) {
        lastVibrateValue = v;
        vibrate(4);
      }
    },
  });

  const root = el(`
    <div class="stack fade-in">
      <div class="topbar">
        <span class="pill" data-round></span>
        <span class="pill" data-category></span>
        <span class="pill" data-timer hidden></span>
        <span class="pill" data-score></span>
      </div>

      <div class="clue-banner" data-clue hidden>
        <div class="who" data-clue-who></div>
        <div class="text" data-clue-text></div>
      </div>

      <div data-bomb-slot></div>

      <div data-dial-slot></div>
      <div class="spectrum"><span data-low></span><span data-high></span></div>

      <div class="card" data-controls></div>
      <div class="card" data-people></div>
    </div>`);

  root.querySelector('[data-dial-slot]').append(dial.el);

  /* ------------------------------------------------------------- פעולות */

  on(root, 'click', '[data-swap]', () => ctx.act('swap'));
  on(root, 'click', '[data-send-clue]', () => {
    const input = root.querySelector('[data-clue-input]');
    if (input.value.trim()) ctx.act('clue', { clue: input.value });
  });
  on(root, 'click', '[data-lock]', () => {
    locked = true;
    dial.setInteractive(false);
    ctx.act('guess', { value: myGuess });
    render(currentView);
  });
  on(root, 'click', '[data-next]', () => ctx.act('next'));
  on(root, 'click', '[data-bomb-btn]', () => ctx.act('bomb'));

  /* ------------------------------------------------------------- תצוגה */

  let currentView = null;

  /**
   * @returns {string} פאנל החבלה - מוצג למנחשים בשלב הרמז, במצב תחרותי עם טיימר רמז מוגדר (לא לנותן הרמז).
   * אם כבר נוצלה חבלה הסיבוב הזה - תצוגה ממוזערת בלבד; אם החלון נסגר בלי שנוצלה - לא מוצג כלום (ראו paintBomb).
   */
  function bombHtml(view) {
    if (view.mode !== 'competitive' || !view.config.clueSeconds || view.phase !== 'clue') return '';
    if (view.you === view.psychicId) return '';
    const me = view.players.find((p) => p.id === view.you);
    if (!me) return '';

    if (view.bombUsedRound || me.bombUsed) {
      const text = me.bombUsed ? 'ניצלתם את החבלה שלכם למשחק הזה 💤' : 'חבלה כבר נוצלה בסיבוב הזה 💣';
      return `<p class="bomb-mini muted center">${text}</p>`;
    }

    return `<div class="bomb-panel" data-bomb>
        <div class="bomb-row">
          <span class="bomb-label">💣 חבלה: מחליפים את הכרטיס לכולם, ומחזירים 10% מזמן הרמז</span>
          <button class="bomb-btn armed" data-bomb-btn>💣</button>
        </div>
        <div class="bomb-window"><div class="bomb-window-fill" data-bomb-fill></div></div>
        <p class="muted center" data-bomb-status style="font-size:.78rem"></p>
      </div>`;
  }

  /**
   * מעדכן כל טיק את מד החלון של החבלה (זמין רק ב-20% הראשונים של זמן הרמז).
   * ברגע שהחלון נסגר בלי שנוצלה חבלה, מסתירים את הפאנל לגמרי כדי לא להשאיר רכיב מת על המסך.
   */
  function paintBomb(view) {
    const panel = root.querySelector('[data-bomb]');
    if (!panel || !view.deadline) return;
    const totalMs = view.config.clueSeconds * 1000;
    const windowMs = totalMs * BOMB_WINDOW_RATIO;
    const elapsed = totalMs - (view.deadline - Date.now());
    const left = Math.max(0, windowMs - elapsed);

    if (left <= 0) {
      root.querySelector('[data-bomb-slot]').innerHTML = '';
      return;
    }
    panel.querySelector('[data-bomb-fill]').style.width = `${(left / windowMs) * 100}%`;
    panel.querySelector('[data-bomb-status]').textContent = `נותרו ${Math.ceil(left / 1000)} שנ' לחבל`;
  }

  /** אפקט "פיצוץ" למסך כולו - רטט, רעידה ודגל אדום, כשמישהו מפעיל חבלה */
  function bombBlast(message) {
    const app = document.getElementById('app');
    app.classList.add('shake');
    setTimeout(() => app.classList.remove('shake'), 500);
    // הרקע דועך מהר, אבל הטקסט נשאר קריא כמה שניות; העוטף כולו קליק-דרך כדי לא לחסום את המשך המשחק
    const overlay = el(`<div class="bomb-flash-overlay"><div class="bomb-flash-bg"></div><div class="bomb-banner">💥 ${esc(message)}</div></div>`);
    document.body.append(overlay);
    vibrate([40, 60, 120]);
    setTimeout(() => overlay.remove(), 3200);
  }

  /** @returns {string} HTML של אזור הכפתורים, לפי השלב והתפקיד */
  function controlsHtml(view, isPsychic) {
    const swapsLeft = maxSwaps(view.config) - (view.players.find((p) => p.id === view.you)?.swapsUsed ?? 0);

    if (view.phase === 'clue') {
      if (!isPsychic) return `<p class="center">✍️ ${esc(psychicName(view))} חושב/ת על רמז...</p>`;
      return `<p class="muted">רק אתם רואים את הטריז. תנו רמז שיכוון את כולם בדיוק לשם.</p>
        <input type="text" maxlength="60" placeholder="הרמז שלכם" data-clue-input />
        <div class="row">
          <button class="btn-primary grow" data-send-clue>שלחו את הרמז</button>
          <button class="btn-ghost" data-swap ${swapsLeft <= 0 ? 'disabled' : ''}>🔄 החלפה (${swapsLeft})</button>
        </div>`;
    }

    if (view.phase === 'guess') {
      if (isPsychic) return `<p class="center">⏳ ממתינים לניחושים...</p>`;
      return locked
        ? `<p class="center">✅ הניחוש ננעל. ממתינים לשאר.</p>`
        : `<button class="btn-primary btn-block" data-lock>נעלו את הניחוש 🔒</button>`;
    }

    // חשיפה
    const last = view.history[view.history.length - 1];
    const rows = last.results
      .map((r) => {
        const p = view.players.find((x) => x.id === r.playerId);
        return `<div class="result-row">
            <span class="points p${r.points}">${r.points}</span>
            <span style="font-size:1.3rem">${p?.avatar ?? '❔'}</span>
            <span class="name">${esc(p?.name ?? '')}</span>
            <span class="muted" style="margin-inline-start:auto">${r.guess == null ? 'לא ניחש' : `סטייה ${Math.abs(r.guess - last.target)}`}</span>
          </div>`;
      })
      .join('');
    const psychic = view.players.find((p) => p.id === last.psychicId);
    return `<h3>תוצאות הסיבוב</h3>
      <div class="result-row">
        <span class="points p${last.psychicPoints}">${last.psychicPoints}</span>
        <span style="font-size:1.3rem">${psychic?.avatar ?? '❔'}</span>
        <span class="name">${esc(psychic?.name ?? '')}</span>
        <span class="badge psychic" style="margin-inline-start:auto">הרמז</span>
      </div>
      ${rows}
      ${ctx.session.isHost
        ? `<button class="btn-primary btn-block" data-next>${view.round >= view.config.rounds ? 'לתוצאות הסופיות 🏆' : 'לסיבוב הבא ←'}</button>`
        : '<p class="center muted">ממתינים שהמארח ימשיך...</p>'}`;
  }

  const psychicName = (view) => view.players.find((p) => p.id === view.psychicId)?.name ?? '';
  const RANK_MEDALS = ['🥇', '🥈', '🥉'];

  /** שורת השחקנים בתחתית - מי הרמז ומי כבר נעל ניחוש (מצב משותף, בלי ניקוד אישי) */
  function peopleHtml(view) {
    return `<div class="players">${view.players
      .map((p) => {
        const isPsychic = p.id === view.psychicId;
        const ready = view.guesses[p.id] != null;
        return `<div class="player ${p.connected ? '' : 'off'}">
            <span style="font-size:1.25rem">${p.avatar}</span>
            <span class="name">${esc(p.name)}</span>
            ${isPsychic ? '<span class="badge psychic">הרמז</span>' : ready ? '<span class="badge ready">מוכן</span>' : ''}
          </div>`;
      })
      .join('')}</div>`;
  }

  /** דירוג חי עם פס ניקוד יחסי לכל שחקן - מצב תחרותי, כדי שהמתח יורגש כבר באמצע המשחק */
  function leaderboardHtml(view) {
    const sorted = [...view.players].sort((a, b) => b.score - a.score);
    const maxScore = Math.max(1, ...sorted.map((p) => p.score));
    return `<h3>🏆 דירוג חי</h3>
      <div class="mini-board">${sorted
        .map((p, i) => {
          const isPsychic = p.id === view.psychicId;
          const ready = view.guesses[p.id] != null;
          return `<div class="mini-row ${p.id === view.you ? 'me' : ''} ${p.score > 0 && p.score === sorted[0].score ? 'leading' : ''} ${p.connected ? '' : 'off'}">
              <span class="mini-rank">${RANK_MEDALS[i] ?? i + 1}</span>
              <span class="mini-avatar">${p.avatar}</span>
              <span class="mini-name">${esc(p.name)}${isPsychic ? ' 🎙️' : ready ? ' ✅' : ''}</span>
              <div class="mini-bar"><div class="mini-bar-fill" style="width:${Math.round((p.score / maxScore) * 100)}%"></div></div>
              <span class="mini-score">${p.score}</span>
            </div>`;
        })
        .join('')}</div>`;
  }

  function render(view) {
    currentView = view;
    const isPsychic = view.you === view.psychicId;

    // סיבוב חדש - מאפסים את מצב הניחוש המקומי
    if (view.round !== lastRound) {
      lastRound = view.round;
      locked = false;
      myGuess = 50;
      dial.setValue(50);
    }

    // אירוע חבלה חדש - אפקט "פיצוץ" לכולם
    if (view.lastBomb && view.lastBomb.at > lastBombAt) {
      lastBombAt = view.lastBomb.at;
      const who = view.players.find((p) => p.id === view.lastBomb.playerId);
      bombBlast(`${who?.name ?? 'שחקן'} חיבל/ה בכרטיס!`);
    }

    root.querySelector('[data-bomb-slot]').innerHTML = bombHtml(view);
    root.querySelector('[data-round]').textContent = `סיבוב ${view.round}/${view.config.rounds}`;
    const pack = packById[view.card?.packId];
    root.querySelector('[data-category]').textContent = pack ? `${pack.emoji} ${pack.name}` : '';
    root.querySelector('[data-score]').textContent =
      view.mode === 'shared' ? `🤝 ${view.teamScore}` : `⭐ ${view.players.find((p) => p.id === view.you)?.score ?? 0}`;
    root.querySelector('[data-low]').textContent = view.card?.low ?? '';
    root.querySelector('[data-high]').textContent = view.card?.high ?? '';

    const banner = root.querySelector('[data-clue]');
    banner.hidden = view.phase === 'clue';
    if (!banner.hidden) {
      root.querySelector('[data-clue-who]').textContent = `הרמז של ${psychicName(view)}`;
      root.querySelector('[data-clue-text]').textContent = view.clue;
    }

    dial.setTarget(view.target);
    dial.setInteractive(view.phase === 'guess' && !isPsychic && !locked);

    if (view.phase === 'reveal') {
      dial.setPeers([]);
      const last = view.history[view.history.length - 1];
      dial.setNeedles(
        last.results
          .filter((r) => r.guess != null)
          .map((r) => ({
            value: r.guess,
            avatar: view.players.find((p) => p.id === r.playerId)?.avatar,
            me: r.playerId === view.you,
          })),
      );
    } else {
      dial.setNeedles(isPsychic ? [] : null);
      // תזוזות חיות של שאר המנחשים לפני נעילה: למארח, לנותן הרמז, ובמצב משותף - לכולם
      const isHostView = view.players.find((p) => p.id === view.you)?.isHost;
      const canPeek = isHostView || isPsychic || view.mode === 'shared';
      dial.setPeers(
        canPeek && view.phase === 'guess'
          ? view.players
              .filter((p) => p.connected && p.id !== view.psychicId && p.id !== view.you)
              .map((p) => ({ value: view.guesses[p.id] ?? view.liveGuesses[p.id], avatar: p.avatar }))
              .filter((n) => n.value != null)
          : [],
      );
    }

    root.querySelector('[data-controls]').innerHTML = controlsHtml(view, isPsychic);
    root.querySelector('[data-people]').innerHTML = view.mode === 'shared' ? peopleHtml(view) : leaderboardHtml(view);
    startTimer(view);
  }

  /** ספירה לאחור כשהמארח הפעיל טיימר */
  function startTimer(view) {
    clearInterval(tick);
    const pill = root.querySelector('[data-timer]');
    pill.hidden = !((view.phase === 'guess' || view.phase === 'clue') && view.deadline);
    if (pill.hidden) return;
    const paint = () => {
      const left = Math.max(0, Math.ceil((view.deadline - Date.now()) / 1000));
      pill.textContent = `⏱ ${left}`;
      pill.classList.toggle('warn', left <= 10);
      if (view.phase === 'clue') paintBomb(view);
      if (left <= 0) clearInterval(tick);
    };
    paint();
    tick = setInterval(paint, 250);
  }

  return { el: root, update: render, destroy: () => clearInterval(tick) };
}
