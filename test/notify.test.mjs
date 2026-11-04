// Hold alerts against a fake mail server on localhost: no Gmail, no real email. Run: node test/notify.test.mjs
import assert from 'node:assert/strict';
import net from 'node:net';
import { notifyHeld, heldMessage } from '../src/notify.mjs';

// A tiny SMTP server: answers each command, keeps what it's sent. acceptAuth false acts like a wrong App Password.
function fakeSmtp(acceptAuth = true) {
  const got = { commands: [], data: '' };
  const server = net.createServer(s => {
    let buf = '', inData = false;
    s.write('220 fake ESMTP\r\n');
    s.on('data', d => {
      buf += d;
      for (let i; (i = buf.indexOf('\r\n')) >= 0;) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) { if (line === '.') { inData = false; s.write('250 OK queued\r\n'); } else got.data += line + '\n'; continue; }
        got.commands.push(line.split(' ')[0]);
        if (line.startsWith('EHLO')) s.write('250-fake\r\n250 AUTH PLAIN\r\n');
        else if (line.startsWith('AUTH')) { got.auth = Buffer.from(line.split(' ')[2], 'base64').toString(); s.write(acceptAuth ? '235 OK\r\n' : '535 Bad credentials\r\n'); }
        else if (line === 'DATA') { inData = true; s.write('354 go\r\n'); }
        else if (line === 'QUIT') { s.write('221 bye\r\n'); s.end(); }
        else s.write('250 OK\r\n');
      }
    });
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok({ got, server, connect: () => net.connect(server.address().port, '127.0.0.1') })));
}

const held = { id: 'h1', purchase: { amount: 1249, description: 'TV', site: 'bestbuy.com' }, store: 'BESTBUY.COM', card: 'Citi Double Cash', percentBack: 2,
  reasons: ['$1,249.00 is over the $100.00 per-purchase limit'] };
const at = 'http://localhost:4242/approvals';

// Off by default: no settings, no email, no connection.
process.env.GMAIL_USER = ''; process.env.GMAIL_APP_PASSWORD = '';
assert.equal(await notifyHeld(held, at, () => { throw new Error('should not connect'); }), false);

// On: the whole conversation, the App Password without its spaces, and a message that says what's waiting.
process.env.GMAIL_USER = 'me@gmail.com'; process.env.GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop'; process.env.ALERT_EMAIL = '';
let f = await fakeSmtp();
assert.equal(await notifyHeld(held, at, f.connect), true);
assert.deepEqual(f.got.commands, ['EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA', 'QUIT']);
assert.equal(f.got.auth, '\0me@gmail.com\0abcdefghijklmnop');
assert.match(f.got.data, /^Subject: Your agent wants to spend \$1,249\.00 at BESTBUY\.COM$/m);
assert.match(f.got.data, /^To: <me@gmail\.com>$/m);
assert.match(f.got.data, /^- \$1,249\.00 is over the \$100\.00 per-purchase limit$/m);
assert.match(f.got.data, /Approve or decline: http:\/\/localhost:4242\/approvals/);
f.server.close();
console.log('  hold alert sent to the fake server:', f.got.commands.join(' → '));

// A wrong App Password is a plain error, not a hang.
f = await fakeSmtp(false);
await assert.rejects(notifyHeld(held, at, f.connect), /didn't accept GMAIL_USER and GMAIL_APP_PASSWORD/);
f.server.close();

// A store name from the agent can't add a header (a Bcc to someone else) or end the message early.
const sneaky = heldMessage({ ...held, store: 'SHOP\r\nBcc: thief@example.com', purchase: { ...held.purchase, description: 'x\n.\nMAIL FROM' } }, at);
assert.doesNotMatch(sneaky.subject, /[\r\n]/);
f = await fakeSmtp();
await notifyHeld({ ...held, store: 'SHOP\r\nBcc: thief@example.com' }, at, f.connect);
assert.doesNotMatch(f.got.data, /^Bcc:/m);
f.server.close();

console.log('notify ok');
