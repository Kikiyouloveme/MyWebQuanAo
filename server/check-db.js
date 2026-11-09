require('./config');
const db = require('./db');
async function main() {
  await db.connect();
  console.log(JSON.stringify(db.status(), null, 2));
  for (const name of ['users', 'products', 'orders', 'vouchers']) {
    console.log(`${name}: ${await db.models[name].countDocuments()}`);
  }
}
main().catch(() => {
  console.error('Không kết nối được MongoDB. Kiểm tra service MongoDB và MONGO_URI trong .env.');
  process.exitCode = 1;
}).finally(() => db.close());
