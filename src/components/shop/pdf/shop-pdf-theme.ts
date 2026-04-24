import { Font, StyleSheet } from "@react-pdf/renderer";

let fontsRegistered = false;

export function ensureShopPdfFonts() {
  if (fontsRegistered) return;
  fontsRegistered = true;
  Font.register({
    family: "Helvetica",
    fonts: [
      { src: "Helvetica" },
      { src: "Helvetica-Bold", fontWeight: 700 },
    ],
  });
}

export const shopPdfStyles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 30,
    paddingBottom: 30,
    paddingHorizontal: 30,
    color: "#0f172a",
    backgroundColor: "#ffffff",
  },
  card: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  rowBetween: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heading: {
    fontSize: 16,
    fontWeight: 700,
    color: "#0f172a",
  },
  subheading: {
    fontSize: 11,
    color: "#475569",
    marginTop: 2,
  },
  muted: {
    color: "#64748b",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: "#0f172a",
    marginBottom: 6,
  },
  tableHeaderRow: {
    display: "flex",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 6,
    marginBottom: 6,
    fontSize: 9,
    color: "#475569",
  },
  tableRow: {
    display: "flex",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 5,
  },
  colName: {
    width: "38%",
    paddingRight: 6,
  },
  colSku: {
    width: "17%",
    paddingRight: 6,
  },
  colQty: {
    width: "12%",
    textAlign: "right",
    paddingRight: 6,
  },
  colUnit: {
    width: "11%",
    textAlign: "right",
    paddingRight: 6,
  },
  colPrice: {
    width: "11%",
    textAlign: "right",
    paddingRight: 6,
  },
  colTotal: {
    width: "11%",
    textAlign: "right",
  },
  strong: {
    fontWeight: 700,
  },
  totalsRow: {
    marginTop: 8,
    display: "flex",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#bae6fd",
    backgroundColor: "#f0f9ff",
    color: "#0369a1",
    fontSize: 9,
  },
});

export function formatPdfCurrency(value: number) {
  return new Intl.NumberFormat("de-AT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function formatPdfNumber(value: number) {
  return new Intl.NumberFormat("de-AT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}
