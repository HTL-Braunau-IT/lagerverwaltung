"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import useEmblaCarousel from "embla-carousel-react";

type ProductImage = {
  id: string;
  url: string;
  altText: string | null;
};

type EdgePalette = {
  top: [number, number, number];
  right: [number, number, number];
  bottom: [number, number, number];
  left: [number, number, number];
  average: [number, number, number];
};

function toRgbString([r, g, b]: [number, number, number], alpha = 1) {
  if (alpha >= 1) return `rgb(${r} ${g} ${b})`;
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

function sampleBandColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  endX: number,
  startY: number,
  endY: number,
): [number, number, number] | null {
  let weightedR = 0;
  let weightedG = 0;
  let weightedB = 0;
  let alphaWeightSum = 0;

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const idx = (y * width + x) * 4;
      const alpha = (data[idx + 3] ?? 0) / 255;
      if (alpha <= 0.01) continue;

      weightedR += (data[idx] ?? 0) * alpha;
      weightedG += (data[idx + 1] ?? 0) * alpha;
      weightedB += (data[idx + 2] ?? 0) * alpha;
      alphaWeightSum += alpha;
    }
  }

  if (alphaWeightSum === 0) return null;
  return [
    Math.round(weightedR / alphaWeightSum),
    Math.round(weightedG / alphaWeightSum),
    Math.round(weightedB / alphaWeightSum),
  ];
}

function buildEdgePalette(img: HTMLImageElement): EdgePalette | null {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  const sourceWidth = img.naturalWidth;
  const sourceHeight = img.naturalHeight;
  if (!sourceWidth || !sourceHeight) return null;

  const maxSize = 160;
  const scale = Math.min(maxSize / sourceWidth, maxSize / sourceHeight, 1);
  const width = Math.max(2, Math.floor(sourceWidth * scale));
  const height = Math.max(2, Math.floor(sourceHeight * scale));

  canvas.width = width;
  canvas.height = height;

  try {
    context.drawImage(img, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    const band = Math.max(1, Math.min(Math.floor(Math.min(width, height) * 0.08), 12));

    const top = sampleBandColor(data, width, height, 0, width, 0, band);
    const bottom = sampleBandColor(data, width, height, 0, width, height - band, height);
    const left = sampleBandColor(data, width, height, 0, band, 0, height);
    const right = sampleBandColor(data, width, height, width - band, width, 0, height);

    const sides = [top, right, bottom, left].filter(
      (color): color is [number, number, number] => color !== null,
    );
    if (sides.length === 0) return null;

    const average: [number, number, number] = [
      Math.round(sides.reduce((sum, color) => sum + color[0], 0) / sides.length),
      Math.round(sides.reduce((sum, color) => sum + color[1], 0) / sides.length),
      Math.round(sides.reduce((sum, color) => sum + color[2], 0) / sides.length),
    ];

    return {
      top: top ?? average,
      right: right ?? average,
      bottom: bottom ?? average,
      left: left ?? average,
      average,
    };
  } catch {
    // Cross-origin images can block canvas pixel reads.
    return null;
  }
}

function paletteToFillStyle(palette: EdgePalette): CSSProperties {
  const base = toRgbString(palette.average);
  const top = toRgbString(palette.top, 0.55);
  const right = toRgbString(palette.right, 0.48);
  const bottom = toRgbString(palette.bottom, 0.52);
  const left = toRgbString(palette.left, 0.48);

  return {
    backgroundColor: base,
    backgroundImage: [
      `linear-gradient(180deg, ${top} 0%, transparent 62%)`,
      `linear-gradient(90deg, ${left} 0%, transparent 60%)`,
      `linear-gradient(270deg, ${right} 0%, transparent 60%)`,
      `linear-gradient(0deg, ${bottom} 0%, transparent 64%)`,
    ].join(", "),
  };
}

const ZOOM_SCALE = 1.85;

function GalleryImageFrame({
  image,
  productName,
  palette,
  reduceMotion,
  onPaletteFromImage,
}: {
  image: ProductImage;
  productName: string;
  palette: EdgePalette | undefined;
  reduceMotion: boolean;
  onPaletteFromImage: (imageId: string, palette: EdgePalette) => void;
}) {
  const [hover, setHover] = useState(false);
  const [originPct, setOriginPct] = useState({ x: 50, y: 50 });

  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const rect = el.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    setOriginPct({
      x: ((event.clientX - rect.left) / w) * 100,
      y: ((event.clientY - rect.top) / h) * 100,
    });
  };

  const zoomActive = hover && !reduceMotion;

  return (
    <div
      className="cursor-zoom-in overflow-hidden rounded-xl border border-border bg-muted"
      style={palette ? paletteToFillStyle(palette) : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseMove={onMouseMove}
    >
      <img
        src={image.url}
        alt={image.altText ?? `${productName} Produktbild`}
        className="mx-auto max-h-64 w-full max-w-[min(100%,320px)] object-contain sm:max-h-64 will-change-transform"
        loading="lazy"
        style={{
          transform: zoomActive ? `scale(${ZOOM_SCALE})` : "scale(1)",
          transformOrigin: `${originPct.x}% ${originPct.y}%`,
          transition: zoomActive
            ? "transform 80ms ease-out"
            : "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        onLoad={(event) => {
          const palette = buildEdgePalette(event.currentTarget);
          if (!palette) return;
          onPaletteFromImage(image.id, palette);
        }}
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = "/pictures/placeholder.jpg";
        }}
      />
    </div>
  );
}

export function ProductImageGallery({
  images,
  productName,
}: {
  images: ProductImage[];
  productName: string;
}) {
  const [paletteByImageId, setPaletteByImageId] = useState<Record<string, EdgePalette>>({});
  const [reduceMotion, setReduceMotion] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "start" });
  const hasMultipleImages = images.length > 1;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  useEffect(() => {
    setSelectedIndex(0);
    emblaApi?.scrollTo(0, true);
  }, [images, emblaApi]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex">
            {images.map((image) => {
              const palette = paletteByImageId[image.id];
              return (
                <div className="min-w-0 shrink-0 grow-0 basis-full" key={image.id}>
                  <GalleryImageFrame
                    image={image}
                    productName={productName}
                    palette={palette}
                    reduceMotion={reduceMotion}
                    onPaletteFromImage={(imageId, nextPalette) => {
                      setPaletteByImageId((previous) =>
                        previous[imageId] ? previous : { ...previous, [imageId]: nextPalette },
                      );
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {hasMultipleImages && (
          <>
            <button
              type="button"
              onClick={() => emblaApi?.scrollPrev()}
              disabled={!(emblaApi?.canScrollPrev() ?? false)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Vorheriges Bild"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => emblaApi?.scrollNext()}
              disabled={!(emblaApi?.canScrollNext() ?? false)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-2 py-1 text-sm text-white disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Naechstes Bild"
            >
              ›
            </button>
          </>
        )}
      </div>

      {hasMultipleImages && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {images.map((image, index) => (
            <button
              type="button"
              key={`${image.id}-dot`}
              onClick={() => emblaApi?.scrollTo(index)}
              className={[
                "h-2 w-2 rounded-full transition-colors",
                index === selectedIndex ? "bg-foreground" : "bg-muted-foreground/40",
              ].join(" ")}
              aria-label={`Bild ${index + 1} anzeigen`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
