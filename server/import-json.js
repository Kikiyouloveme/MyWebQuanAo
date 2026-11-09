/** One-time import; never modifies the source JSON or a nonempty target database. */
require('./config');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');

async function main() {
  const source = path.resolve(process.argv[2] || path.join(__dirname, 'data', 'db.json'));
  const data = JSON.parse(fs.readFileSync(source, 'utf8'));
  if (data.schemaVersion !== db.SCHEMA_VERSION) {
    throw new Error(`Chỉ nhập JSON schema v${db.SCHEMA_VERSION}; hãy nâng cấp bản cũ trước.`);
  }
  const collections = ['users', 'products', 'orders', 'vouchers', 'returns', 'otps', 'emails', 'messages'];
  for (const name of collections) {
    if (!Array.isArray(data[name])) throw new Error(`Thiếu collection ${name} trong JSON nguồn.`);
  }
  if (!Number.isSafeInteger(data.counters?.order) || !Number.isSafeInteger(data.counters?.return)) {
    throw new Error('Counters trong JSON không hợp lệ.');
  }
  await db.connect();
  await db.run(() => {
    const target = db.load();
    if (Object.keys(db.models).filter((name) => name !== 'metadata').some((name) => target[name].length)) {
      throw new Error('Database đích đã có dữ liệu. Không nhập để tránh ghi đè/trùng dữ liệu.');
    }
    for (const name of collections) target[name] = data[name];
    target.schemaVersion = data.schemaVersion;
    target.counters = data.counters;
  });
  console.log('Đã nhập dữ liệu vào MongoDB. File JSON nguồn được giữ nguyên.');
  console.log(collections.map((name) => `${name}: ${data[name].length}`).join(', '));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => db.close());
