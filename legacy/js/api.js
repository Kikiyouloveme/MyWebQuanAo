/* API client + auth store + giỏ hàng (localStorage) + tiện ích chung */

const API = {
  token: () => localStorage.getItem('mono_token'),
  user: () => { try { return JSON.parse(localStorage.getItem('mono_user')); } catch { return null; } },

  setAuth(token, user) {
    localStorage.setItem('mono_token', token);
    localStorage.setItem('mono_user', JSON.stringify(user));
  },
  clearAuth() {
    localStorage.removeItem('mono_token');
    localStorage.removeItem('mono_user');
  },

  async req(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const t = this.token();
    if (t) headers.Authorization = 'Bearer ' + t;
    const res = await fetch(path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('Lỗi ' + res.status));
    return data;
  },
  get: (p) => API.req(p),
  post: (p, body) => API.req(p, { method: 'POST', body: JSON.stringify(body) }),
  put: (p, body) => API.req(p, { method: 'PUT', body: JSON.stringify(body) }),
  del: (p) => API.req(p, { method: 'DELETE' })
};

/* ---------- tiền tệ ---------- */
const money = (n) => (n || 0).toLocaleString('vi-VN') + '₫';

/* ---------- toast ---------- */
const Toast = {
  el: null, t: null,
  show(msg, isErr) {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'toast';
      this.el.setAttribute('aria-live', 'polite');
      document.body.appendChild(this.el);
    }
    this.el.textContent = msg;
    this.el.classList.toggle('err', !!isErr);
    this.el.classList.add('on');
    clearTimeout(this.t);
    this.t = setTimeout(() => this.el.classList.remove('on'), 2800);
  }
};

/* ---------- giỏ hàng ---------- */
const Cart = {
  read() { try { return JSON.parse(localStorage.getItem('mono_cart')) || []; } catch { return []; } },
  write(items) {
    localStorage.setItem('mono_cart', JSON.stringify(items));
    document.dispatchEvent(new CustomEvent('cart:change'));
  },
  count() { return this.read().reduce((s, i) => s + i.qty, 0); },
  total() { return this.read().reduce((s, i) => s + i.price * i.qty, 0); },
  add(p, size, qty = 1) {
    const items = this.read();
    const key = p.id + '|' + size;
    const found = items.find(i => i.key === key);
    if (found) found.qty += qty;
    else items.push({ key, id: p.id, title: p.title, price: p.price, img: p.img, size, qty });
    this.write(items);
    Toast.show('Đã thêm vào giỏ: ' + p.title);
  },
  setQty(key, qty) {
    let items = this.read();
    const it = items.find(i => i.key === key);
    if (!it) return;
    it.qty = qty;
    if (it.qty <= 0) items = items.filter(i => i.key !== key);
    this.write(items);
  },
  remove(key) { this.write(this.read().filter(i => i.key !== key)); },
  clear() { this.write([]); }
};

const qs = (s, el = document) => el.querySelector(s);
const qsa = (s, el = document) => [...el.querySelectorAll(s)];
const param = (k) => new URLSearchParams(location.search).get(k);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
