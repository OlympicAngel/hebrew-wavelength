/**
 * שכבת הסשן: המארח הוא מקור האמת היחיד (authoritative).
 * הלקוחות שולחים פעולות ומקבלים בחזרה תצוגת מצב מצונזרת.
 * שני הסוגים חושפים את אותו ממשק כלפי ה-UI: view / onChange / act.
 */
import * as G from './engine.js';
import { createHost, createClient } from '../net/transports.js';

const uid = () => Math.random().toString(36).slice(2, 10);

/** פעולות ששמורות למארח בלבד */
const HOST_ONLY = new Set(['config', 'start', 'next', 'restart', 'kick']);

class Emitter {
  constructor() {
    this._subs = [];
  }
  onChange(fn) {
    this._subs.push(fn);
    return () => (this._subs = this._subs.filter((f) => f !== fn));
  }
  _emit() {
    for (const fn of this._subs) fn(this.view);
  }
}

/* ------------------------------------------------------------------ מארח */

export class HostSession extends Emitter {
  /** @param {'local'|'lan'|'code'} transportKind */
  constructor(transportKind, profile) {
    super();
    this.isHost = true;
    this.transport = createHost(transportKind);
    this.game = G.createGame();
    this.links = new Map(); // playerId -> Link
    this.me = G.createPlayer(uid(), profile.name, profile.avatar);
    this.me.isHost = true;
    this.game.players.push(this.me);
    this.error = '';
    this.timer = null;
  }

  async start() {
    this.transport.onPeer((link) => this._attach(link));
    const info = await this.transport.start();
    this.code = info.code ?? null;
    this._sync();
    return info;
  }

  /** הזמנת שחקן נוסף בחיבור QR מקומי */
  invite() {
    return this.transport.invite();
  }

  get view() {
    return G.viewFor(this.game, this.me.id);
  }

  /** מקבל פעולה - מהמארח עצמו או משחקן מרוחק - ומעדכן את המצב */
  act(type, payload = {}, fromId = this.me.id) {
    if (HOST_ONLY.has(type) && fromId !== this.me.id) return;
    const game = this.game;
    const player = game.players.find((p) => p.id === fromId);
    if (!player) return;

    switch (type) {
      case 'config':
        if (game.phase !== 'lobby') return;
        game.config = { ...game.config, ...payload.config };
        break;

      case 'start':
        if (game.phase !== 'lobby' || game.players.filter((p) => p.connected).length < 2) return;
        game.players.forEach((p) => ((p.score = 0), (p.swapsUsed = 0)));
        game.round = 0;
        game.history = [];
        game.teamScore = 0;
        game.mode = G.resolveMode(game.config, game.players);
        G.startRound(game);
        this._armClueTimer();
        break;

      case 'swap':
        G.swapCard(game, fromId);
        break;

      case 'clue': {
        if (game.phase !== 'clue' || fromId !== game.psychicId) return;
        const clue = String(payload.clue ?? '').trim().slice(0, 60);
        if (!clue) return;
        game.clue = clue;
        game.phase = 'guess';
        this._armGuessTimer();
        break;
      }

      // תזוזה חיה של המחט לפני נעילה - לא סופית, רק לתצוגה אצל המארח
      case 'guessMove':
        if (game.phase !== 'guess' || fromId === game.psychicId) return;
        game.liveGuesses[fromId] = Math.max(0, Math.min(100, Math.round(payload.value)));
        break;

      case 'guess': {
        if (game.phase !== 'guess' || fromId === game.psychicId) return;
        game.guesses[fromId] = Math.max(0, Math.min(100, Math.round(payload.value)));
        delete game.liveGuesses[fromId];
        if (G.allGuessesIn(game)) this._reveal();
        break;
      }

      case 'next':
        if (game.phase !== 'reveal') return;
        G.advance(game);
        if (game.phase === 'clue') this._armClueTimer();
        break;

      case 'restart':
        if (game.phase !== 'final') return;
        game.phase = 'lobby';
        game.round = 0;
        game.history = [];
        game.teamScore = 0;
        game.players.forEach((p) => ((p.score = 0), (p.swapsUsed = 0)));
        break;

      case 'kick': {
        const target = game.players.find((p) => p.id === payload.playerId);
        if (!target || target.isHost) return;
        this.links.get(target.id)?.close();
        game.players = game.players.filter((p) => p.id !== target.id);
        break;
      }
    }
    this._sync();
  }

