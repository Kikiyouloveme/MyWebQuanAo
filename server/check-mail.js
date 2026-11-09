const config=require('./config');
async function main(){
  const missing=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','SMTP_FROM'].filter(k=>!process.env[k]);
  if(missing.length){console.log('Email thật chưa cấu hình. Thiếu: '+missing.join(', '));console.log('Outbox development chỉ lưu nội bộ, không gửi vào hộp thư. Điền .env trên máy, không gửi mật khẩu qua chat.');process.exitCode=1;return;}
  const mongoose=require('mongoose');await mongoose.connect(config.mongoUri);try{const hello=await mongoose.connection.db.admin().command({hello:1});if(!hello.setName){console.log('Cần MongoDB replica set để commit OTP và SMTP outbox cùng transaction.');process.exitCode=1;return;}}finally{await mongoose.disconnect();}
  const transport=require('nodemailer').createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT),secure:Number(process.env.SMTP_PORT)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:10000});
  try{await transport.verify();console.log('SMTP kết nối và xác thực thành công. Chưa gửi thư kiểm thử; dùng Gửi lại mã trên website.');}finally{transport.close();}
}
main().catch(e=>{console.error('Kiểm tra email thất bại:',e.code||e.name);process.exitCode=1;});
