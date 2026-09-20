/** רישום החפיסות (Packs) - הוספת חפיסה חדשה = ייבוא כאן בלבד */
import core from './packs/core.js';
import people from './packs/people.js';
import food from './packs/food.js';
import culture from './packs/culture.js';
import tech from './packs/tech.js';
import school from './packs/school.js';
import israel from './packs/israel.js';
import nature from './packs/nature.js';
import emotions from './packs/emotions.js';
import funny from './packs/funny.js';
import sports from './packs/sports.js';
import abstract from './packs/abstract.js';
import objects from './packs/objects.js';

export const PACKS = [core, people, food, culture, tech, school, israel, nature, emotions, funny, sports, abstract, objects];

/** כל הקלפים כרשימה שטוחה, כשלכל קלף מזהה יציב "packId:index" */
export const ALL_CARDS = PACKS.flatMap((pack) =>
  pack.pairs.map(([low, high], i) => ({ id: `${pack.id}:${i}`, packId: pack.id, low, high })),
);

/** @returns {{id:string,packId:string,low:string,high:string}[]} קלפים מהחפיסות שנבחרו (ריק/הכל = כל החפיסות) */
export function cardsForPacks(packIds) {
  if (!packIds?.length || packIds.length === PACKS.length) return ALL_CARDS;
  const set = new Set(packIds);
  return ALL_CARDS.filter((c) => set.has(c.packId));
}

export const TOTAL_CARDS = ALL_CARDS.length;