  /** מחבר שחקן חדש ומתחיל להאזין להודעות שלו */
  _attach(link) {
    link.on('message', (msg) => {
      if (msg.t === 'join') {
        if (link.playerId) return;
        if (this.game.players.length >= G.MAX_PLAYERS || this.game.phase !== 'lobby') {
          link.send({ t: 'error', msg: 'החדר מלא או שהמשחק כבר התחיל' });
          return link.close();
        }
        const player = G.createPlayer(uid(), String(msg.name || 'שחקן').slice(0, 14), msg.avatar);
        link.playerId = player.id;
        this.links.set(player.id, link);
        this.game.players.push(player);
        link.send({ t: 'welcome', playerId: player.id });
        this._sync();
        return;
      }
      if (link.playerId) this.act(msg.t, msg, link.playerId);
    });

    link.on('close', () => {
      const player = this.game.players.find((p) => p.id === link.playerId);
      if (!player) return;
      this.links.delete(player.id);
      // בלובי פשוט מסירים; במהלך משחק משאירים כדי לשמור את הניקוד
      if (this.game.phase === 'lobby') this.game.players = this.game.players.filter((p) => p.id !== player.id);
      else {
        player.connected = false;
        if (this.game.phase === 'guess' && G.allGuessesIn(this.game)) this._reveal();
        if (this.game.phase === 'clue' && this.game.psychicId === player.id) this._reveal();
      }
      this._sync();
    });
  }

  /** מתזמן טיימר גנרי לשלב הנוכחי; ללא ערך (0) פשוט מבטל טיימר קודם ומשאיר ללא הגבלה */
  _startTimer(seconds, onExpire) {
    clearTimeout(this.timer);
    this.game.deadline = seconds ? Date.now() + seconds * 1000 : null;
    if (seconds) this.timer = setTimeout(onExpire, seconds * 1000);
  }

  /** טיימר שלב הרמז - בתום הזמן שולחים "רמז ריק" וממשיכים לניחוש כדי שלא לתקוע את המשחק */
  _armClueTimer() {
    this._startTimer(this.game.config.clueSeconds, () => {
      if (this.game.phase !== 'clue') return;
      this.game.clue = this.game.clue || '(הזמן נגמר - לא נשלח רמז)';
      this.game.phase = 'guess';
      this._armGuessTimer();
      this._sync();
    });
  }

  /** טיימר שלב הניחוש - בתום הזמן חושפים תוצאות עם מה שכבר ננעל */
  _armGuessTimer() {
    this._startTimer(this.game.config.guessSeconds, () => {
      if (this.game.phase !== 'guess') return;
      this._reveal();
      this._sync();
    });
  }

  _reveal() {
    clearTimeout(this.timer);
    G.revealRound(this.game);
  }

  /** משדר לכל לקוח את התצוגה המותאמת לו, ומרענן את ה-UI המקומי */
  _sync() {
    for (const [playerId, link] of this.links) link.send({ t: 'state', view: G.viewFor(this.game, playerId) });
    this._emit();
  }

  stop() {
    clearTimeout(this.timer);
    this.links.forEach((l) => l.close());
    this.transport.stop();
  }
}

/* ----------------------------------------------------------------- מצטרף */

export class ClientSession extends Emitter {
  constructor(transportKind, profile) {
    super();
    this.isHost = false;
    this.transport = createClient(transportKind);
    this.profile = profile;
    this.view = null;
    this.error = '';
    this.disconnected = false;
  }

  /** @param {string} [code] קוד חדר (בחיבור QR מקומי משתמשים ב-joinWithOffer) */
  async start(code) {
    this._bind(await this.transport.connect(code));
  }

  /** הצטרפות ברשת מקומית: מקבלים הצעה סרוקה ומחזירים תשובה להצגה ב-QR */
  async joinWithOffer(offer) {
    const { answer, link } = await this.transport.answer(offer);
    link.then((l) => this._bind(l)).catch(() => {});
    return answer;
  }

  _bind(link) {
    this.link = link;
    link.on('message', (msg) => {
      if (msg.t === 'state') this.view = msg.view;
      if (msg.t === 'welcome') this.playerId = msg.playerId;
      if (msg.t === 'error') this.error = msg.msg;
      this._emit();
    });
    link.on('close', () => {
      this.disconnected = true;
      this._emit();
    });
    link.send({ t: 'join', name: this.profile.name, avatar: this.profile.avatar });
  }

  act(type, payload = {}) {
    this.link?.send({ t: type, ...payload });
  }

  stop() {
    this.link?.close();
    this.transport.stop();
  }
}
