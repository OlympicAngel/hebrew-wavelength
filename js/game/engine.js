/**
 * לוגיקת המשחק - פונקציות טהורות בלבד (ללא DOM וללא רשת).
 * הספקטרום הוא ציר 0..100. ה"מטרה" היא נקודה על הציר, וסביבה טריז ניקוד.
 */
import { cardsForPacks } from '../data/packs.js';

/** חצאי-רוחב הטריז סביב המטרה, מהמרכז החוצה - כמו במשחק המקורי (4/3/2) */
export const BANDS = [
  { half: 2, points: 4 },
  { half: 6, points: 3 },
  { half: 10, points: 2 },
];

const WEDGE_HALF = BANDS[BANDS.length - 1].half; // רוחב חצי הטריז הכולל
const TARGET_MIN = WEDGE_HALF + 2; // שומר שהטריז כולו יישאר על הלוח
const TARGET_MAX = 100 - TARGET_MIN;

export const MAX_PLAYERS = 12;
export const DEFAULT_CONFIG = { rounds: 3, packIds: [], guessSeconds: 0 };

/** @returns {number} ניקוד (0-4) לניחוש יחיד מול המטרה */
export function scoreFor(guess, target) {
  const dist = Math.abs(guess - target);
  for (const band of BANDS) if (dist <= band.half) return band.points;
  return 0;
}

/** @returns {number} מיקום מטרה אקראי שהטריז שלו נכנס בשלמותו ללוח */
export function randomTarget() {
  return Math.round(TARGET_MIN + Math.random() * (TARGET_MAX - TARGET_MIN));
}

/** @returns {object|null} קלף אקראי שטרם שוחק; מאפס את ההיסטוריה כשנגמרו הקלפים */
export function drawCard(config, usedIds) {
  const pool = cardsForPacks(config.packIds);
  let available = pool.filter((c) => !usedIds.includes(c.id));
  if (!available.length) {
    usedIds.length = 0; // סבב חדש על אותה בריכת קלפים
    available = pool;
  }
  const card = available[Math.floor(Math.random() * available.length)];
  if (card) usedIds.push(card.id);
  return card ?? null;
}

/** @returns {number} כמה החלפות קלף מותרות לכל שחקן לאורך המשחק (n-1) */
export function maxSwaps(config) {
  return Math.max(0, config.rounds - 1);
}

/** @returns {object} מצב משחק התחלתי בלובי */
export function createGame() {
  return {
    phase: 'lobby', // lobby | clue | guess | reveal | final
    config: { ...DEFAULT_CONFIG },
    players: [],
    round: 0,
    psychicId: null,
    card: null,
    target: null,
    clue: '',
    guesses: {}, // playerId -> 0..100
    history: [], // תוצאות סיבובים קודמים לתצוגת הסיכום
    usedCardIds: [],
    deadline: null, // חותמת זמן לסיום שלב הניחוש (כשיש טיימר)
  };
}

/** @returns {object} שחקן חדש עם ערכי ברירת מחדל */
export function createPlayer(id, name, avatar) {
  return { id, name, avatar, score: 0, swapsUsed: 0, connected: true, isHost: false };
}

/** מתחיל סיבוב חדש (או את הראשון) ומעדכן את המצב במקום */
export function startRound(game) {
  const order = game.players.filter((p) => p.connected);
  if (!order.length) return game;
  game.round += 1;
  // הרמז עובר בתורות לפי סדר ההצטרפות
  game.psychicId = order[(game.round - 1) % order.length].id;
  game.card = drawCard(game.config, game.usedCardIds);
  game.target = randomTarget();
  game.clue = '';
  game.guesses = {};
  game.phase = 'clue';
  game.deadline = null;
  return game;
}

/** מחליף את הקלף של הסיבוב הנוכחי ומנצל החלפה אחת של הרמז */
export function swapCard(game, playerId) {
  const player = game.players.find((p) => p.id === playerId);
  if (!player || playerId !== game.psychicId || game.phase !== 'clue') return false;
  if (player.swapsUsed >= maxSwaps(game.config)) return false;
  player.swapsUsed += 1;
  game.card = drawCard(game.config, game.usedCardIds);
  game.target = randomTarget();
  return true;
}

/** @returns {string[]} מזהי השחקנים שאמורים לנחש בסיבוב הנוכחי */
export function guesserIds(game) {
  return game.players.filter((p) => p.connected && p.id !== game.psychicId).map((p) => p.id);
}

/** @returns {boolean} האם כל המנחשים כבר נעלו ניחוש */
export function allGuessesIn(game) {
  const ids = guesserIds(game);
  return ids.length > 0 && ids.every((id) => game.guesses[id] != null);
}

/**
 * סוגר את שלב הניחוש: מחשב ניקוד לכל מנחש, ולרמז את הממוצע (מעוגל).
 * מנחש שלא הספיק לנעול מקבל 0.
 */
export function revealRound(game) {
  const ids = guesserIds(game);
  const results = ids.map((id) => {
    const guess = game.guesses[id] ?? null;
    const points = guess == null ? 0 : scoreFor(guess, game.target);
    return { playerId: id, guess, points };
  });
  const avg = results.length ? Math.round(results.reduce((s, r) => s + r.points, 0) / results.length) : 0;
  for (const r of results) {
    const p = game.players.find((x) => x.id === r.playerId);
    if (p) p.score += r.points;
  }
  const psychic = game.players.find((p) => p.id === game.psychicId);
  if (psychic) psychic.score += avg;

  game.history.push({
    round: game.round,
    card: game.card,
    clue: game.clue,
    target: game.target,
    psychicId: game.psychicId,
    psychicPoints: avg,
    results,
  });
  game.phase = 'reveal';
  game.deadline = null;
  return game;
}

/** מעביר לסיבוב הבא, או מסיים את המשחק אם הושלמו כל הסיבובים */
export function advance(game) {
  if (game.round >= game.config.rounds) {
    game.phase = 'final';
    return game;
  }
  return startRound(game);
}

/** @returns {object[]} טבלת דירוג ממוינת, כולל דירוג משותף לתיקו */
export function standings(game) {
  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  let rank = 0;
  let prevScore = null;
  return sorted.map((p, i) => {
    if (p.score !== prevScore) {
      rank = i + 1;
      prevScore = p.score;
    }
    return { ...p, rank };
  });
}

/**
 * התצוגה שנשלחת ללקוח מסוים - מסתירה את המטרה ממי שאינו הרמז,
 * ואת תוכן הניחושים של האחרים לפני החשיפה.
 * @returns {object} מצב מצונזר
 */
export function viewFor(game, playerId) {
  const revealed = game.phase === 'reveal' || game.phase === 'final';
  const isPsychic = playerId === game.psychicId;
  return {
    ...game,
    target: revealed || (isPsychic && game.phase !== 'lobby') ? game.target : null,
    guesses: revealed
      ? game.guesses
      : Object.fromEntries(Object.keys(game.guesses).map((id) => [id, id === playerId ? game.guesses[id] : true])),
    you: playerId,
  };
}
