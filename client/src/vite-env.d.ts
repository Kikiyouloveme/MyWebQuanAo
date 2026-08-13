/// <reference types="vite/client" />

/** Biến môi trường lúc build — khai báo để TypeScript hiểu import.meta.env */
interface ImportMetaEnv {
  readonly VITE_SHOP_EMAIL?: string;
  readonly VITE_SHOP_PHONE?: string;
  readonly VITE_SHOP_ADDRESS?: string;
  readonly VITE_SHOP_HOURS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
