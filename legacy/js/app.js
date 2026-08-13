/* Logic từng trang — chọn theo body[data-page] */

function cardHTML(p) {
  const out = p.stock <= 0;
  return `
  <article class="card">
    ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}
    ${out ? '<span class="badge out">Hết hàng</span>' : ''}
    <a class="card-media" href="/product.html?id=${p.id}">
      <img class="front" src="${p.img}" alt="${esc(p.title)}" loading="lazy">
      <img class="back" src="${p.img2 || p.img}" alt="" loading="lazy">
      ${out ? '' : `<button class="quick-add" data-qadd="${p.id}" aria-label="Thêm nhanh vào giỏ">+</button>`}
    </a>
    <div class="card-body">
      <a class="card-title" href="/product.html?id=${p.id}">${esc(p.title)}</a>
      <span class="card-meta">${esc(p.color || '')}</span>
      <span class="card-price">${money(p.price)}</span>
    </div>
  </article>`;
}

function skeletons(n) {
  return Array.from({ length: n }, () => '<div class="card"><div class="skel skel-card"></div></div>').join('');
}

/* Quick add: thêm size đầu tiên */
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-qadd]');
  if (!b) return;
  e.preventDefault();
  try {
    const p = await API.get('/api/products/' + b.dataset.qadd);
    Cart.add(p, p.sizes[0], 1);
  } catch (err) { Toast.show(err.message, true); }
});

