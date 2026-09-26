/**
 * החוגה - חצי עיגול בסגנון המשחק המקורי.
 * ציר הערכים 0..100 נקרא מימין לשמאל (כיוון הקריאה בעברית):
 * 0 = הקצה הימני, 100 = הקצה השמאלי.
 */
import { el } from './dom.js';
import { BANDS } from '../game/engine.js';

const CX = 200;
const CY = 210;
const R = 185;

const toAngle = (value) => value * 1.8; // 0..100 -> 0..180 מעלות
const point = (value, radius = R) => {
  const rad = (toAngle(value) * Math.PI) / 180;
  return [CX + radius * Math.cos(rad), CY - radius * Math.sin(rad)];
};

/** @returns {string} נתיב SVG של גזרה בין שני ערכים */
function sector(from, to) {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 0 0 ${x2} ${y2} Z`;
}

export class Dial {
  /**
   * @param {{interactive?:boolean, onChange?:(v:number)=>void}} options
   */
  constructor({ interactive = false, onChange } = {}) {
    this.value = 50;
    this.target = null;
    this.needles = null; // null = להציג את המחט שלי; מערך = מחטים מפורשות
    this.peers = []; // מחטים חיים של שחקנים אחרים (למארח בלבד) - מתווספות מעל needles/הערך שלי
    this.interactive = interactive;
    this.onChange = onChange;
    this.el = el(`
      <div class="dial-wrap">
        <svg class="dial" viewBox="-12 -34 424 256" role="slider" aria-label="חוגת הניחוש"
             aria-valuemin="0" aria-valuemax="100" tabindex="0">
          <path class="face" d="${sector(0, 100)}"></path>
          <g class="bands"></g>
          <g class="ticks"></g>
          <g class="marks"></g>
          <circle class="hub" cx="${CX}" cy="${CY}" r="11"></circle>
        </svg>
      </div>`);
    this.svg = this.el.querySelector('svg');
    this._drawTicks();
    this._bindPointer();
    this.render();
  }

  /** קווי סימון קטנים לאורך הקשת, לתחושת מד אמיתי */
  _drawTicks() {
    const ticks = this.el.querySelector('.ticks');
    for (let v = 0; v <= 100; v += 5) {
      const [x1, y1] = point(v, R - (v % 25 ? 8 : 16));
      const [x2, y2] = point(v, R);
      ticks.insertAdjacentHTML('beforeend', `<line class="tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
    }
  }

  _bindPointer() {
    const move = (e) => {
      if (!this.interactive) return;
      const box = this.svg.getBoundingClientRect();
      // המרה מקואורדינטות מסך לקואורדינטות ה-viewBox
      const vx = ((e.clientX - box.left) / box.width) * 424 - 12;
      const vy = ((e.clientY - box.top) / box.height) * 256 - 34;
      const deg = (Math.atan2(CY - vy, vx - CX) * 180) / Math.PI;
      this.setValue(Math.min(100, Math.max(0, deg / 1.8)), true);
    };
    this.el.addEventListener('pointerdown', (e) => {
      if (!this.interactive) return;
      this.el.setPointerCapture(e.pointerId);
      move(e);
    });
    this.el.addEventListener('pointermove', (e) => e.buttons && move(e));
    // נגישות: חיצים מזיזים את המחט
    this.svg.addEventListener('keydown', (e) => {
      if (!this.interactive) return;
      const step = { ArrowRight: -1, ArrowLeft: 1, ArrowUp: 1, ArrowDown: -1 }[e.key];
      if (step == null) return;
      e.preventDefault();
      this.setValue(this.value + step, true);
    });
  }

  setInteractive(on) {
    this.interactive = on;
    this.svg.classList.toggle('locked', !on);
  }

  /** @param {boolean} fromUser האם השינוי הגיע מהמשתמש (ואז מדווח החוצה) */
  setValue(value, fromUser = false) {
    this.value = Math.round(Math.min(100, Math.max(0, value)));
    this.svg.setAttribute('aria-valuenow', this.value);
    this.render();
    if (fromUser) this.onChange?.(this.value);
  }

  /** @param {number|null} target מיקום המטרה, או null כדי להסתיר אותה */
  setTarget(target) {
    this.target = target;
    this.render();
  }

  /**
   * @param {{value:number, avatar?:string, me?:boolean}[]|null} needles מחטים מפורשות, או null למחט שלי בלבד
   * @param {{animate?:boolean, duration?:number}} [opts] animate=true מגלגל את המחטים בתנועה מהמיקום הקודם
   *   במקום קפיצה מיידית - לרגע החשיפה, כדי שהניחושים "יתגלגלו" למקומם במקום להופיע פתאום
   */
  setNeedles(needles, { animate = false, duration = 650 } = {}) {
    if (!animate || !needles) {
      this.needles = needles;
      this.render();
      return;
    }
    const from = (this.needles ?? []).map((n) => n.value);
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out
      this.needles = needles.map((n, i) => ({ ...n, value: (from[i] ?? 50) + (n.value - (from[i] ?? 50)) * eased }));
      this.render();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** @param {{value:number, avatar?:string}[]} peers מחטים חיים שמתווספות תמיד מעל needles (למארח, בזמן אמת) */
  setPeers(peers) {
    this.peers = peers;
    this.render();
  }

  render() {
    const bands = this.el.querySelector('.bands');
    // בונים מחדש רק כשהמטרה באמת השתנתה - גם לביצועים (לא בכל תזוזת אצבע) וגם כדי שאנימציית
    // ה"הופעה" של הטריז תרוץ פעם אחת בלבד ולא תהבהב על כל render במהלך הניחוש
    if (this.target !== this._lastTarget) {
      this._lastTarget = this.target;
      if (this.target == null) bands.innerHTML = '';
      else {
        // מציירים מהרחב לצר כדי שהמרכז (4 נקודות) יישאר למעלה
        bands.innerHTML = [...BANDS]
          .reverse()
          .map((b) => `<path class="band-${b.points} wedge-in" d="${sector(this.target - b.half, this.target + b.half)}"></path>`)
          .join('');
        const [tx, ty] = point(this.target);
        bands.insertAdjacentHTML('beforeend', `<line class="target-line wedge-in" x1="${CX}" y1="${CY}" x2="${tx}" y2="${ty}"/>`);
      }
    }

    const marks = this.el.querySelector('.marks');
    const list = [...this.peers, ...(this.needles ?? [{ value: this.value, me: true }])];
    marks.innerHTML = list
      .map((n) => {
        const [x, y] = point(n.value, R - 6);
        const [lx, ly] = point(n.value, R + 16);
        const tag = n.avatar ? `<text x="${lx}" y="${ly}" font-size="22" text-anchor="middle">${n.avatar}</text>` : '';
        return `<line class="needle ${n.me ? 'me' : 'ghost'}" x1="${CX}" y1="${CY}" x2="${x}" y2="${y}"/>${tag}`;
      })
      .join('');
  }
}
