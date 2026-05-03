import { PackageIcon } from "~/components/layout/icon-renders";

function decimalToNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function formatBaseUnitLabel(baseUnit: string) {
  return baseUnit.toLowerCase().replace("2", "²");
}

function formatInventoryQuantity(value: number) {
  return new Intl.NumberFormat("de-AT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(value);
}

/** Rot: Bestand ≤ Mindestbestand. Gelb: darüber bis einschließlich 110 % des Mindestbestands. Grün: über 110 %. */
function stockAvailabilityDotClass(minimum: number, onHand: number): string {
  if (minimum <= 0) return "bg-muted-foreground/45";
  if (onHand <= minimum) return "bg-red-500";
  if (onHand <= minimum * 1.1) return "bg-amber-400";
  return "bg-emerald-500";
}

function stockAvailabilityTitle(minimum: number, onHand: number): string {
  if (minimum <= 0) return "Bestandslage (kein Mindestbestand hinterlegt)";
  if (onHand <= minimum) return "Kritisch: Bestand am oder unter dem Mindestbestand";
  if (onHand <= minimum * 1.1) return "Niedrig: Bestand nahe am Mindestbestand";
  return "Ausreichend: Bestand über dem Warnbereich";
}

export function StockOnHandLine({
  quantityOnHand,
  minimumQuantity,
  baseUnit,
  align = "start",
  className = "",
}: {
  quantityOnHand: unknown;
  minimumQuantity: unknown;
  baseUnit: string;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const onHand = decimalToNumber(quantityOnHand);
  const minimum = decimalToNumber(minimumQuantity);
  const dotClass = stockAvailabilityDotClass(minimum, onHand);
  const title = stockAvailabilityTitle(minimum, onHand);
  const unitLabel = formatBaseUnitLabel(baseUnit);

  const srSummary = `Bestand ${formatInventoryQuantity(onHand)} ${unitLabel}. ${title}`;

  const justify =
    align === "center" ? "justify-center" : align === "end" ? "justify-end" : "justify-start";

  return (
    <div
      className={["-mt-1 mb-2 flex items-center gap-1.5 text-sm", justify, className].join(" ")}
    >
      <p className="sr-only">{srSummary}</p>
      <span
        className={["h-1.5 w-1.5 shrink-0 rounded-full", dotClass].join(" ")}
        title={title}
        aria-hidden
      />
      <span className="font-semibold tabular-nums text-foreground">{formatInventoryQuantity(onHand)}</span>
      <span className="text-muted-foreground">{unitLabel}</span>
      <span className="text-muted-foreground">verf.</span>
    </div>
  );
}
