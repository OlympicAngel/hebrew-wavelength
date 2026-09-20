/** מסך פתיחה: בחירת שם ודמות, ואז יצירת משחק או הצטרפות */
import { el, on, esc } from '../dom.js';

const AVATARS = ['🦊', '🐼', '🐸', '🦉', '🐙', '🦄', '🐯', '🐨', '🦖', '🐧', '🐝', '🦋', '🐳', '🦜', '🐢', '🦁'];

export function homeScreen(ctx) {
  const profile = ctx.profile;
  const root = el(`
    <div class="stack fade-in">
      <div class="logo">
        <h1>אורך<span class="wave"> גל</span></h1>
        <div class="tag">קוראים את המחשבות של הקבוצה - בלי שרת, ישר מהדפדפן</div>
      </div>

      <div class="card">
        <label for="name">איך קוראים לך?</label>
        <input id="name" type="text" maxlength="14" placeholder="השם שלך" value="${esc(profile.name)}" />
        <label>בחרו דמות</label>
        <div class="avatar-grid">
          ${AVATARS.map((a) => `<button data-avatar="${a}" class="${a === profile.avatar ? 'on' : ''}">${a}</button>`).join('')}
        </div>
      </div>

      <button class="btn-primary btn-block" data-go="host">🎛️ פתחו משחק חדש</button>
      <button class="btn-ghost btn-block" data-go="join">🙋 הצטרפו למשחק</button>
      <button class="btn-ghost btn-block btn-small" data-go="rules">📖 איך משחקים?</button>
    </div>`);

  const nameInput = root.querySelector('#name');
  nameInput.addEventListener('input', () => ctx.setProfile({ name: nameInput.value }));

  on(root, 'click', '[data-avatar]', (_, btn) => {
    root.querySelectorAll('[data-avatar]').forEach((b) => b.classList.toggle('on', b === btn));
    ctx.setProfile({ avatar: btn.dataset.avatar });
  });

  on(root, 'click', '[data-go]', (_, btn) => {
    if (btn.dataset.go !== 'rules' && !nameInput.value.trim()) return nameInput.focus();
    ctx.go(btn.dataset.go);
  });

  return { el: root };
}
