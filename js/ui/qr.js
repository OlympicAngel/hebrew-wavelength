/** הצגה וסריקה של קודי QR - הדרך להחליף פרטי חיבור בלי שום שרת */
import { loadScript } from '../net/link.js';

const QR_LIB = new URL('../vendor/qrcode.min.js', import.meta.url).href;
const SCAN_LIB = new URL('../vendor/jsqr.js', import.meta.url).href;

/** מצייר קוד QR לתוך אלמנט מארח */
export async function showQR(container, text) {
  await loadScript(QR_LIB);
  const qr = window.qrcode(0, 'M'); // 0 = בחירת גודל אוטומטית
  qr.addData(text);
  qr.make();
  container.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
}

/**
 * מפעיל את המצלמה וסורק עד שנמצא קוד.
 * @returns {Promise<{result:Promise<string>, stop:()=>void}>}
 */
export async function scanQR(video) {
  await loadScript(SCAN_LIB);
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  await video.play();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let running = true;
  const stop = () => {
    running = false;
    stream.getTracks().forEach((t) => t.stop());
  };

  const result = new Promise((resolve, reject) => {
    const tick = () => {
      if (!running) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = window.jsQR(image.data, image.width, image.height);
        if (found?.data) {
          stop();
          return resolve(found.data);
        }
      }
      requestAnimationFrame(tick);
    };
    tick();
    video.addEventListener('error', () => reject(new Error('שגיאת מצלמה')), { once: true });
  });

  return { result, stop };
}
