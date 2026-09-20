/** פתיחת חדר: רק סוג החיבור. שאר ההגדרות (סיבובים/טיימרים/מצב/חפיסות) נבחרות בלובי מול השחקנים */
import { el, on, toast } from '../dom.js';
import { TRANSPORTS } from '../../net/transports.js';
import { MAX_PLAYERS } from '../../game/engine.js';

export function setupScreen(ctx) {
  let transport = 'code';

  const root = el(`
    <div class="stack fade-in">
      <div class="topbar"><button class="btn-ghost btn-small" data-back>→ חזרה</button><span>פתיחת חדר</span></div>

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

      <p class="muted center">מספר סיבובים, טיימרים, מצב משחק וחפיסות נקבעים בלובי - אחרי שרואים מי הצטרף.</p>

      <button class="btn-primary btn-block" data-create>פתחו את החדר 🎉</button>
      <p class="muted center">עד ${MAX_PLAYERS} שחקנים</p>
    </div>`);

  on(root, 'click', '[data-transport]', (_, btn) => {
    transport = btn.dataset.transport;
    root.querySelectorAll('[data-transport]').forEach((b) => b.classList.toggle('on', b === btn));
  });

  on(root, 'click', '[data-back]', () => ctx.go('home'));

  on(root, 'click', '[data-create]', (_, btn) => {
    btn.disabled = true;
    btn.textContent = 'פותח חדר...';
    ctx.startHost(transport).catch((err) => {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = 'פתחו את החדר 🎉';
    });
  });

  return { el: root };
}
