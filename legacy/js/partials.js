/* Header / footer / drawer dùng chung — inject vào mọi trang */

const NAV = [
  { href: '/shop.html', label: 'Shop' },
  { href: '/shop.html?cat=tops', label: 'Tops' },
  { href: '/shop.html?cat=bottoms', label: 'Bottoms' },
  { href: '/shop.html?cat=outerwear', label: 'Outerwear' },
  { href: '/shop.html?cat=accessories', label: 'Accessories' },
  { href: '/news.html', label: 'News' },
  { href: '/about.html', label: 'About' }
];

const ICONS = {
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M6 8h12l1 13H5L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>'
};

function renderHeader() {
  const u = API.user();
  const el = document.createElement('div');
  el.innerHTML = `
  <div class="ticker" aria-hidden="true">
    <div class="ticker-track">
      ${'<span>Freeship đơn từ 500K</span><span>Bộ sưu tập FW26 đã lên kệ</span><span>Đổi trả trong 7 ngày</span><span>MONO. Studio — Wear the basics well</span>'.repeat(2)}
    </div>
  </div>
  <header class="header">
    <div class="wrap header-inner">
      <button class="burger" id="burger" aria-label="Mở menu"><span></span><span></span><span></span></button>
      <a class="logo" href="/index.html">MONO<em>.</em></a>
      <nav class="nav-main" aria-label="Chính">
        ${NAV.map(n => `<a class="nav-link" href="${n.href}">${n.label}</a>`).join('')}
        ${u && u.role === 'admin' ? '<a class="nav-link" style="color:var(--accent)" href="/admin.html">Admin</a>' : ''}
      </nav>
      <div class="nav-utils">
        <a class="icon-btn" href="/account.html" aria-label="Tài khoản" title="${u ? esc(u.name) : 'Đăng nhập'}">${ICONS.user}</a>
        <button class="icon-btn" id="cart-open" aria-label="Giỏ hàng">${ICONS.bag}<span class="cart-count" id="cart-count">0</span></button>
      </div>
    </div>
  </header>

  <div class="overlay" id="overlay"></div>

  <aside class="mobile-menu" id="mobile-menu" aria-label="Menu di động">
    <div class="drawer-head"><h3>Menu</h3><button class="drawer-close" data-close aria-label="Đóng">×</button></div>
    <nav>
      ${NAV.map(n => `<a href="${n.href}">${n.label}</a>`).join('')}
      <a href="/account.html">${u ? 'Tài khoản (' + esc(u.name) + ')' : 'Đăng nhập / Đăng ký'}</a>
      ${u && u.role === 'admin' ? '<a href="/admin.html" style="color:var(--accent)">Admin panel</a>' : ''}
    </nav>
  </aside>

  <aside class="drawer" id="cart-drawer" aria-label="Giỏ hàng">
    <div class="drawer-head"><h3>Giỏ hàng</h3><button class="drawer-close" data-close aria-label="Đóng">×</button></div>
    <div class="drawer-body" id="cart-body"></div>
    <div class="drawer-foot">
      <div class="row"><span>Tạm tính</span><b id="cart-total">0₫</b></div>
      <a class="btn" href="/checkout.html" id="cart-checkout">Thanh toán</a>
    </div>
  </aside>`;
  document.body.prepend(el);
}

