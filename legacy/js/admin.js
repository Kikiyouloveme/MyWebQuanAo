/* Admin panel: thống kê, CRUD sản phẩm (kèm upload ảnh), đơn hàng, người dùng */

document.addEventListener('DOMContentLoaded', () => {
  const u = API.user();
  const root = qs('#admin-root');
  if (!u || u.role !== 'admin') {
    root.innerHTML = `<div class="wrap" style="padding:70px 0;text-align:center">
      <h1 style="text-transform:uppercase">Khu vực quản trị</h1>
      <p style="margin:14px 0 22px;color:var(--ink-2)">Cần đăng nhập bằng tài khoản admin (admin@mono.local / admin123).</p>
      <a class="btn" href="/account.html">Đăng nhập</a></div>`;
    return;
  }

  root.innerHTML = `
  <div class="wrap">
    <div class="page-head"><h1>Admin</h1></div>
    <div class="admin-layout">
      <nav class="admin-nav" aria-label="Quản trị">
        <button class="on" data-view="dash">Tổng quan</button>
        <button data-view="products">Sản phẩm</button>
        <button data-view="orders">Đơn hàng</button>
        <button data-view="users">Người dùng</button>
      </nav>
      <div id="admin-view"></div>
    </div>
  </div>

  <div class="modal-bg" id="modal-bg">
    <div class="modal">
      <h3 id="modal-title">Sản phẩm</h3>
      <form id="p-form">
        <div class="field"><label>Tên sản phẩm *</label><input id="p-title" required></div>
        <div class="grid2">
          <div class="field"><label>Giá (VND) *</label><input id="p-price" type="number" min="0" required></div>
          <div class="field"><label>Kho</label><input id="p-stock" type="number" min="0" value="50"></div>
          <div class="field"><label>Danh mục</label>
            <select id="p-cat">
              <option value="tops">Tops</option><option value="bottoms">Bottoms</option>
              <option value="outerwear">Outerwear</option><option value="accessories">Accessories</option>
            </select></div>
          <div class="field"><label>Màu</label><input id="p-color"></div>
          <div class="field"><label>Badge</label><input id="p-badge" placeholder="New / Best Seller…"></div>
          <div class="field"><label>Sizes (phẩy)</label><input id="p-sizes" value="S,M,L,XL"></div>
        </div>
        <div class="field"><label>Ảnh chính (URL hoặc upload)</label><input id="p-img" placeholder="/assets/img/p/placeholder.svg">
          <input id="p-file" type="file" accept="image/*" style="margin-top:8px;border:0;padding:0"></div>
        <div class="field"><label>Mô tả</label><textarea id="p-desc" rows="3"></textarea></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="modal-cancel">Hủy</button>
          <button class="btn btn-sm" id="p-save">Lưu</button>
        </div>
      </form>
    </div>
  </div>`;

  const view = qs('#admin-view');
  let editingId = null;

  const VIEWS = {
    /* ---------- tổng quan ---------- */
    async dash() {
      const s = await API.get('/api/admin/stats');
      view.innerHTML = `
      <div class="stats">
        <div class="stat"><b>${s.products}</b><span>Sản phẩm</span></div>
        <div class="stat"><b>${s.orders}</b><span>Đơn hàng</span></div>
        <div class="stat"><b>${s.users}</b><span>Người dùng</span></div>
        <div class="stat"><b>${money(s.revenue)}</b><span>Doanh thu (đã TT)</span></div>
      </div>
      <p style="color:var(--ink-2);font-size:13px">Dữ liệu lưu tại <code>server/data/db.json</code>. Chạy <code>npm run seed</code> để reset về mặc định.</p>`;
    },

    /* ---------- sản phẩm ---------- */
    async products() {
      const list = await API.get('/api/products?sort=newest');
      view.innerHTML = `
      <div style="margin-bottom:14px"><button class="btn btn-sm" id="p-new">+ Thêm sản phẩm</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Ảnh</th><th>Tên</th><th>Giá</th><th>Danh mục</th><th>Kho</th><th></th></tr></thead>
        <tbody>${list.map(p => `
          <tr>
            <td><img src="${p.img}" alt=""></td>
            <td>${esc(p.title)}</td>
            <td>${money(p.price)}</td>
            <td>${esc(p.cat)}</td>
            <td>${p.stock}</td>
            <td class="tbl-actions">
              <button data-edit="${p.id}">Sửa</button>
              <button class="del" data-del="${p.id}">Xóa</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>`;

      qs('#p-new').addEventListener('click', () => openModal());
      qsa('[data-edit]').forEach(b => b.addEventListener('click', () => {
        openModal(list.find(p => p.id === b.dataset.edit));
      }));
      qsa('[data-del]').forEach(b => b.addEventListener('click', async () => {
        const p = list.find(x => x.id === b.dataset.del);
        if (!confirm(`Xóa "${p.title}"? Hành động không thể hoàn tác.`)) return;
        try { await API.del('/api/products/' + p.id); Toast.show('Đã xóa sản phẩm'); VIEWS.products(); }
        catch (err) { Toast.show(err.message, true); }
      }));
    },

    /* ---------- đơn hàng ---------- */
    async orders() {
      const list = await API.get('/api/admin/orders');
      const S = { new: 'Mới', confirmed: 'Đã xác nhận', shipping: 'Đang giao', done: 'Hoàn tất', cancelled: 'Đã hủy' };
      const PS = { pending: 'Chờ TT', paid: 'Đã TT', failed: 'TT thất bại' };
      view.innerHTML = list.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Mã</th><th>Khách</th><th>Sản phẩm</th><th>Tổng</th><th>Thanh toán</th><th>Trạng thái</th></tr></thead>
        <tbody>${list.map(o => `
          <tr>
            <td><b>${o.id}</b><br><small style="color:var(--ink-2)">${new Date(o.createdAt).toLocaleString('vi-VN')}</small></td>
            <td>${esc(o.customer.name)}<br><small style="color:var(--ink-2)">${esc(o.customer.phone)}</small></td>
            <td style="max-width:240px">${o.items.map(i => esc(i.title) + ' ×' + i.qty).join('<br>')}</td>
            <td><b>${money(o.total)}</b><br><small>${o.payMethod === 'cod' ? 'COD' : 'Gateway'}</small></td>
            <td><select data-pay="${o.id}">${Object.entries(PS).map(([k, v]) => `<option value="${k}" ${o.payStatus === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
            <td><select data-status="${o.id}">${Object.entries(S).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<p style="color:var(--ink-2)">Chưa có đơn hàng nào.</p>';

      qsa('[data-status]').forEach(s => s.addEventListener('change', async () => {
        try { await API.put('/api/admin/orders/' + s.dataset.status, { status: s.value }); Toast.show('Đã cập nhật trạng thái'); }
        catch (err) { Toast.show(err.message, true); }
      }));
      qsa('[data-pay]').forEach(s => s.addEventListener('change', async () => {
        try { await API.put('/api/admin/orders/' + s.dataset.pay, { payStatus: s.value }); Toast.show('Đã cập nhật thanh toán'); }
        catch (err) { Toast.show(err.message, true); }
      }));
    },

    /* ---------- người dùng ---------- */
    async users() {
      const list = await API.get('/api/admin/users');
      view.innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr><th>Tên</th><th>Email</th><th>Vai trò</th><th>Tạo lúc</th></tr></thead>
        <tbody>${list.map(x => `
          <tr><td>${esc(x.name)}</td><td>${esc(x.email)}</td>
          <td><span class="pill ${x.role === 'admin' ? 'confirmed' : 'pending'}">${x.role}</span></td>
          <td>${new Date(x.createdAt).toLocaleDateString('vi-VN')}</td></tr>`).join('')}</tbody>
      </table></div>`;
    }
  };

  function openModal(p) {
    editingId = p ? p.id : null;
    qs('#modal-title').textContent = p ? 'Sửa sản phẩm' : 'Thêm sản phẩm';
    qs('#p-title').value = p ? p.title : '';
    qs('#p-price').value = p ? p.price : '';
    qs('#p-stock').value = p ? p.stock : 50;
    qs('#p-cat').value = p ? p.cat : 'tops';
    qs('#p-color').value = p ? (p.color || '') : '';
    qs('#p-badge').value = p ? (p.badge || '') : '';
    qs('#p-sizes').value = p ? p.sizes.join(',') : 'S,M,L,XL';
    qs('#p-img').value = p ? p.img : '';
    qs('#p-desc').value = p ? (p.desc || '') : '';
    qs('#p-file').value = '';
    qs('#modal-bg').classList.add('on');
  }
  qs('#modal-cancel').addEventListener('click', () => qs('#modal-bg').classList.remove('on'));
  qs('#modal-bg').addEventListener('click', (e) => { if (e.target.id === 'modal-bg') qs('#modal-bg').classList.remove('on'); });

  qs('#p-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = qs('#p-save');
    btn.disabled = true;
    try {
      let img = qs('#p-img').value.trim();
      const file = qs('#p-file').files[0];
      if (file) {
        const fd = new FormData();
        fd.append('image', file);
        const r = await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + API.token() }, body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Upload thất bại');
        img = d.url;
      }
      const body = {
        title: qs('#p-title').value.trim(),
        price: +qs('#p-price').value,
        stock: +qs('#p-stock').value,
        cat: qs('#p-cat').value,
        color: qs('#p-color').value.trim(),
        badge: qs('#p-badge').value.trim() || null,
        sizes: qs('#p-sizes').value.split(',').map(s => s.trim()).filter(Boolean),
        desc: qs('#p-desc').value.trim()
      };
      if (img) { body.img = img; body.img2 = img; }
      if (editingId) await API.put('/api/products/' + editingId, body);
      else await API.post('/api/products', body);
      qs('#modal-bg').classList.remove('on');
      Toast.show(editingId ? 'Đã cập nhật sản phẩm' : 'Đã thêm sản phẩm');
      VIEWS.products();
    } catch (err) { Toast.show(err.message, true); }
    btn.disabled = false;
  });

  qsa('.admin-nav button').forEach(b => b.addEventListener('click', () => {
    qsa('.admin-nav button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    VIEWS[b.dataset.view]().catch(err => { view.innerHTML = `<p>${esc(err.message)}</p>`; });
  }));

  VIEWS.dash().catch(err => { view.innerHTML = `<p>${esc(err.message)}</p>`; });
});
