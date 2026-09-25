/** מסך נפילת חיבור: מנסים להתחבר מחדש אוטומטית, עם אפשרות ידנית + יציאה */
import { el, on } from '../dom.js';

export function disconnectedScreen(ctx) {
  const root = el(`
    <div class="stack fade-in">
      <div class="logo">
        <h1>📡 החיבור<span class="wave"> נותק</span></h1>
        <div class="tag" data-status>מנסים להתחבר מחדש...</div>
      </div>
      <button class="btn-primary btn-block" data-retry>נסו להתחבר שוב</button>
      <button class="btn-ghost btn-block" data-leave>יציאה</button>
    </div>`);

  on(root, 'click', '[data-retry]', () => ctx.retryConnect());
  on(root, 'click', '[data-leave]', () => ctx.leave());

  return {
    el: root,
    /** @param {string} status טקסט מצב חופשי (מתעדכן מ-app.js לפי התקדמות הניסיון) */
    update(status) {
      if (status) root.querySelector('[data-status]').textContent = status;
    },
  };
}
