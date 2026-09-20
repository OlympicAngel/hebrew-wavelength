/**
 * שלוש דרכי חיבור, כולן ללא שרת משלנו:
 *  local  - כמה כרטיסיות באותו מכשיר (BroadcastChannel) - נוח להדגמה ולבדיקות.
 *  lan    - WebRTC ישיר עם החלפת קודי QR. עובד ברשת מקומית / נקודה חמה גם בלי אינטרנט.
 *  code   - WebRTC עם מתווך ציבורי (PeerJS) שמאפשר הצטרפות בקוד חדר קצר. דורש אינטרנט פעם אחת.
 */
import { Link, loadScript } from './link.js';
import { createOffer, acceptOffer } from './rtc.js';

const PEERJS_URL = new URL('../vendor/peerjs.min.js', import.meta.url).href;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // בלי אותיות/ספרות מתבלבלות
const LOCAL_CHANNEL = 'wavelength-local';

export const TRANSPORTS = {
  local: { id: 'local', name: 'מכשיר אחד', emoji: '🖥️', desc: 'כמה כרטיסיות באותו דפדפן - להדגמה ולבדיקה' },
  lan: { id: 'lan', name: 'רשת מקומית', emoji: '📶', desc: 'סריקת QR בין המכשירים - עובד בלי אינטרנט' },
  code: { id: 'code', name: 'קוד חדר', emoji: '🔗', desc: 'הצטרפות בקוד בן 4 תווים - דורש אינטרנט' },
};

const randomCode = (len = 4) =>
  Array.from({ length: len }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

/* ------------------------------------------------------------------ PeerJS */

/** @returns {Promise<any>} מופע Peer פתוח, או שגיאה אם המזהה תפוס */
function openPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = new window.Peer(id, { debug: 0 });
    peer.once('open', () => resolve(peer));
    peer.once('error', (err) => reject(err));
  });
}

/** @returns {Link} עטיפת חיבור PeerJS פתוח */
function linkFromPeerConn(conn) {
  const link = new Link(conn.peer, { send: (txt) => conn.send(txt), close: () => conn.close() });
  conn.on('data', (txt) => link.emit('message', typeof txt === 'string' ? JSON.parse(txt) : txt));
  conn.on('close', () => link.emit('close'));
  conn.on('error', () => link.emit('close'));
  return link;
}

/* ---------------------------------------------------------- צד המארח (Host) */

/**
 * @param {'local'|'lan'|'code'} kind
 * @returns {{kind:string, start:()=>Promise<{code?:string}>, onPeer:(fn:(l:Link)=>void)=>void,
 *            invite?:()=>Promise<{offer:string, accept:(a:string)=>Promise<Link>}>, stop:()=>void}}
 */
export function createHost(kind) {
  const peers = [];
  let onPeer = () => {};
  const announce = (link) => {
    peers.push(link);
    onPeer(link);
  };

  if (kind === 'local') {
    let bc;
    return {
      kind,
      async start() {
        bc = new BroadcastChannel(LOCAL_CHANNEL);
        bc.onmessage = ({ data }) => {
          if (data.type !== 'hello') return;
          const back = new BroadcastChannel(`${LOCAL_CHANNEL}:${data.from}`);
          const link = new Link(data.from, {
            send: (txt) => back.postMessage({ dir: 'down', txt }),
            close: () => back.close(),
          });
          back.onmessage = ({ data: m }) => {
            if (m.dir === 'up') link.emit('message', JSON.parse(m.txt));
            if (m.dir === 'bye') link.emit('close');
          };
          back.postMessage({ dir: 'welcome' });
          announce(link);
        };
        return {};
      },
      onPeer: (fn) => (onPeer = fn),
      stop: () => bc?.close(),
    };
  }

  if (kind === 'lan') {
    let seq = 0;
    return {
      kind,
      async start() {
        return {};
      },
      onPeer: (fn) => (onPeer = fn),
      /** יוצר הזמנה חדשה (קוד QR) לשחקן הבא שמצטרף */
      async invite() {
        const { offer, accept } = await createOffer(`lan-${++seq}`);
        return {
          offer,
          accept: async (answer) => {
            const link = await accept(answer);
            announce(link);
            return link;
          },
        };
      },
      stop: () => peers.forEach((p) => p.close()),
    };
  }

  let peer;
  return {
    kind: 'code',
    async start() {
      await loadScript(PEERJS_URL);
      let lastError;
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        try {
          peer = await openPeer(`wavelength-${code}`);
          peer.on('connection', (conn) => conn.on('open', () => announce(linkFromPeerConn(conn))));
          return { code };
        } catch (err) {
          lastError = err;
          if (err.type !== 'unavailable-id') break;
        }
      }
      throw new Error(lastError?.type === 'network' ? 'אין חיבור לשרת החדרים' : 'לא הצלחנו לפתוח חדר');
    },
    onPeer: (fn) => (onPeer = fn),
    stop: () => peer?.destroy(),
  };
}

/* --------------------------------------------------------- צד המצטרף (Client) */

/**
 * @param {'local'|'lan'|'code'} kind
 * @returns {{kind:string, connect:(code?:string)=>Promise<Link>,
 *            answer?:(offer:string)=>Promise<{answer:string, link:Promise<Link>}>, stop:()=>void}}
 */
export function createClient(kind) {
  if (kind === 'local') {
    const me = randomCode(6);
    let back;
    return {
      kind,
      connect: () =>
        new Promise((resolve, reject) => {
          const bc = new BroadcastChannel(LOCAL_CHANNEL);
          back = new BroadcastChannel(`${LOCAL_CHANNEL}:${me}`);
          const link = new Link('host', {
            send: (txt) => back.postMessage({ dir: 'up', txt }),
            close: () => {
              back.postMessage({ dir: 'bye' });
              back.close();
            },
          });
          back.onmessage = ({ data }) => {
            if (data.dir === 'welcome') resolve(link);
            if (data.dir === 'down') link.emit('message', JSON.parse(data.txt));
          };
          bc.postMessage({ type: 'hello', from: me });
          setTimeout(() => reject(new Error('לא נמצא מארח פתוח בדפדפן הזה')), 4000);
        }),
      stop: () => back?.close(),
    };
  }

  if (kind === 'lan') {
    return {
      kind,
      connect: () => Promise.reject(new Error('בחיבור מקומי מצטרפים בסריקת QR')),
      /** מקבל הצעה מהמארח ומחזיר תשובה להצגה כקוד QR */
      answer: (offer) => acceptOffer('host', offer),
      stop: () => {},
    };
  }

  let peer;
  return {
    kind: 'code',
    async connect(code) {
      await loadScript(PEERJS_URL);
      peer = await openPeer(undefined).catch(() => {
        throw new Error('אין חיבור לשרת החדרים');
      });
      const conn = peer.connect(`wavelength-${code.trim().toUpperCase()}`, { reliable: true });
      return new Promise((resolve, reject) => {
        conn.on('open', () => resolve(linkFromPeerConn(conn)));
        conn.on('error', () => reject(new Error('קוד חדר שגוי או שהמארח לא זמין')));
        setTimeout(() => reject(new Error('קוד חדר שגוי או שהמארח לא זמין')), 12000);
      });
    },
    stop: () => peer?.destroy(),
  };
}