const PAGES = {

  /* ================= TRANG CHỦ ================= */
  async home() {
    const grid = qs('#home-grid');
    grid.innerHTML = skeletons(8);
    try {
      const list = await API.get('/api/products?sort=newest&limit=8');
      grid.innerHTML = list.map(cardHTML).join('') || '<p style="padding:20px">Chưa có sản phẩm.</p>';
    } catch (err) { grid.innerHTML = `<p style="padding:20px">${esc(err.message)}</p>`; }
  },

  /* ================= SHOP ================= */
  async shop() {
    const grid = qs('#shop-grid');
    const state = { cat: param('cat') || 'all', sort: 'newest', q: '' };
    qsa('input[name=cat]').forEach(r => { r.checked = r.value === state.cat; });

    async function loadList() {
      grid.innerHTML = skeletons(6);
      try {
        const url = `/api/products?cat=${state.cat}&sort=${state.sort}` + (state.q ? '&q=' + encodeURIComponent(state.q) : '');
        const list = await API.get(url);
        qs('#shop-count').textContent = list.length + ' sản phẩm';
        grid.innerHTML = list.map(cardHTML).join('') || '<p style="padding:20px">Không có sản phẩm phù hợp.</p>';
      } catch (err) { grid.innerHTML = `<p style="padding:20px">${esc(err.message)}</p>`; }
    }

    qsa('input[name=cat]').forEach(r => r.addEventListener('change', () => {
      state.cat = r.value;
      history.replaceState(null, '', state.cat === 'all' ? '/shop.html' : '/shop.html?cat=' + state.cat);
      loadList();
    }));
    qs('#sort').addEventListener('change', e => { state.sort = e.target.value; loadList(); });
    let t;
    qs('#search').addEventListener('input', e => {
      clearTimeout(t);
      t = setTimeout(() => { state.q = e.target.value.trim(); loadList(); }, 300);
    });
    qs('#filter-toggle').addEventListener('click', () => qs('#filters').classList.toggle('on'));
    loadList();
  },

  /* ================= CHI TIẾT SẢN PHẨM ================= */
  async product() {
    const id = param('id');
    const root = qs('#pdp-root');
    let p;
    try { p = await API.get('/api/products/' + id); }
    catch { root.innerHTML = '<div class="wrap" style="padding:60px 0"><h1>Không tìm thấy sản phẩm.</h1></div>'; return; }

    document.title = p.title + ' — MONO. Studio';
    const out = p.stock <= 0;
    root.innerHTML = `
    <div class="wrap">
      <div class="page-head"><div class="crumbs"><a href="/index.html">Trang chủ</a> / <a href="/shop.html">Shop</a> / ${esc(p.title)}</div></div>
      <div class="pdp">
        <div class="pdp-gallery">
          <div class="stage"><img id="stage-img" src="${p.img}" alt="${esc(p.title)}"></div>
          <div class="thumbs">
            <img src="${p.img}" class="on" data-full="${p.img}" alt="Ảnh 1">
            <img src="${p.img2 || p.img}" data-full="${p.img2 || p.img}" alt="Ảnh 2">
          </div>
        </div>
        <div class="pdp-info">
          <h1>${esc(p.title)}</h1>
          <div class="pdp-price">${money(p.price)}</div>
          <div class="pdp-meta">Màu: ${esc(p.color || '—')} · Kho: ${out ? 'Hết hàng' : p.stock + ' sản phẩm'}</div>
          <div class="opt-label">Chọn size</div>
          <div class="size-picker" id="sizes">${p.sizes.map((s, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-size="${esc(s)}">${esc(s)}</button>`).join('')}</div>
          <div class="pdp-actions">
            <span class="qty"><button id="q-dec" aria-label="Giảm">−</button><span id="q-val">1</span><button id="q-inc" aria-label="Tăng">+</button></span>
            <button class="btn" id="add-cart" ${out ? 'disabled' : ''}>${out ? 'Hết hàng' : 'Thêm vào giỏ'}</button>
          </div>
          <div class="pdp-desc">${esc(p.desc || '')}</div>
        </div>
      </div>
    </div>`;

    let qty = 1, size = p.sizes[0];
    qs('#q-dec').addEventListener('click', () => { qty = Math.max(1, qty - 1); qs('#q-val').textContent = qty; });
    qs('#q-inc').addEventListener('click', () => { qty = Math.min(99, qty + 1); qs('#q-val').textContent = qty; });
    qsa('#sizes button').forEach(b => b.addEventListener('click', () => {
      qsa('#sizes button').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); size = b.dataset.size;
    }));
    qsa('.thumbs img').forEach(t => t.addEventListener('click', () => {
      qsa('.thumbs img').forEach(x => x.classList.remove('on'));
      t.classList.add('on');
      qs('#stage-img').src = t.dataset.full;
    }));
    if (!out) qs('#add-cart').addEventListener('click', () => { Cart.add(p, size, qty); openDrawer('#cart-drawer'); });
  },

  /* ================= CHECKOUT ================= */
  checkout() {
    const items = Cart.read();
    const sumEl = qs('#sum-items');
    function renderSummary() {
      const sub = Cart.total();
      const ship = sub >= 500000 ? 0 : (sub ? 30000 : 0);
      sumEl.innerHTML = Cart.read().map(i =>
        `<div class="row"><span>${esc(i.title)} (${esc(i.size)}) ×${i.qty}</span><span>${money(i.price * i.qty)}</span></div>`).join('');
      qs('#sum-sub').textContent = money(sub);
      qs('#sum-ship').textContent = ship ? money(ship) : 'Miễn phí';
      qs('#sum-total').textContent = money(sub + ship);
    }
    if (!items.length) {
      qs('#checkout-root').innerHTML = '<div class="cart-empty" style="padding:80px 0">Giỏ hàng trống. <a href="/shop.html" style="text-decoration:underline">Mua sắm ngay</a></div>';
      return;
    }
    renderSummary();
    document.addEventListener('cart:change', renderSummary);

    // điền sẵn nếu đã đăng nhập
    const u = API.user();
    if (u) { qs('#f-name').value = u.name; qs('#f-email').value = u.email; }

    qs('#checkout-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = qs('#place-order');
      const customer = {
        name: qs('#f-name').value.trim(),
        phone: qs('#f-phone').value.trim(),
        email: qs('#f-email').value.trim(),
        address: qs('#f-address').value.trim(),
        note: qs('#f-note').value.trim()
      };
      let ok = true;
      [['#f-name', customer.name], ['#f-phone', customer.phone], ['#f-address', customer.address]].forEach(([sel, v]) => {
        const field = qs(sel).closest('.field');
        field.classList.toggle('invalid', !v);
        if (!v) ok = false;
      });
      if (!ok) { Toast.show('Vui lòng điền đủ thông tin bắt buộc', true); return; }

      const payMethod = qs('input[name=pay]:checked').value;
      btn.disabled = true; btn.textContent = 'Đang xử lý…';
      try {
        const order = await API.post('/api/orders', {
          items: Cart.read().map(i => ({ id: i.id, qty: i.qty, size: i.size })),
          customer, payMethod
        });
        Cart.clear();
        if (payMethod === 'gateway') location.href = '/payment.html?order=' + order.id;
        else location.href = '/payment.html?order=' + order.id + '&cod=1';
      } catch (err) {
        Toast.show(err.message, true);
        btn.disabled = false; btn.textContent = 'Đặt hàng';
      }
    });
  },

  /* ================= PAYMENT (mock gateway) ================= */
  async payment() {
    const id = param('order');
    const root = qs('#gateway-root');
    let order;
    try { order = await API.get('/api/orders/' + id); }
    catch { root.innerHTML = '<div class="panel"><h2>Không tìm thấy đơn hàng</h2></div>'; return; }

    const orderInfo = `
      <div class="badge-demo">Demo gateway — không thu tiền thật</div>
      <h2>Đơn hàng ${order.id}</h2>
      <div class="amount">${money(order.total)}</div>
      <p style="color:var(--ink-2);font-size:13px">${order.items.length} sản phẩm · Giao tới: ${esc(order.customer.address)}</p>`;

    if (param('cod') || order.payMethod === 'cod') {
      root.innerHTML = `<div class="panel">${orderInfo}
        <p style="margin-top:18px">✅ Đặt hàng thành công! Bạn thanh toán khi nhận hàng (COD).</p>
        <div class="actions">
          <a class="btn" href="/shop.html">Tiếp tục mua sắm</a>
          <a class="btn btn-ghost" href="/account.html">Theo dõi đơn hàng</a>
        </div></div>`;
      return;
    }
    if (order.payStatus === 'paid') {
      root.innerHTML = `<div class="panel">${orderInfo}<p style="margin-top:18px">✅ Đơn này đã thanh toán.</p>
        <div class="actions"><a class="btn" href="/account.html">Xem đơn hàng</a></div></div>`;
      return;
    }
    root.innerHTML = `<div class="panel">${orderInfo}
      <p style="margin-top:14px;font-size:13px;color:var(--ink-2)">Đây là cổng thanh toán giả lập (thay cho VNPay/Stripe). Chọn kết quả để mô phỏng callback:</p>
      <div class="actions">
        <button class="btn btn-accent" id="pay-ok">Thanh toán thành công</button>
        <button class="btn btn-ghost" id="pay-fail">Giả lập thất bại</button>
      </div></div>`;
    qs('#pay-ok').addEventListener('click', async () => {
      const o = await API.post('/api/payment/confirm', { orderId: id, result: 'success' });
      root.innerHTML = `<div class="panel"><h2>✅ Thanh toán thành công</h2>
        <div class="amount">${money(o.total)}</div><p>Đơn ${o.id} đã được xác nhận.</p>
        <div class="actions"><a class="btn" href="/shop.html">Tiếp tục mua sắm</a><a class="btn btn-ghost" href="/account.html">Xem đơn hàng</a></div></div>`;
    });
    qs('#pay-fail').addEventListener('click', async () => {
      await API.post('/api/payment/confirm', { orderId: id, result: 'fail' });
      root.innerHTML = `<div class="panel"><h2 style="color:var(--bad)">✕ Thanh toán thất bại</h2>
        <p>Giao dịch bị hủy (mô phỏng). Đơn ${order.id} vẫn ở trạng thái chờ thanh toán.</p>
        <div class="actions"><a class="btn" href="/payment.html?order=${order.id}">Thử lại</a></div></div>`;
    });
  },

  /* ================= ACCOUNT ================= */
  async account() {
    const root = qs('#acc-root');
    const u = API.user();

    if (!u) {
      root.innerHTML = `
      <div class="form-page">
        <div class="acc-tabs"><button class="on" data-tab="login">Đăng nhập</button><button data-tab="register">Đăng ký</button></div>
        <div class="panel" id="tab-login">
          <h2>Đăng nhập</h2>
          <form id="login-form" novalidate>
            <div class="field"><label for="l-email">Email</label><input id="l-email" type="email" autocomplete="email" required></div>
            <div class="field"><label for="l-pass">Mật khẩu</label><input id="l-pass" type="password" autocomplete="current-password" required></div>
            <button class="btn" style="width:100%">Đăng nhập</button>
          </form>
          <div class="demo-hint">Tài khoản demo:<br>Admin — <b>admin@mono.local / admin123</b><br>Khách — <b>demo@mono.local / demo123</b></div>
        </div>
        <div class="panel" id="tab-register" style="display:none">
          <h2>Đăng ký</h2>
          <form id="reg-form" novalidate>
            <div class="field"><label for="r-name">Họ tên</label><input id="r-name" autocomplete="name" required></div>
            <div class="field"><label for="r-email">Email</label><input id="r-email" type="email" autocomplete="email" required></div>
            <div class="field"><label for="r-pass">Mật khẩu (≥6 ký tự)</label><input id="r-pass" type="password" autocomplete="new-password" required></div>
            <button class="btn" style="width:100%">Tạo tài khoản</button>
          </form>
        </div>
      </div>`;

      qsa('.acc-tabs button').forEach(b => b.addEventListener('click', () => {
        qsa('.acc-tabs button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        qs('#tab-login').style.display = b.dataset.tab === 'login' ? '' : 'none';
        qs('#tab-register').style.display = b.dataset.tab === 'register' ? '' : 'none';
      }));
      qs('#login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const r = await API.post('/api/auth/login', { email: qs('#l-email').value, password: qs('#l-pass').value });
          API.setAuth(r.token, r.user);
          location.reload();
        } catch (err) { Toast.show(err.message, true); }
      });
      qs('#reg-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const r = await API.post('/api/auth/register', { name: qs('#r-name').value, email: qs('#r-email').value, password: qs('#r-pass').value });
          API.setAuth(r.token, r.user);
          Toast.show('Đăng ký thành công!');
          location.reload();
        } catch (err) { Toast.show(err.message, true); }
      });
      return;
    }

    // đã đăng nhập → hồ sơ + đơn hàng
    root.innerHTML = `
    <div class="wrap" style="padding-bottom:90px">
      <div class="page-head"><h1>Tài khoản</h1></div>
      <p style="margin-bottom:6px">Xin chào, <b>${esc(u.name)}</b> (${esc(u.email)}) ${u.role === 'admin' ? '· <a href="/admin.html" style="color:var(--accent);font-weight:700">Vào Admin panel →</a>' : ''}</p>
      <button class="btn btn-ghost btn-sm" id="logout" style="margin:10px 0 30px">Đăng xuất</button>
      <h2 style="text-transform:uppercase;font-size:20px;margin-bottom:16px">Đơn hàng của tôi</h2>
      <div id="orders">Đang tải…</div>
    </div>`;
    qs('#logout').addEventListener('click', () => { API.clearAuth(); location.reload(); });

    try {
      const orders = await API.get('/api/orders/mine');
      qs('#orders').innerHTML = orders.length ? orders.map(o => `
        <div class="order-card">
          <div class="oc-head">
            <b>${o.id}</b>
            <span>
              <span class="pill ${o.status}">${{ new: 'Mới', confirmed: 'Đã xác nhận', shipping: 'Đang giao', done: 'Hoàn tất', cancelled: 'Đã hủy' }[o.status] || o.status}</span>
              <span class="pill ${o.payStatus}">${{ pending: 'Chờ thanh toán', paid: 'Đã thanh toán', failed: 'Thất bại' }[o.payStatus] || o.payStatus}</span>
            </span>
          </div>
          <div class="items">${o.items.map(i => esc(i.title) + ' ×' + i.qty).join(' · ')}</div>
          <div style="margin-top:8px;font-family:var(--font-d);font-weight:700">${money(o.total)} <span style="color:var(--ink-2);font-weight:400;font-size:12px">· ${new Date(o.createdAt).toLocaleString('vi-VN')}</span></div>
        </div>`).join('')
        : '<p style="color:var(--ink-2)">Chưa có đơn hàng nào. Đơn đặt khi chưa đăng nhập sẽ không hiện ở đây.</p>';
    } catch (err) {
      qs('#orders').innerHTML = `<p>${esc(err.message)}</p>`;
      if (/hết hạn/.test(err.message)) { API.clearAuth(); }
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (PAGES[page]) PAGES[page]();
});