function renderFooter() {
  const f = document.createElement('div');
  f.innerHTML = `
  <section class="big-cta">
    <div class="wrap">
      <h2>Wear the basics <em>well</em></h2>
      <p>Đăng ký thành viên để nhận ưu đãi 10% cho đơn đầu tiên và cập nhật drop mới sớm nhất.</p>
      <a class="btn btn-accent" href="/account.html">Tạo tài khoản</a>
    </div>
  </section>
  <footer class="footer">
    <div class="wrap">
      <div class="footer-grid">
        <div class="about-col">
          <a class="logo" href="/index.html">MONO<em>.</em></a>
          <p>Thương hiệu thời trang cơ bản đề cao chất liệu và phom dáng. Đây là dự án demo full-stack — mọi sản phẩm là mockup.</p>
        </div>
        <div>
          <h4>Mua sắm</h4>
          <ul>
            <li><a href="/shop.html?cat=tops">Áo</a></li>
            <li><a href="/shop.html?cat=bottoms">Quần</a></li>
            <li><a href="/shop.html?cat=outerwear">Khoác</a></li>
            <li><a href="/shop.html?cat=accessories">Phụ kiện</a></li>
          </ul>
        </div>
        <div>
          <h4>Hỗ trợ</h4>
          <ul>
            <li><a href="/contact.html">Liên hệ</a></li>
            <li><a href="/about.html">Về chúng tôi</a></li>
            <li><a href="/news.html">Tin tức</a></li>
            <li><a href="/account.html">Theo dõi đơn hàng</a></li>
          </ul>
        </div>
        <div>
          <h4>Liên hệ</h4>
          <ul>
            <li>Demo Studio, Quận 1, TP.HCM</li>
            <li><a href="mailto:hello@mono.local">hello@mono.local</a></li>
            <li>1900 000 000</li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© 2026 MONO. Studio — dự án demo, không bán hàng thật.</span>
        <span>Node.js · Express · JWT · JSON DB</span>
      </div>
    </div>
  </footer>
  <button class="totop" id="totop" aria-label="Lên đầu trang">↑</button>`;
  document.body.appendChild(f);
}

/* ---------- cart drawer ---------- */
function renderCart() {
  qs('#cart-count').textContent = Cart.count();
  const body = qs('#cart-body');
  const items = Cart.read();
  qs('#cart-total').textContent = money(Cart.total());
  qs('#cart-checkout').style.display = items.length ? '' : 'none';
  if (!items.length) {
    body.innerHTML = '<div class="cart-empty">Giỏ hàng trống.<br><a class="btn btn-ghost btn-sm" style="margin-top:14px" href="/shop.html">Mua sắm ngay</a></div>';
    return;
  }
  body.innerHTML = items.map(i => `
    <div class="line-item">
      <img src="${i.img}" alt="${esc(i.title)}">
      <div>
        <h5>${esc(i.title)}</h5>
        <small>Size: ${esc(i.size)}</small>
        <span class="qty">
          <button data-dec="${i.key}" aria-label="Giảm">−</button><span>${i.qty}</span><button data-inc="${i.key}" aria-label="Tăng">+</button>
        </span>
        <a class="rm" href="#" data-rm="${i.key}">Xóa</a>
      </div>
      <div class="price">${money(i.price * i.qty)}</div>
    </div>`).join('');
}

function openDrawer(id) {
  qs('#overlay').classList.add('on');
  qs(id).classList.add('on');
  document.body.classList.add('no-scroll');
}
function closeDrawers() {
  qs('#overlay').classList.remove('on');
  qsa('.drawer.on, .mobile-menu.on').forEach(e => e.classList.remove('on'));
  document.body.classList.remove('no-scroll');
}

document.addEventListener('DOMContentLoaded', () => {
  renderHeader();
  renderFooter();
  renderCart();

  document.addEventListener('cart:change', renderCart);
  qs('#cart-open').addEventListener('click', () => openDrawer('#cart-drawer'));
  qs('#burger').addEventListener('click', () => openDrawer('#mobile-menu'));
  qs('#overlay').addEventListener('click', closeDrawers);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawers(); });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeDrawers();
    const dec = e.target.closest('[data-dec]'); if (dec) Cart.setQty(dec.dataset.dec, Cart.read().find(i => i.key === dec.dataset.dec).qty - 1);
    const inc = e.target.closest('[data-inc]'); if (inc) Cart.setQty(inc.dataset.inc, Cart.read().find(i => i.key === inc.dataset.inc).qty + 1);
    const rm = e.target.closest('[data-rm]'); if (rm) { e.preventDefault(); Cart.remove(rm.dataset.rm); }
  });

  const totop = qs('#totop');
  addEventListener('scroll', () => totop.classList.toggle('on', scrollY > 500), { passive: true });
  totop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

  // đánh dấu nav hiện tại
  qsa('.nav-link').forEach(a => {
    if (a.getAttribute('href') === location.pathname + location.search) a.classList.add('active');
  });
});
