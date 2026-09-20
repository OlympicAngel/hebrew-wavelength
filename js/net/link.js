/** עטיפה דקה סביב ערוץ תקשורת: שליחה/קבלה של אובייקטי JSON + אירועי סגירה */
export class Link {
  /**
   * @param {string} id מזהה ייחודי של הצד השני
   * @param {{send:(txt:string)=>void, close:()=>void}} channel
   */
  constructor(id, channel) {
    this.id = id;
    this.channel = channel;
    this.open = true;
    this._handlers = { message: [], close: [] };
  }

  /** @param {'message'|'close'} event */
  on(event, fn) {
    this._handlers[event].push(fn);
    return this;
  }

  emit(event, payload) {
    if (event === 'close') {
      if (!this.open) return;
      this.open = false;
    }
    for (const fn of this._handlers[event]) fn(payload, this);
  }

  send(msg) {
    if (!this.open) return;
    try {
      this.channel.send(JSON.stringify(msg));
    } catch {
      this.emit('close');
    }
  }

  close() {
    try {
      this.channel.close();
    } catch {
      /* כבר סגור */
    }
    this.emit('close');
  }
}

/** טוען סקריפט חיצוני (UMD) פעם אחת בלבד - כדי לא לנפח את הטעינה הראשונית */
const loaded = new Map();
export function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(
      src,
      new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.onload = resolve;
        el.onerror = () => reject(new Error(`נכשלה טעינת ${src}`));
        document.head.append(el);
      }),
    );
  }
  return loaded.get(src);
}
