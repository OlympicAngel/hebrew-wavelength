/** נקודת הכניסה: מחזיקה את הסשן הפעיל ומחליפה מסכים לפי שלב המשחק */
import { $, toast, storage, vibrate } from './ui/dom.js';
import { HostSession, ClientSession } from './game/session.js';
import { PACKS } from './data/packs.js';
import { homeScreen } from './ui/screens/home.js';
import { rulesScreen } from './ui/screens/rules.js';
import { setupScreen } from './ui/screens/setup.js';
import { joinScreen } from './ui/screens/join.js';
import { lobbyScreen } from './ui/screens/lobby.js';
import { roundScreen } from './ui/screens/round.js';
import { finalScreen } from './ui/screens/final.js';
import { disconnectedScreen } from './ui/screens/disconnected.js';

const PROFILE_KEY = 'wavelength:profile';
const app = $('#app');
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 8000]; // backoff בין ניסיונות חיבור-מחדש אוטומטיים

/** מסכים שלפני החיבור (route) ומסכים שנגזרים משלב המשחק (phase) */
const ROUTES = { home: homeScreen, rules: rulesScreen, host: setupScreen, join: joinScreen, disconnected: disconnectedScreen };
const PHASES = { lobby: lobbyScreen, clue: roundScreen, guess: roundScreen, reveal: roundScreen, final: finalScreen };

let route = 'home';
let current = null; // {key, screen}

const ctx = {
  profile: storage.get(PROFILE_KEY, { name: '', avatar: '🦊' }),
  session: null,

  setProfile(patch) {
    Object.assign(ctx.profile, patch);
    storage.set(PROFILE_KEY, ctx.profile);
  },

  go(next) {
    route = next;
    render();
  },

  act(type, payload) {
    ctx.session?.act(type, payload);
  },

  async startHost(transportKind) {
    const session = new HostSession(transportKind, ctx.profile);
    await session.start();
    session.act('config', { config: { packIds: PACKS.map((p) => p.id) } });
    bind(session);
  },

  async startClient(transportKind, code) {
    const session = new ClientSession(transportKind, ctx.profile);
    bind(session, { silent: true });
    await session.start(code);
  },

  /** הצטרפות ברשת מקומית - מחזיר את קוד התשובה להצגה כ-QR */
  async joinWithOffer(offer) {
    if (!ctx.session) bind(new ClientSession('lan', ctx.profile), { silent: true });
    return ctx.session.joinWithOffer(offer);
  },

  leave() {
    reconnectStatus = null;
    ctx.session?.stop();
    ctx.session = null;
    ctx.go('home');
  },

  /** ניסיון חיבור מחדש ידני (כפתור במסך הניתוק) - לחיבור QR זה שולח בחזרה למסך ההצטרפות לסריקה חדשה */
  async retryConnect() {
    const session = ctx.session;
    if (!(session instanceof ClientSession)) return;
    if (session.transportKind === 'lan') {
      ctx.session = null;
      return ctx.go('join');
    }
    reconnectStatus = 'מתחברים מחדש...';
    render();
    try {
      await session.reconnect();
    } catch (err) {
      toast(err.message || 'החיבור נכשל');
      reconnectStatus = 'הניסיון נכשל';
      render();
    }
  },
};

let reconnectStatus = null; // null = לא במסך ניתוק כרגע; אחרת טקסט המצב המוצג שם
let reconnectAttempt = 0;

/** מחבר סשן חדש לעדכוני המסך */
function bind(session, { silent = false } = {}) {
  ctx.session = session;
  session.onChange(() => {
    if (session.error) {
      toast(session.error);
      session.error = '';
    }
    if (session.disconnected) return handleDisconnect(session);
    if (reconnectStatus !== null) reconnectStatus = null; // התחברנו מחדש בהצלחה
    render();
  });
  if (!silent) render();
}

/** תגובה לנפילת חיבור: המארח פשוט יוצא, לקוח מקבל מסך ניתוק עם ניסיון חיבור-מחדש אוטומטי */
function handleDisconnect(session) {
  if (session.isHost) {
    toast('החיבור נותק');
    return ctx.leave();
  }
  if (reconnectStatus === null) reconnectAttempt = 0; // ניתוק חדש, לא המשך של סבב ניסיונות קודם
  reconnectStatus = 'החיבור נפל - מתחברים מחדש...';
  render();
  if (session.transportKind === 'lan') {
    reconnectStatus = 'צריך לסרוק שוב - בקשו מהמארח קוד הזמנה חדש';
    return render();
  }
  autoReconnect(session);
}

/** ניסיונות חיבור-מחדש אוטומטיים עם המתנה גוברת, כל עוד עדיין באותו סשן ומנותקים */
async function autoReconnect(session) {
  if (reconnectAttempt >= RECONNECT_DELAYS.length) {
    reconnectStatus = 'לא הצלחנו להתחבר מחדש - אפשר לנסות שוב';
    return render();
  }
  await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAYS[reconnectAttempt]));
  reconnectAttempt += 1;
  if (session !== ctx.session || !session.disconnected) return; // המשתמש עזב, או שכבר התחברנו
  try {
    await session.reconnect();
  } catch {
    autoReconnect(session);
  }
}

/** @returns {{key:string, view:object|null}} איזה מסך צריך להיות מוצג עכשיו */
function resolve() {
  if (reconnectStatus !== null) return { key: 'disconnected', view: reconnectStatus };
  const view = ctx.session?.view ?? null;
  if (!view) return { key: route, view: null };
  return { key: view.phase, view };
}

function render() {
  const { key, view } = resolve();
  const factory = PHASES[key] ?? ROUTES[key] ?? homeScreen;

  if (current?.key !== key) {
    current?.screen.destroy?.();
    const screen = factory(ctx);
    app.replaceChildren(screen.el);
    current = { key, screen };
  }
  if (view) current.screen.update?.(view);
}

render();

// חשיפה לדיבוג (למשל מ-remote inspector בנייד, כשאין גישה ללוגים) - לא בשימוש פנימי
window.__wavelength = ctx;

// שמירה על מצב: אזהרה לפני יציאה באמצע משחק
window.addEventListener('beforeunload', (e) => {
  if (ctx.session && ctx.session.view?.phase !== 'lobby') e.preventDefault();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// משוב מישושי גלובלי: רטט קצר בכל לחיצה על כפתור בכל האפליקציה
document.addEventListener('click', (e) => {
  if (e.target.closest('button')) vibrate(8);
});
