import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signS3 } from '../src/main/exporters';

test('S3 signature matches the AWS reference implementation (botocore)', () => {
  const h = signS3({ method: 'PUT', url: 'https://s3.us-east-1.amazonaws.com/my-bucket/quarrix/leads-1.jsonl', region: 'us-east-1', accessKey: 'AKIDEXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', body: Buffer.from('{"a":1}\n'), type: 'application/x-ndjson', date: new Date('2026-11-20T12:00:00Z') });
  assert.equal(h.authorization, 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261120/us-east-1/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=b2439fb7fafe58ac476f36ca03b20eea6ef78f5213059622f3ce73c4183175ac');
});
