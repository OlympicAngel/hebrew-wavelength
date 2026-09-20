/** חיבור WebRTC ישיר (עמית לעמית) עם ערוץ נתונים אחד, ללא שרת אמצע. */
import { Link } from './link.js';
import { packSdp, unpackSdp } from './sdp.js';

// בלי STUN: בתוך רשת מקומית / נקודה חמה המועמדים המקומיים מספיקים והכל עובד גם בלי אינטרנט.
const RTC_CONFIG = { iceServers: [] };

/** ממתין לסיום איסוף המועמדים כדי שנוכל לשלוח SDP אחד שלם (ללא trickle) */
function waitForIce(pc, timeoutMs = 3000) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => pc.iceGatheringState === 'complete' && done();
    const timer = setTimeout(done, timeoutMs); // לא נתקעים אם מועמד אחד איטי
    pc.addEventListener('icegatheringstatechange', check);
  });
}

/** עוטף ערוץ נתונים פתוח ב-Link ומטפל בניתוקים */
function linkFromChannel(id, pc, channel) {
  const link = new Link(id, { send: (txt) => channel.send(txt), close: () => pc.close() });
  channel.onmessage = (e) => link.emit('message', JSON.parse(e.data));
  channel.onclose = () => link.emit('close');
  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) link.emit('close');
  };
  return link;
}

/**
 * צד המזמין: יוצר הצעה דחוסה, ומחזיר פונקציה שמשלימה את החיבור עם התשובה.
 * @returns {Promise<{offer:string, accept:(answer:string)=>Promise<Link>}>}
 */
export async function createOffer(id) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const channel = pc.createDataChannel('game', { ordered: true });
  await pc.setLocalDescription(await pc.createOffer());
  await waitForIce(pc);

  return {
    offer: packSdp(pc.localDescription.sdp),
    accept: async (answer) => {
      await pc.setRemoteDescription(unpackSdp(answer, 'answer'));
      const link = linkFromChannel(id, pc, channel);
      if (channel.readyState !== 'open') {
        await new Promise((resolve, reject) => {
          channel.onopen = resolve;
          setTimeout(() => reject(new Error('פג הזמן בהמתנה לחיבור')), 15000);
        });
      }
      return link;
    },
  };
}

/**
 * צד המוזמן: מקבל הצעה דחוסה ומחזיר תשובה דחוסה + הבטחה ל-Link פתוח.
 * @returns {Promise<{answer:string, link:Promise<Link>}>}
 */
export async function acceptOffer(id, offer) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const channelReady = new Promise((resolve, reject) => {
    pc.ondatachannel = (e) => {
      const ch = e.channel;
      if (ch.readyState === 'open') resolve(linkFromChannel(id, pc, ch));
      else ch.onopen = () => resolve(linkFromChannel(id, pc, ch));
    };
    setTimeout(() => reject(new Error('פג הזמן בהמתנה לחיבור')), 20000);
  });

  await pc.setRemoteDescription(unpackSdp(offer, 'offer'));
  await pc.setLocalDescription(await pc.createAnswer());
  await waitForIce(pc);
  return { answer: packSdp(pc.localDescription.sdp), link: channelReady };
}
