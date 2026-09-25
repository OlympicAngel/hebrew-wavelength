/** עזרי DOM קטנים - במקום ספריית UI שלמה */

/** @returns {HTMLElement} יוצר אלמנט מ-HTML */
export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** האזנה עם האצלה (delegation), כדי שרענון תוכן פנימי לא ישבור מאזינים */
export function on(root, event, selector, fn) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) fn(e, target);
  });
}

/** בריחה מתווי HTML - כל טקסט שמגיע משחקנים אחרים עובר כאן */
export const esc = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** הודעת שגיאה צפה קצרה */
export function toast(message) {
  const node = el(`<div class="toast">${esc(message)}</div>`);
  document.body.append(node);
  setTimeout(() => node.remove(), 3200);
}

/** רטט קצר למשוב מישושי - מתעלם בשקט במכשירים/דפדפנים שלא תומכים (כמו iOS Safari) */
export const vibrate = (ms) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* לא נתמך - לא קריטי */
  }
};

/** שמירה/טעינה של פרופיל השחקן בין משחקים */
export const storage = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* מצב גלישה פרטית */
    }
  },
};

/**
 * כמו storage, אבל לפי כרטיסייה (sessionStorage) - שורד רענון דף אבל לא משותף בין כרטיסיות.
 * חשוב לזהות שחקן ספציפי לחיבור-מחדש: localStorage היה גורם לשתי כרטיסיות של "מכשיר אחד"
 * לחלוק את אותו טוקן ולהתבלבל זו בזו.
 */
export const tabStorage = {
  get(key, fallback) {
    try {
      return JSON.parse(sessionStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* מצב גלישה פרטית */
    }
  },
};
