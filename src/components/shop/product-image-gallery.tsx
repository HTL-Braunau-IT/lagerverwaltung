"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

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

export function ProductImageGallery({
  images,
  productName,
}: {
  images: ProductImage[];
  productName: string;
}) {
  const [paletteByImageId, setPaletteByImageId] = useState<Record<string, EdgePalette>>({});

  return (
    <div className="space-y-3">
      {images.map((image) => {
        const palette = paletteByImageId[image.id];
        return (
        <div
          key={image.id}
          className="overflow-hidden rounded-xl border border-border bg-muted"
          style={palette ? paletteToFillStyle(palette) : undefined}
        >
          <img
            src={image.url}
            alt={image.altText ?? `${productName} Produktbild`}
            className="max-h-96 w-full object-contain"
            loading="lazy"
            onLoad={(event) => {
              const palette = buildEdgePalette(event.currentTarget);
              if (!palette) return;

              setPaletteByImageId((previous) =>
                previous[image.id] ? previous : { ...previous, [image.id]: palette },
              );
            }}
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = "/pictures/placeholder.jpg";
            }}
          />
        </div>
        );
      })}
    </div>
  );
}
