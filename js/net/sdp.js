/**
 * דחיסת SDP: תיאור WebRTC מלא שוקל ~1.5KB ולא נכנס לקוד QR.
 * אנחנו שומרים רק את מה שבאמת נחוץ (ufrag, סיסמה, טביעת אצבע, מועמדים)
 * ובונים מחדש SDP תקני בצד השני.
 */

const b64url = {
  /** @param {Uint8Array|string} data */
  enc: (data) => {
    const bin = typeof data === 'string' ? data : String.fromCharCode(...data);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec: (str) => atob(str.replace(/-/g, '+').replace(/_/g, '/')),
};

const hexToB64 = (hex) => b64url.enc(Uint8Array.from(hex.split(':').map((h) => parseInt(h, 16))));
const b64ToHex = (b64) =>
  [...b64url.dec(b64)]
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase())
    .join(':');

const grab = (sdp, re) => sdp.match(re)?.[1]?.trim() ?? '';

/** @returns {string} מחרוזת קצרה (base64url) שמייצגת את ה-SDP, מוכנה ל-QR */
export function packSdp(sdp) {
  const candidates = [...sdp.matchAll(/a=candidate:\S+ \d+ (udp|tcp) \d+ (\S+) (\d+) typ (host|srflx)/gi)]
    .filter((m) => m[1].toLowerCase() === 'udp')
    .map((m) => [m[2], +m[3], m[4] === 'host' ? 0 : 1]);

  const payload = [
    grab(sdp, /a=ice-ufrag:(.+)/),
    grab(sdp, /a=ice-pwd:(.+)/),
    hexToB64(grab(sdp, /a=fingerprint:sha-256 (.+)/)),
    grab(sdp, /a=setup:(\w+)/),
    candidates,
  ];
  return b64url.enc(unescape(encodeURIComponent(JSON.stringify(payload))));
}

/** @returns {RTCSessionDescriptionInit} בנייה מחדש של תיאור SDP תקני מהמחרוזת הדחוסה */
export function unpackSdp(packed, type) {
  const [ufrag, pwd, fp, setup, candidates] = JSON.parse(decodeURIComponent(escape(b64url.dec(packed))));
  const lines = [
    'v=0',
    'o=- 1 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${ufrag}`,
    `a=ice-pwd:${pwd}`,
    `a=fingerprint:sha-256 ${b64ToHex(fp)}`,
    `a=setup:${setup}`,
    'a=mid:0',
    'a=sctp-port:5000',
    'a=max-message-size:262144',
    ...candidates.map(([ip, port, kind], i) =>
      kind === 0
        ? `a=candidate:${i + 1} 1 udp 2113937151 ${ip} ${port} typ host`
        : `a=candidate:${i + 1} 1 udp 1677729535 ${ip} ${port} typ srflx raddr 0.0.0.0 rport 0`,
    ),
  ];
  return { type, sdp: lines.join('\r\n') + '\r\n' };
}
