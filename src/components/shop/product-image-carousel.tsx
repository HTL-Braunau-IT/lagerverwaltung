"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";

import { PRODUCT_PLACEHOLDER_IMAGE } from "~/lib/product-placeholder";

type ProductImage = {
  url: string;
  altText: string | null;
};

type ProductImageCarouselProps = {
  images: ProductImage[];
  productName: string;
  href?: string;
};

export function ProductImageCarousel({ images, productName, href }: ProductImageCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "start" });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  if (images.length === 0) {
    const placeholder = (
      <img
        src={PRODUCT_PLACEHOLDER_IMAGE}
        alt={`${productName} Platzhalterbild`}
        className="h-40 w-full object-cover bg-transparent" 
        loading="lazy"
      />
    );

    if (!href) return placeholder;

    return (
      <Link
        href={href}
        className="block cursor-pointer"
        aria-label={`${productName} ansehen`}
        onClick={(event) => event.stopPropagation()}
      >
        {placeholder}
      </Link>
    );
  }

  const canScrollPrev = emblaApi?.canScrollPrev() ?? false;
  const canScrollNext = emblaApi?.canScrollNext() ?? false;
  const hasMultipleImages = images.length > 1;

  const carouselViewport = (
    <div className="overflow-hidden" ref={emblaRef}>
      <div className="flex">
        {images.map((image, index) => (
          <div className="min-w-0 shrink-0 grow-0 basis-full" key={`${image.url}-${index}`}>
            <img
              src={image.url}
              alt={image.altText ?? `${productName} Produktbild`}
              className="h-40 w-full object-cover bg-transparent"
              loading="lazy"
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = PRODUCT_PLACEHOLDER_IMAGE;
                event.currentTarget.className = "h-40 w-full object-cover bg-transparent";
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div
      className="relative"
      onClick={href ? undefined : (event) => event.stopPropagation()}
    >
      {href ? (
        <Link
          href={href}
          className="block cursor-pointer"
          aria-label={`${productName} ansehen`}
          onClick={(event) => event.stopPropagation()}
        >
          {carouselViewport}
        </Link>
      ) : (
        carouselViewport
      )}

      {hasMultipleImages && (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              emblaApi?.scrollPrev();
            }}
            disabled={!canScrollPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Vorheriges Bild"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              emblaApi?.scrollNext();
            }}
            disabled={!canScrollNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Naechstes Bild"
          >
            ›
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/40 px-2 py-1">
            {images.map((_, index) => (
              <button
                type="button"
                key={index}
                onClick={(event) => {
                  event.stopPropagation();
                  emblaApi?.scrollTo(index);
                }}
                className={`h-1.5 w-1.5 rounded-full ${
                  index === selectedIndex ? "bg-white" : "bg-white/45"
                }`}
                aria-label={`Bild ${index + 1} anzeigen`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
