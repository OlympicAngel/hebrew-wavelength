/** מודאל הזמנה/חיבור-מחדש לשחקן - זמין למארח בכל שלב, לא רק בלובי */
import { el, on, esc, toast } from './dom.js';
import { showQR, scanQR } from './qr.js';

export function openInviteModal(ctx) {
  const kind = ctx.session.transport.kind;
  let scanner = null;

  const overlay = el(`
    <div class="modal-overlay" data-invite-modal>
      <div class="modal-card">
        <div class="row between"><h3>הוסיפו או חברו שחקן</h3><button class="btn-ghost btn-small" data-close>✕</button></div>
        <div data-body></div>
      </div>
    </div>`);
  document.body.append(overlay);

  const body = overlay.querySelector('[data-body]');
  if (kind === 'code')
    body.innerHTML = `<p class="muted">שתפו את הקוד. שחקן שהתנתק יוכל לחזור איתו לאותו ניקוד ומקום במשחק.</p>
      <div class="code-box">${esc(ctx.session.code ?? '----')}</div>`;
  else if (kind === 'local')
    body.innerHTML = `<p class="muted">פתחו כרטיסייה נוספת באותו דפדפן, ובחרו "הצטרפו למשחק" ← "מכשיר אחד".
      שחקן שהתנתק יחזור עם אותו ניקוד אם זו אותה כרטיסייה שהוא השתמש בה קודם.</p>`;
  else
    body.innerHTML = `<p class="muted">כל שחקן מצטרף בסריקה הדדית: הוא סורק את הקוד שלכם, ואתם סורקים את התשובה שלו.
      שחקן שהתנתק יחזור עם אותו ניקוד אחרי סריקה חדשה.</p>
      <div class="qr-box" data-offer-qr hidden></div>
      <video id="invite-scan-video" playsinline muted hidden></video>
      <button class="btn-primary btn-block" data-invite-btn>הזמינו שחקן 📷</button>`;

  /** סבב הזמנה מלא ברשת מקומית: הצגת הצעה ← סריקת התשובה (זהה ללוגיקה בלובי) */
  async function runInvite(btn) {
    const qrBox = overlay.querySelector('[data-offer-qr]');
    const video = overlay.querySelector('#invite-scan-video');
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
      close();
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

  on(overlay, 'click', '[data-invite-btn]', (e, btn) => {
    if (btn.dataset.busy) return;
    btn.dataset.busy = '1';
    runInvite(btn).finally(() => delete btn.dataset.busy);
  });

  function close() {
    scanner?.stop();
    overlay.remove();
  }
  on(overlay, 'click', '[data-close]', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}
