import { useEffect } from "react";

interface PageMeta {
  title: string;
  description?: string;
  /** Ảnh dùng cho Open Graph khi chia sẻ link */
  image?: string;
  /** Trang riêng tư (tài khoản, quản trị) không nên được lập chỉ mục */
  noIndex?: boolean;
  canonicalPath?: string;
}

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    Object.entries(attrs).forEach(([k, v]) => { if (k !== "content") el!.setAttribute(k, v); });
    document.head.appendChild(el);
  }
  el.setAttribute("content", attrs.content);
  return el;
}

/**
 * Cập nhật tiêu đề và thẻ meta theo từng trang.
 * SPA không có SSR nên đây là cách gần nhất để mỗi trang có metadata riêng —
 * đủ dùng cho các công cụ đọc được JavaScript và cho việc chia sẻ liên kết.
 */
export function usePageMeta({ title, description, image, noIndex, canonicalPath }: PageMeta) {
  useEffect(() => {
    document.title = title;

    if (description) {
      upsertMeta('meta[name="description"]', { name: "description", content: description });
      upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    }
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: window.location.href });
    if (image) {
      upsertMeta('meta[property="og:image"]', { property: "og:image", content: new URL(image, window.location.origin).href });
    }

    // robots: chặn lập chỉ mục các trang riêng tư
    const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (noIndex) {
      upsertMeta('meta[name="robots"]', { name: "robots", content: "noindex, nofollow" });
    } else if (robots) {
      robots.remove();
    }

    // canonical
    const href = new URL(canonicalPath || window.location.pathname, window.location.origin).href;
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = href;
  }, [title, description, image, noIndex, canonicalPath]);
}
