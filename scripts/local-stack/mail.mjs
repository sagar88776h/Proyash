#!/usr/bin/env node
// Local SMTP mail catcher (like Supabase's Inbucket/Mailpit) plus a tiny HTTP
// API used by tests, and the auth email templates for GoTrue.
//   GET    /messages[?to=email]   → captured messages, newest first
//   DELETE /messages              → clear
//   GET    /templates/<name>.html → supabase/templates/<name>.html
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';
import { PORTS, ROOT } from './config.mjs';

const messages = [];

const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  onAuth(_auth, _session, callback) {
    callback(null, { user: 'local' });
  },
  onData(stream, _session, callback) {
    simpleParser(stream)
      .then((mail) => {
        messages.unshift({
          id: messages.length + 1,
          receivedAt: new Date().toISOString(),
          to: (mail.to?.value ?? []).map((a) => a.address?.toLowerCase()),
          subject: mail.subject ?? '',
          html: typeof mail.html === 'string' ? mail.html : '',
          text: mail.text ?? '',
        });
        callback();
      })
      .catch(callback);
  },
});
smtp.on('error', (err) => console.error('smtp error', err.message));
smtp.listen(PORTS.smtp, '127.0.0.1');

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/messages' && req.method === 'GET') {
    const to = url.searchParams.get('to')?.toLowerCase();
    const list = to ? messages.filter((m) => m.to.includes(to)) : messages;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(list));
    return;
  }
  if (url.pathname === '/messages' && req.method === 'DELETE') {
    messages.length = 0;
    res.writeHead(204).end();
    return;
  }
  const template = url.pathname.match(/^\/templates\/([a-z_]+)\.html$/);
  if (template) {
    const file = join(ROOT, 'supabase', 'templates', `${template[1]}.html`);
    if (existsSync(file)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(readFileSync(file));
      return;
    }
  }
  res.writeHead(404).end();
}).listen(PORTS.mailHttp, '127.0.0.1');

console.log(`mail catcher: smtp ${PORTS.smtp}, http ${PORTS.mailHttp}`);
