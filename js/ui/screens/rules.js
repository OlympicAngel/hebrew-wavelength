/** מסך הסבר קצר על חוקי המשחק */
import { el, on } from '../dom.js';
import { BANDS } from '../../game/engine.js';
import { TOTAL_CARDS, PACKS } from '../../data/packs.js';

export function rulesScreen(ctx) {
  const root = el(`
    <div class="stack fade-in">
      <div class="topbar"><button class="btn-ghost btn-small" data-back>→ חזרה</button><span>איך משחקים</span></div>

      <div class="card">
        <h2>הרעיון</h2>
        <p>בכל סיבוב שחקן אחד הוא <b>הרמז</b>. הוא רואה ספקטרום (למשל "מכוער ↔ יפה") ונקודת מטרה חבויה עליו,
           וצריך לומר מילה או ביטוי שיכוונו את שאר השחקנים בדיוק לשם.</p>
        <p>כל השאר מזיזים את המחט ונועלים ניחוש. ככל שקרובים יותר - יותר נקודות.</p>
      </div>

      <div class="card">
        <h2>ניקוד</h2>
        <div class="row wrap">
          ${BANDS.map((b) => `<span class="points p${b.points}">${b.points}</span>`).join('')}
          <span class="points p0">0</span>
        </div>
        <p class="muted">הטריז הכתום במרכז שווה 4 נקודות, הצהוב 3, הכחול 2, ומחוץ לטריז - 0.
           הרמז מקבל את ממוצע הנקודות של המנחשים, אז רמז טוב משתלם לכולם.</p>
      </div>

      <div class="card">
        <h2>סיבובים והחלפות</h2>
        <p>המארח קובע כמה סיבובים יש (ברירת מחדל 3). תפקיד הרמז עובר בתורות.</p>
        <p>כל שחקן רשאי להחליף את הקלף שקיבל עד <b>n-1</b> פעמים במשחק (n = מספר הסיבובים).</p>
      </div>

      <div class="card">
        <h2>החפיסות</h2>
        <p>${TOTAL_CARDS} ספקטרומים ב-${PACKS.length} חפיסות:</p>
        <div class="row wrap">
          ${PACKS.map((p) => `<span class="chip">${p.emoji} ${p.name}</span>`).join('')}
        </div>
      </div>

      <button class="btn-primary btn-block" data-back>הבנתי, קדימה</button>
    </div>`);

  on(root, 'click', '[data-back]', () => ctx.go('home'));
  return { el: root };
}
