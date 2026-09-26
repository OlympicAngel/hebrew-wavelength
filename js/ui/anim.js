/** כלי אנימציה קטנים למשחק - מונה מספרים ופיצוץ קונפטי, בלי ספריות חיצוניות */

/** מונה ערך מ-from ל-to לאורך duration מ"ש (easing מהיר-לאיטי), קורא ל-render בכל פריים */
export function animateNumber(from, to, duration, render) {
  if (from === to) return render(to);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    render(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const CONFETTI_COLORS = ['#f2643b', '#f7c948', '#4ea3c4', '#4cba8b', '#f7ecd8'];

/** פיצוץ קונפטי קטן שיוצא מהאלמנט הנתון ונעלם לבד - לפגיעות מושלמות */
export function burstConfetti(anchor, count = 18) {
  const rect = anchor.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  document.body.append(layer);

  for (let i = 0; i < count; i++) {
    const bit = document.createElement('span');
    bit.className = 'confetti-bit';
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 90;
    bit.style.left = `${originX}px`;
    bit.style.top = `${originY}px`;
    bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    bit.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    bit.style.setProperty('--dy', `${Math.sin(angle) * dist - 40}px`);
    bit.style.setProperty('--rot', `${(Math.random() - 0.5) * 720}deg`);
    bit.style.animationDelay = `${Math.random() * 80}ms`;
    layer.append(bit);
  }
  setTimeout(() => layer.remove(), 1100);
}
