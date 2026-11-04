// Hold alerts by email, so the person's phone buzzes when a purchase their agent tried is waiting for them. Sent
// through Gmail with an App Password (GMAIL_USER and GMAIL_APP_PASSWORD in .env) to ALERT_EMAIL, or to GMAIL_USER
// when that's empty. With no Gmail settings, no email is sent.
// ponytail: SMTP is written out by hand (no nodemailer): one server, implicit TLS on 465, one plain-text message.
import tls from 'node:tls';

const usd = x => '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const EMAIL = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
// Store names and descriptions come from the agent: on one line they can't start a header of their own (say a Bcc).
const oneLine = s => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200);
const header = s => /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s).toString('base64') + '?=';

export const alertsOn = () => !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
export const alertsTo = () => process.env.ALERT_EMAIL || process.env.GMAIL_USER;

// held: the pending entry pay() saves. approveAt: the Approvals page.
export function heldMessage(held, approveAt) {
  const p = held.purchase, store = oneLine(held.store), what = oneLine(p.description);
  return {
    subject: `Your agent wants to spend ${usd(p.amount)} at ${store}`,
    text: [
      `Your agent tried to buy ${what ? what + ' ' : ''}for ${usd(p.amount)} at ${store}. CardBuddy is holding it for you: nothing has been charged.`,
      '', 'Why it waited:', ...held.reasons.map(r => '- ' + cap(oneLine(r))), '',
      held.card ? `If you approve, it pays with ${oneLine(held.card)}: ${held.percentBack}% back (${usd(p.amount * held.percentBack / 100)}).` : 'No card in your wallet can pay this yet.',
      '', `Approve or decline: ${approveAt}`
    ].join('\n')
  };
}

// Sends one held-purchase alert. Resolves false when alerts are off; rejects with a plain message if Gmail says no.
export async function notifyHeld(held, approveAt, connect) {
  if (!alertsOn()) return false;
  const user = process.env.GMAIL_USER, to = alertsTo();
  if (!EMAIL.test(user) || !EMAIL.test(to)) throw new Error('GMAIL_USER and ALERT_EMAIL in .env must be email addresses.');
  // Google shows App Passwords in groups of four ("abcd efgh ijkl mnop"); the spaces aren't part of it.
  await sendMail({ from: user, to, user, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, ''), ...heldMessage(held, approveAt) }, connect);
  return true;
}

// connect: the socket to talk SMTP over, swappable for tests (a plain socket to a fake server).
export async function sendMail({ from, to, user, pass, subject, text }, connect = () => tls.connect({ host: 'smtp.gmail.com', port: 465, servername: 'smtp.gmail.com' })) {
  const sock = connect();
  sock.setEncoding('utf8');
  sock.setTimeout(20000, () => sock.destroy(new Error('Gmail didn\'t answer within 20 seconds.')));
  let buf = '', err = null, waiter = null;
  // One reply per command: "250-..." lines continue it, "250 ..." ends it.
  const settle = () => {
    if (!waiter) return;
    if (err) { const w = waiter; waiter = null; return w.no(err); }
    for (let i; (i = buf.indexOf('\n')) >= 0;) {
      const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1);
      if (line[3] !== '-') { const w = waiter; waiter = null; return w.ok(line); }
    }
  };
  sock.on('data', d => { buf += d; settle(); });
  sock.on('error', e => { err = e; settle(); });
  sock.on('close', () => { err = err || new Error('Gmail closed the connection.'); settle(); });
  const say = async (code, line) => {
    if (line != null) sock.write(line + '\r\n');
    const got = await new Promise((ok, no) => { waiter = { ok, no }; settle(); });
    if (!got.startsWith(code)) throw new Error(code === '235' ? 'Gmail didn\'t accept GMAIL_USER and GMAIL_APP_PASSWORD (use an App Password, not your Google password).' : 'Gmail said: ' + got.slice(0, 200));
  };
  try {
    await say('220');
    await say('250', 'EHLO cardbuddy.localhost');
    await say('235', 'AUTH PLAIN ' + Buffer.from('\0' + user + '\0' + pass).toString('base64'));
    await say('250', `MAIL FROM:<${from}>`);
    await say('250', `RCPT TO:<${to}>`);
    await say('354', 'DATA');
    // CRLF line ends, and a line starting with "." gets a second one so it can't end the message early.
    const body = text.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
    await say('250', [`From: CardBuddy <${from}>`, `To: <${to}>`, `Subject: ${header(oneLine(subject))}`, `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', body, '.'].join('\r\n'));
    await say('221', 'QUIT');
  } finally { sock.destroy(); }
}
