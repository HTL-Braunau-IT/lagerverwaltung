"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";

type ProductImage = {
  url: string;
  altText: string | null;
};

type ProductImageCarouselProps = {
  images: ProductImage[];
  productName: string;
};

export function ProductImageCarousel({ images, productName }: ProductImageCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "start" });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [failedIndexes, setFailedIndexes] = useState<Set<number>>(new Set());

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
    return (
      <div
        className="flex h-40 w-full items-center justify-center bg-slate-100 text-xs font-medium text-slate-500"
        aria-label={`${productName} Platzhalterbild`}
      >
        Kein Produktbild
      </div>
    );
  }

  const canScrollPrev = emblaApi?.canScrollPrev() ?? false;
  const canScrollNext = emblaApi?.canScrollNext() ?? false;
  const hasMultipleImages = images.length > 1;

  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {images.map((image, index) => {
            const hasImageError = failedIndexes.has(index);
            return (
              <div className="min-w-0 shrink-0 grow-0 basis-full" key={`${image.url}-${index}`}>
                {hasImageError ? (
                  <div
                    className="flex h-40 w-full items-center justify-center bg-slate-100 text-xs font-medium text-slate-500"
                    aria-label={`${productName} Platzhalterbild`}
                  >
                    Kein Produktbild
                  </div>
                ) : (
                  <img
                    src={image.url}
                    alt={image.altText ?? `${productName} Produktbild`}
                    className="h-40 w-full object-cover"
                    loading="lazy"
                    onError={() => {
                      setFailedIndexes((prev) => {
                        if (prev.has(index)) return prev;
                        const next = new Set(prev);
                        next.add(index);
                        return next;
                      });
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

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
