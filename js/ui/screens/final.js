/** מסך הסיום: פודיום/מד קבוצתי (לפי המצב), וסיכום התורות */
import { el, on, esc } from '../dom.js';
import { standings, teamGauge } from '../../game/engine.js';
import { openInviteModal } from '../invite.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export function finalScreen(ctx) {
  const root = el(`
    <div class="stack fade-in">
      <div class="logo"><h1>🏆 סוף<span class="wave"> המשחק</span></h1></div>
      <div data-scoreboard></div>
      <div class="card"><h3>סיכום התורות</h3><div class="stack" data-history></div></div>
      <div data-actions class="stack"></div>
    </div>`);

  on(root, 'click', '[data-restart]', () => ctx.act('restart'));
  on(root, 'click', '[data-leave]', () => ctx.leave());
  on(root, 'click', '[data-invite]', () => openInviteModal(ctx));

  function update(view) {
    root.querySelector('[data-scoreboard]').innerHTML = view.mode === 'shared' ? sharedHtml(view) : competitiveHtml(view);
    root.querySelector('[data-history]').innerHTML = view.history
      .map((h) => {
        const psychic = view.players.find((p) => p.id === h.psychicId);
        const best = Math.max(0, ...h.results.map((r) => r.points));
        return `<div class="result-row">
            <span class="points p${best}">${best}</span>
            <div>
              <div><b>${esc(h.clue)}</b> <span class="muted">· ${psychic?.avatar ?? ''} ${esc(psychic?.name ?? '')}</span></div>
              <div class="muted">${esc(h.card?.low ?? '')} ↔ ${esc(h.card?.high ?? '')}</div>
            </div>
          </div>`;
      })
      .join('');

    root.querySelector('[data-actions]').innerHTML = ctx.session.isHost
      ? `<button class="btn-primary btn-block" data-restart>עוד סיבוב! 🔁</button>
         <button class="btn-ghost btn-block btn-small" data-invite>➕ הוסיפו/חברו שחקן</button>
         <button class="btn-ghost btn-block btn-small" data-leave>סיום ויציאה</button>`
      : `<p class="center muted">המארח יכול להתחיל משחק חדש</p>
         <button class="btn-ghost btn-block btn-small" data-leave>יציאה</button>`;
  }

  return { el: root, update };
}

/** @returns {string} פודיום + טבלת ניקוד אישית - למצב תחרותי */
function competitiveHtml(view) {
  const table = standings(view);
  const top = table.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean); // כסף במרכז-שמאל, זהב במרכז
  const classes = new Map([[top[0], 'gold'], [top[1], 'silver'], [top[2], 'bronze']]);

  const podium = order
    .map(
      (p) => `<div class="step ${classes.get(p)}">
          <div class="face">${p.avatar}</div>
          <div class="muted">${esc(p.name)}</div>
          <div class="block"><div class="big-num" style="font-size:1.5rem">${p.score}</div></div>
        </div>`,
    )
    .join('');

  const rows = table
    .map(
      (p) => `<div class="player">
          <span>${MEDALS[p.rank - 1] ?? `${p.rank}.`}</span>
          <span style="font-size:1.3rem">${p.avatar}</span>
          <span class="name">${esc(p.name)}${p.id === view.you ? ' (אתם)' : ''}</span>
          ${p.bombUsed === false ? '<span class="badge" title="לא ניצל/ה את החבלה">🛡️ +1</span>' : ''}
          <span class="score">${p.score}</span>
        </div>`,
    )
    .join('');

  return `<div class="podium" data-podium>${podium}</div>
    <div class="card"><h3>טבלת ניקוד</h3><div class="players" data-table>${rows}</div></div>`;
}

/** @returns {string} מד ההישג הקבוצתי (חלש/נחמד/מעולה/אגדי) - למצב משותף */
function sharedHtml(view) {
  const gauge = teamGauge(view);
  return `<div class="card center">
      <h3>הישג הקבוצה</h3>
      <div style="font-size:4rem;line-height:1">${gauge.emoji}</div>
      <div class="big-num">${gauge.label}</div>
      <div class="gauge-bar" dir="ltr"><div class="gauge-fill gauge-${gauge.key}" style="width:${Math.round(gauge.ratio * 100)}%"></div></div>
      <div class="row between muted" dir="ltr" style="font-size:.78rem"><span>חלש</span><span>נחמד</span><span>מעולה</span><span>אגדי</span></div>
      <p class="muted">ניקוד קבוצתי: ${view.teamScore} נקודות ב-${view.history.length} תורות</p>
    </div>`;
}
