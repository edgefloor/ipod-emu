#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';
import { parseArgs } from 'node:util';

try {
  const { values } = parseArgs({ options: {
    key: { type: 'string' }, team: { type: 'string' }, 'key-id': { type: 'string' },
    origin: { type: 'string' }, days: { type: 'string', default: '30' }, help: { type: 'boolean' }
  } });
  if (values.help) {
    console.log('node scripts/generate-developer-token.mjs --key /private/AuthKey.p8 --team TEAM_ID --key-id KEY_ID [--origin https://example.com] [--days 30]');
  } else {
    if (!values.key || !values.team || !values['key-id']) throw new Error('Required: --key, --team, --key-id. Use --help for usage.');
    const days = Number(values.days);
    if (!Number.isFinite(days) || days <= 0 || days > 180) throw new Error('--days must be greater than 0 and at most 180.');
    if (values.origin && new URL(values.origin).origin !== values.origin) throw new Error('--origin must be an exact origin, such as https://example.com (no trailing slash).');
    const key = createPrivateKey(readFileSync(values.key));
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails.namedCurve !== 'prime256v1') throw new Error('Expected an Apple ES256 (P-256) private key.');
    const iat = Math.floor(Date.now() / 1000);
    const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
    const claims = { iss: values.team, iat, exp: iat + Math.floor(days * 86400) };
    if (values.origin) claims.origin = values.origin;
    const message = `${encode({alg:'ES256',kid:values['key-id']})}.${encode(claims)}`;
    console.log(`${message}.${sign('sha256', Buffer.from(message), {key,dsaEncoding:'ieee-p1363'}).toString('base64url')}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
