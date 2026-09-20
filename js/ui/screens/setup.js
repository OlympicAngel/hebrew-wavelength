/** הגדרות המשחק אצל המארח: סוג החיבור, מספר סיבובים, טיימר וחפיסות */
import { el, on, toast } from '../dom.js';
import { PACKS } from '../../data/packs.js';
import { TRANSPORTS } from '../../net/transports.js';
import { DEFAULT_CONFIG, MAX_PLAYERS } from '../../game/engine.js';

const TIMERS = [
  { value: 0, label: 'ללא הגבלה' },
  { value: 30, label: '30 שניות' },
  { value: 45, label: '45 שניות' },
  { value: 60, label: 'דקה' },
];

const MODES = [
  { value: 'competitive', emoji: '🏆', name: 'תחרותי', desc: 'ניקוד אישי, טבלת דירוג ופודיום בסוף' },
  { value: 'shared', emoji: '🤝', name: 'משותף', desc: 'ניקוד קבוצתי אחד לכולם, עם מד הישג בסוף' },
];

/** @returns {string} HTML לקבוצת כפתורי טיימר עם מפתח ייחודי (כדי שכמה קבוצות לא יתנגשו) */
function timerPicker(key, label, current) {
  return `<h3>${label}</h3>
    <div class="row wrap" data-timer-group="${key}">
      ${TIMERS.map((t) => `<button class="chip ${t.value === current ? 'on' : ''}" data-timer="${key}:${t.value}">${t.label}</button>`).join('')}
    </div>`;
}

export function setupScreen(ctx) {
  const config = { ...DEFAULT_CONFIG, packIds: PACKS.map((p) => p.id) };
  let transport = 'code';

  const root = el(`
    <div class="stack fade-in">
      <div class="topbar"><button class="btn-ghost btn-small" data-back>→ חזרה</button><span>הגדרות משחק</span></div>

      <div class="card">
        <h3>איך מתחברים?</h3>
        <div class="stack">
          ${Object.values(TRANSPORTS)
            .map(
              (t) => `<button class="chip ${t.id === transport ? 'on' : ''}" data-transport="${t.id}"
                        style="text-align:start;border-radius:14px;padding:12px 14px">
                        <div>${t.emoji} <b>${t.name}</b></div>
                        <div class="muted" style="font-size:.8rem">${t.desc}</div>
                      </button>`,
            )
            .join('')}
        </div>
      </div>

      <div class="card">
        <h3>מספר סיבובים</h3>
        <div class="row wrap" data-rounds>
          ${[1, 2, 3, 4, 5, 6, 8, 10]
            .map((n) => `<button class="chip ${n === config.rounds ? 'on' : ''}" data-round="${n}">${n}</button>`)
            .join('')}
        </div>
        <p class="muted">כל שחקן יוכל להחליף קלף עד <b data-swaps>${config.rounds - 1}</b> פעמים במשחק.</p>
      </div>

      <div class="card">
        ${timerPicker('clue', '⏱️ זמן לחשוב על רמז', config.clueSeconds)}
      </div>

      <div class="card">
        ${timerPicker('guess', '⏱️ זמן לניחוש', config.guessSeconds)}
      </div>

      <div class="card">
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

      <div class="card">
        <div class="row between">
          <h3>חפיסות</h3>
          <button class="btn-ghost btn-small" data-toggle-all>הכל / כלום</button>
        </div>
        <div class="row wrap" data-packs>
          ${PACKS.map(
            (p) => `<button class="chip on" data-pack="${p.id}" title="${p.desc}">${p.emoji} ${p.name}
                      <span class="muted">${p.pairs.length}</span></button>`,
          ).join('')}
        </div>
      </div>

      <button class="btn-primary btn-block" data-create>פתחו את החדר 🎉</button>
      <p class="muted center">עד ${MAX_PLAYERS} שחקנים</p>
    </div>`);

  const setOn = (group, attr, value) =>
    root.querySelectorAll(`[${attr}]`).forEach((b) => b.classList.toggle('on', b.getAttribute(attr) === String(value)));

  on(root, 'click', '[data-transport]', (_, btn) => {
    transport = btn.dataset.transport;
    setOn(root, 'data-transport', transport);
  });

  on(root, 'click', '[data-round]', (_, btn) => {
    config.rounds = +btn.dataset.round;
    setOn(root, 'data-round', config.rounds);
    root.querySelector('[data-swaps]').textContent = config.rounds - 1;
  });

  on(root, 'click', '[data-timer]', (_, btn) => {
    const [key, value] = btn.dataset.timer.split(':');
    config[key === 'clue' ? 'clueSeconds' : 'guessSeconds'] = +value;
    const group = root.querySelector(`[data-timer-group="${key}"]`);
    group.querySelectorAll('[data-timer]').forEach((b) => b.classList.toggle('on', b === btn));
  });

  on(root, 'click', '[data-mode]', (_, btn) => {
    config.mode = btn.dataset.mode;
    setOn(root, 'data-mode', config.mode);
  });

  on(root, 'click', '[data-pack]', (_, btn) => btn.classList.toggle('on'));

  on(root, 'click', '[data-toggle-all]', () => {
    const chips = [...root.querySelectorAll('[data-pack]')];
    const turnOn = chips.some((c) => !c.classList.contains('on'));
    chips.forEach((c) => c.classList.toggle('on', turnOn));
  });

  on(root, 'click', '[data-back]', () => ctx.go('home'));

  on(root, 'click', '[data-create]', (_, btn) => {
    const picked = [...root.querySelectorAll('[data-pack].on')].map((c) => c.dataset.pack);
    if (!picked.length) return toast('בחרו לפחות חפיסה אחת');
    btn.disabled = true;
    btn.textContent = 'פותח חדר...';
    ctx.startHost(transport, { ...config, packIds: picked }).catch((err) => {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = 'פתחו את החדר 🎉';
    });
  });

  return { el: root };
}
