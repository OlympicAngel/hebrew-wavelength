/** נקודת הכניסה: מחזיקה את הסשן הפעיל ומחליפה מסכים לפי שלב המשחק */
import { $, toast, storage, vibrate } from './ui/dom.js';
import { HostSession, ClientSession } from './game/session.js';
import { homeScreen } from './ui/screens/home.js';
import { rulesScreen } from './ui/screens/rules.js';
import { setupScreen } from './ui/screens/setup.js';
import { joinScreen } from './ui/screens/join.js';
import { lobbyScreen } from './ui/screens/lobby.js';
import { roundScreen } from './ui/screens/round.js';
import { finalScreen } from './ui/screens/final.js';

const PROFILE_KEY = 'wavelength:profile';
const app = $('#app');

/** מסכים שלפני החיבור (route) ומסכים שנגזרים משלב המשחק (phase) */
const ROUTES = { home: homeScreen, rules: rulesScreen, host: setupScreen, join: joinScreen };
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

  async startHost(transportKind, config) {
    const session = new HostSession(transportKind, ctx.profile);
    await session.start();
    session.act('config', { config });
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
    ctx.session?.stop();
    ctx.session = null;
    ctx.go('home');
  },
};

/** מחבר סשן חדש לעדכוני המסך */
function bind(session, { silent = false } = {}) {
  ctx.session = session;
  session.onChange(() => {
    if (session.error) {
      toast(session.error);
      session.error = '';
    }
    if (session.disconnected) {
      toast('החיבור למארח נותק');
      return ctx.leave();
    }
    render();
  });
  if (!silent) render();
}

/** @returns {{key:string, view:object|null}} איזה מסך צריך להיות מוצג עכשיו */
function resolve() {
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
