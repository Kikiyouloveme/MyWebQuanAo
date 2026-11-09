/**
 * Tin nhắn liên hệ từ trang Liên hệ.
 * Lưu vào database để nhân viên xử lý — không dùng `mailto:` vì như vậy phụ thuộc
 * vào ứng dụng email trên máy khách và cửa hàng không có bản ghi nào.
 */

const db = require('../db');
const { v, notFound } = require('../security');

const SUBJECTS = ['product', 'order', 'return', 'other'];
const SUBJECT_LABEL = {
  product: 'Tư vấn sản phẩm / chọn size',
  order: 'Hỗ trợ đơn hàng',
  return: 'Đổi trả / hoàn tiền',
  other: 'Nội dung khác',
};

/* ==================== KHÁCH GỬI ==================== */

const post = async (req, res) => {
  const message = {
    id: db.uid('msg'),
    name: v.str(req.body.name, 'họ tên', { min: 2, max: 80 }),
    email: v.email(req.body.email),
    phone: v.phone(req.body.phone, { required: false }),
    subject: v.oneOf(req.body.subject || 'other', SUBJECTS, 'chủ đề'),
    orderId: v.str(req.body.orderId, 'mã đơn hàng', { required: false, max: 20 }),
    content: v.str(req.body.content, 'nội dung', { min: 10, max: 2000 }),
    status: 'new',
    createdAt: new Date().toISOString(),
  };

  db.messages.insert(message);

  res.status(201).json({
    ok: true,
    message: 'Đã gửi tin nhắn. Chúng tôi sẽ phản hồi qua email trong vòng 1–2 ngày làm việc.',
  });
};

const getSubjects = async (_req, res) => {
  res.json(SUBJECTS.map((value) => ({ value, label: SUBJECT_LABEL[value] })));
};

/* ==================== QUẢN TRỊ ==================== */

const get = async (req, res) => {
  const { status } = req.query;
  let list = db.messages.all();
  if (status) list = list.filter((m) => m.status === status);
  res.json(list.map((m) => ({ ...m, subjectLabel: SUBJECT_LABEL[m.subject] || m.subject })));
};

const putIdStatus = async (req, res) => {
  const message = db.messages.byId(req.params.id);
  if (!message) throw notFound('Không tìm thấy tin nhắn');

  const status = v.oneOf(req.body.status, ['new', 'in_progress', 'resolved'], 'trạng thái');
  db.transaction(() => {
    message.status = status;
    message.handledBy = req.user.id;
    message.handledAt = new Date().toISOString();
  });

  res.json(message);
};

module.exports = { post, getSubjects, get, putIdStatus, SUBJECTS, SUBJECT_LABEL };
