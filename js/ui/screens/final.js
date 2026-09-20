/** מסך הסיום: פודיום, טבלת דירוג וסיכום הסיבובים */
import { el, on, esc } from '../dom.js';
import { standings } from '../../game/engine.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export function finalScreen(ctx) {
  const root = el(`
    <div class="stack fade-in">
      <div class="logo"><h1>🏆 סוף<span class="wave"> המשחק</span></h1></div>
      <div class="podium" data-podium></div>
      <div class="card"><h3>טבלת ניקוד</h3><div class="players" data-table></div></div>
      <div class="card"><h3>סיכום הסיבובים</h3><div class="stack" data-history></div></div>
      <div data-actions class="stack"></div>
    </div>`);

  on(root, 'click', '[data-restart]', () => ctx.act('restart'));
  on(root, 'click', '[data-leave]', () => ctx.leave());

  function update(view) {
    const table = standings(view);
    const top = table.slice(0, 3);
    const order = [top[1], top[0], top[2]].filter(Boolean); // כסף במרכז-שמאל, זהב במרכז
    const classes = new Map([[top[0], 'gold'], [top[1], 'silver'], [top[2], 'bronze']]);

    root.querySelector('[data-podium]').innerHTML = order
      .map(
        (p) => `<div class="step ${classes.get(p)}">
            <div class="face">${p.avatar}</div>
            <div class="muted">${esc(p.name)}</div>
            <div class="block"><div class="big-num" style="font-size:1.5rem">${p.score}</div></div>
          </div>`,
      )
      .join('');

    root.querySelector('[data-table]').innerHTML = table
      .map(
        (p) => `<div class="player ${p.id === view.you ? '' : ''}">
            <span>${MEDALS[p.rank - 1] ?? `${p.rank}.`}</span>
            <span style="font-size:1.3rem">${p.avatar}</span>
            <span class="name">${esc(p.name)}${p.id === view.you ? ' (אתם)' : ''}</span>
            <span class="score">${p.score}</span>
          </div>`,
      )
      .join('');

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
         <button class="btn-ghost btn-block btn-small" data-leave>סיום ויציאה</button>`
      : `<p class="center muted">המארח יכול להתחיל משחק חדש</p>
         <button class="btn-ghost btn-block btn-small" data-leave>יציאה</button>`;
  }

  return { el: root, update };
}
