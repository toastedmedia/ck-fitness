/* eslint-disable @next/next/no-img-element */
import { bannerLink } from "@ck/core";

export interface BannerView {
  id: string;
  title: string;
  alt: string;
  src: string;
  link_url: string;
}

/** Rectangular promo cards (events, challenges, offers) set in Admin -> Home banners. */
export function HomeBanners({
  banners,
  native,
}: {
  banners: BannerView[];
  native: boolean;
}) {
  if (banners.length === 0) return null;
  return (
    <section aria-label="Updates from Chardikala Fitness" className="flex flex-col gap-3">
      {banners.map((b) => {
        const link = bannerLink(b.link_url, native);
        const img = (
          <img
            src={b.src}
            alt={b.alt}
            loading="lazy"
            className="aspect-[12/5] w-full rounded-card object-cover"
          />
        );
        return link ? (
          <a
            key={b.id}
            href={link.href}
            {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="block overflow-hidden rounded-card"
          >
            {img}
          </a>
        ) : (
          <div key={b.id} className="overflow-hidden rounded-card">
            {img}
          </div>
        );
      })}
    </section>
  );
}
