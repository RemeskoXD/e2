import DOMPurify from "dompurify";

export type MeasureGuidePageDto = {
  id: number;
  eyebrow: string;
  title: string;
  intro: string;
  card_title: string;
  card_subtitle: string;
};

export type MeasureGuideSectionDto = {
  id: number;
  title: string;
  body_html: string;
  video_url: string | null;
  sort_order?: number;
};

export function sanitizeGuideHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe", "div"],
    ADD_ATTR: [
      "allow",
      "allowfullscreen",
      "frameborder",
      "src",
      "width",
      "height",
      "title",
      "class",
      "data-youtube-video",
    ],
    ALLOW_DATA_ATTR: true,
  });
}

/** YouTube / Vimeo / přímý embed URL → src pro iframe */
export function videoUrlToEmbed(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  try {
    const parsed = new URL(u);
    if (parsed.hostname.includes("youtube.com") && parsed.searchParams.get("v")) {
      return `https://www.youtube.com/embed/${parsed.searchParams.get("v")}`;
    }
    if (parsed.hostname === "youtu.be") {
      const id = parsed.pathname.replace(/^\//, "").split("/")[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (parsed.hostname.includes("vimeo.com")) {
      const parts = parsed.pathname.split("/").filter(Boolean);
      const vid = parts[parts.length - 1];
      if (vid && /^\d+$/.test(vid)) return `https://player.vimeo.com/video/${vid}`;
    }
  } catch {
    /* ignore */
  }
  if (/^https?:\/\//i.test(u)) return u;
  return null;
}
