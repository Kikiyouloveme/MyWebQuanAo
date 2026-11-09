const { v, badRequest } = require('./security');
const provinces = require('./catalog/vietnam-divisions.json');

function validateContact(body) {
  const fullName = v.str(body.fullName, 'họ tên', { min: 2, max: 80 });
  if (!/^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(fullName)) {
    throw badRequest('Họ tên chỉ được chứa chữ, khoảng trắng, dấu nháy hoặc dấu gạch nối');
  }
  return { fullName, phone: v.phone(body.phone), email: v.email(body.email) };
}

function validateAddress(body) {
  const contact = validateContact(body);
  const province = provinces.find((p) => String(p.code) === String(body.provinceCode));
  const ward = province?.wards.find((w) => String(w.code) === String(body.wardCode));
  if (!province || !ward) throw badRequest('Vui lòng chọn tỉnh/thành và phường/xã hợp lệ');
  return {
    fullName: contact.fullName, phone: contact.phone,
    provinceCode: province.code, wardCode: ward.code,
    province: province.name, district: '', ward: ward.name,
    line1: v.str(body.line1, 'số nhà, tên đường', { min: 3, max: 200 }),
    note: v.str(body.note, 'ghi chú', { required: false, max: 200 }),
  };
}

module.exports = { provinces, validateContact, validateAddress };
