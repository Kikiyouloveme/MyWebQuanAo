import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CART_KEY, type Product, type Variant } from "@/lib/api";

/**
 * Giỏ hàng lưu ở localStorage. Chỉ giữ thông tin nhận dạng và số lượng —
 * giá hiển thị ở đây chỉ để xem trước, khi đặt hàng server luôn tính lại từ database.
 */
export interface CartItem {
  key: string;        // = variantId, một biến thể chỉ có một dòng trong giỏ
  productId: string;
  variantId: string;
  title: string;
  color: string;
  size: string;
  price: number;
  img: string;
  qty: number;
  maxStock: number;   // dùng để chặn tăng quá tồn kho ngay trên giao diện
}

interface CartCtx {
  items: CartItem[];
  count: number;
  subtotal: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (product: Product, variant: Variant, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  /** Dòng hàng rút gọn để gửi lên API */
  payload: () => { productId: string; variantId: string; qty: number }[];
}

const Ctx = createContext<CartCtx>(null!);
export const useCart = () => useContext(Ctx);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      // Bỏ qua dữ liệu giỏ hàng theo định dạng cũ (trước khi có biến thể)
      return Array.isArray(parsed) ? parsed.filter((i) => i && i.variantId && i.productId) : [];
    } catch {
      return [];
    }
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const add = (product: Product, variant: Variant, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.key === variant.id);
      if (existing) {
        const nextQty = Math.min(existing.qty + qty, variant.stock, 20);
        return prev.map((i) => (i.key === variant.id ? { ...i, qty: nextQty, maxStock: variant.stock } : i));
      }
      return [...prev, {
        key: variant.id,
        productId: product.id,
        variantId: variant.id,
        title: product.title,
        color: variant.color,
        size: variant.size,
        price: product.price,
        img: product.img,
        qty: Math.min(qty, variant.stock, 20),
        maxStock: variant.stock,
      }];
    });
    setOpen(true);
  };

  const setQty = (key: string, qty: number) =>
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.key !== key)
        : prev.map((i) => (i.key === key ? { ...i, qty: Math.min(qty, i.maxStock || 20, 20) } : i))
    );

  const remove = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));
  const clear = () => setItems([]);
  const payload = () => items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty }));

  const count = items.reduce((s, i) => s + i.qty, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <Ctx.Provider value={{ items, count, subtotal, open, setOpen, add, setQty, remove, clear, payload }}>
      {children}
    </Ctx.Provider>
  );
}
