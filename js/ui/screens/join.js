/** מסך הצטרפות: קוד חדר, סריקת QR ברשת מקומית, או חיבור בין כרטיסיות */
import { el, on, toast } from '../dom.js';
import { TRANSPORTS } from '../../net/transports.js';
import { showQR, scanQR } from '../qr.js';

export function joinScreen(ctx) {
  let transport = 'code';
  let scanner = null;

  const root = el(`
    <div class="stack fade-in">
      <div class="topbar"><button class="btn-ghost btn-small" data-back>→ חזרה</button><span>הצטרפות למשחק</span></div>

      <div class="card">
        <h3>איך מתחברים?</h3>
        <div class="row wrap">
          ${Object.values(TRANSPORTS)
            .map((t) => `<button class="chip ${t.id === transport ? 'on' : ''}" data-transport="${t.id}">${t.emoji} ${t.name}</button>`)
            .join('')}
        </div>
      </div>

      <div class="card" data-pane="code">
        <label for="code">קוד החדר שקיבלתם מהמארח</label>
        <input id="code" type="text" maxlength="4" placeholder="ABCD"
               style="text-align:center;letter-spacing:.4em;font-size:1.6rem;direction:ltr" />
        <button class="btn-primary btn-block" data-connect>התחברו</button>
      </div>

      <div class="card" data-pane="lan" hidden>
        <h3>שלב 1 - סרקו את הקוד של המארח</h3>
        <video id="scan-video" playsinline muted></video>
        <button class="btn-ghost btn-block btn-small" data-rescan hidden>סריקה מחדש</button>
        <div data-answer hidden>
          <h3>שלב 2 - הראו את הקוד הזה למארח</h3>
          <div class="qr-box" data-answer-qr></div>
          <p class="muted center">ברגע שהמארח יסרוק - תיכנסו ללובי</p>
        </div>
      </div>

      <div class="card" data-pane="local" hidden>
        <p>פתחו את המשחק בכרטיסייה נוספת באותו דפדפן, ופתחו שם חדר. לחצו כאן כדי להתחבר אליו.</p>
        <button class="btn-primary btn-block" data-connect>התחברו לכרטיסייה המארחת</button>
      </div>
    </div>`);

  const showPane = () => {
    root.querySelectorAll('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== transport));
    if (transport === 'lan') startScan();
    else stopScan();
  };

  /** סורק את הצעת החיבור של המארח ומייצר תשובה כ-QR */
  async function startScan() {
    const video = root.querySelector('#scan-video');
    try {
      scanner = await scanQR(video);
      const offer = await scanner.result;
      video.hidden = true;
      const answer = await ctx.joinWithOffer(offer);
      root.querySelector('[data-answer]').hidden = false;
      await showQR(root.querySelector('[data-answer-qr]'), answer);
    } catch (err) {
      toast(err.message || 'לא הצלחנו לפתוח את המצלמה');
      root.querySelector('[data-rescan]').hidden = false;
    }
  }

  const stopScan = () => {
    scanner?.stop();
    scanner = null;
  };

  on(root, 'click', '[data-transport]', (_, btn) => {
    transport = btn.dataset.transport;
    root.querySelectorAll('[data-transport]').forEach((b) => b.classList.toggle('on', b === btn));
    showPane();
  });

  on(root, 'click', '[data-rescan]', () => {
    root.querySelector('#scan-video').hidden = false;
    root.querySelector('[data-rescan]').hidden = true;
    startScan();
  });

  on(root, 'click', '[data-connect]', (_, btn) => {
    const code = root.querySelector('#code').value.trim();
    if (transport === 'code' && code.length < 4) return toast('קוד חדר הוא 4 תווים');
    btn.disabled = true;
    btn.textContent = 'מתחבר...';
    ctx.startClient(transport, code).catch((err) => {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = 'התחברו';
    });
  });

  on(root, 'click', '[data-back]', () => {
    stopScan();
    ctx.go('home');
  });

  return { el: root, destroy: stopScan };
}
