import { Document, G, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import {
  ensureShopPdfFonts,
  formatPdfCurrency,
  formatPdfNumber,
  shopPdfStyles,
} from "~/components/shop/pdf/shop-pdf-theme";

type BillingPdfLine = {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
};

type BillingPdfOrder = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  items: BillingPdfLine[];
  orderTotal: number;
};

type CostCenterBillingPdfDocumentProps = {
  costCenterName: string;
  periodFrom: Date;
  periodTo: Date;
  orders: BillingPdfOrder[];
  grandTotal: number;
};

const PACKAGE_PATH =
  "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z";

const PDF_PRIMARY = "#003264";
const PDF_PRIMARY_MUTED = "rgba(0, 20, 40, 0.55)";
const PDF_HEADER_TEXT = "#475569";
const PDF_BODY_TEXT = "#0f172a";

const billingPdfStyles = StyleSheet.create({
  logoRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  brandEyebrow: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#64748b",
  },
  brandTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: PDF_PRIMARY,
  },
  headerBlock: {
    marginBottom: 18,
  },
  tableSection: {
    marginTop: 4,
  },
  tableHeaderRow: {
    display: "flex",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 6,
    marginBottom: 2,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: 700,
    color: PDF_HEADER_TEXT,
  },
  tableRow: {
    display: "flex",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 4,
    fontSize: 9,
    color: PDF_BODY_TEXT,
  },
  tableRowOrderStart: {
    paddingTop: 8,
  },
  colOrder: {
    width: "13%",
    paddingRight: 4,
  },
  colDate: {
    width: "16%",
    paddingRight: 4,
    flexShrink: 0,
  },
  colDateValue: {
    color: PDF_PRIMARY_MUTED,
  },
  colName: {
    width: "22%",
    paddingRight: 4,
  },
  colSku: {
    width: "12%",
    paddingRight: 4,
  },
  colSkuValue: {
    color: PDF_PRIMARY_MUTED,
  },
  colQty: {
    width: "9%",
    textAlign: "right",
    paddingRight: 4,
  },
  colUnit: {
    width: "9%",
    textAlign: "right",
    paddingRight: 4,
  },
  colUnitValue: {
    color: PDF_PRIMARY_MUTED,
  },
  colPrice: {
    width: "10%",
    textAlign: "right",
    paddingRight: 4,
  },
  colTotal: {
    width: "9%",
    textAlign: "right",
  },
  emptyText: {
    fontSize: 10,
    color: "#64748b",
    marginTop: 8,
  },
});

function formatPdfDate(value: Date) {
  return new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function formatOrderDate(value: Date) {
  const parts = new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
}

function formatPdfUnit(unit: string) {
  const normalized = unit.trim().toUpperCase();
  return normalized === "PCS" ? "STK" : normalized;
}

function BillingPdfLogo() {
  const strokeOuter = 1.9;
  const innerStroke = strokeOuter / 0.64;

  return (
    <Svg viewBox="0 0 24 24" width={32} height={32}>
      <Path d={PACKAGE_PATH} stroke="#003264" strokeWidth={strokeOuter} fill="none" />
      <G transform="translate(12 12.25) scale(0.64) translate(-12 -12.25)">
        <Path d={PACKAGE_PATH} stroke="#F97316" strokeWidth={innerStroke} fill="none" />
      </G>
    </Svg>
  );
}

type FlatRow = BillingPdfLine & {
  orderNumber: string;
  orderDate: string;
  isFirstInOrder: boolean;
};

function flattenOrders(orders: BillingPdfOrder[]): FlatRow[] {
  return orders.flatMap((order) =>
    order.items.map((item, index) => ({
      ...item,
      orderNumber: order.orderNumber,
      orderDate: formatOrderDate(order.createdAt),
      isFirstInOrder: index === 0,
    })),
  );
}

export function CostCenterBillingPdfDocument({
  costCenterName,
  periodFrom,
  periodTo,
  orders,
  grandTotal,
}: CostCenterBillingPdfDocumentProps) {
  ensureShopPdfFonts();
  const rows = flattenOrders(orders);

  return (
    <Document>
      <Page size="A4" style={shopPdfStyles.page}>
        <View style={billingPdfStyles.logoRow}>
          <BillingPdfLogo />
          <View>
            <Text style={billingPdfStyles.brandEyebrow}>HTL Braunau</Text>
            <Text style={billingPdfStyles.brandTitle}>Lagershop</Text>
          </View>
        </View>

        <View style={billingPdfStyles.headerBlock}>
          <Text style={shopPdfStyles.heading}>Abrechnung Kostenstelle: {costCenterName}</Text>
          <Text style={shopPdfStyles.subheading}>
            Zeitraum: {formatPdfDate(periodFrom)} bis {formatPdfDate(periodTo)}
          </Text>
        </View>

        {rows.length === 0 ? (
          <Text style={billingPdfStyles.emptyText}>Keine Bestellungen im Zeitraum.</Text>
        ) : (
          <View style={billingPdfStyles.tableSection}>
            <View style={billingPdfStyles.tableHeaderRow}>
              <Text style={[billingPdfStyles.tableHeaderCell, billingPdfStyles.colOrder]}>Bestellnr.</Text>
              <Text style={[billingPdfStyles.tableHeaderCell, billingPdfStyles.colDate]}>Datum</Text>
              <Text style={[billingPdfStyles.tableHeaderCell, billingPdfStyles.colName]}>Produkt</Text>
              <Text style={[billingPdfStyles.tableHeaderCell, billingPdfStyles.colSku]}>SKU</Text>
              <Text style={[billingPdfStyles.tableHeaderCell, billingPdfStyles.colQty]}>Menge</Text>
              <Text style={[billingPdfStyles.tableHeaderCell, billingPdfStyles.colUnit]}>Einheit</Text>
              <Text style={[billingPdfStyles.tableHeaderCell, billingPdfStyles.colPrice]}>Preis</Text>
              <Text style={[billingPdfStyles.tableHeaderCell, billingPdfStyles.colTotal]}>Summe</Text>
            </View>
            {rows.map((row) => (
              <View
                key={row.id}
                style={[
                  billingPdfStyles.tableRow,
                  ...(row.isFirstInOrder ? [billingPdfStyles.tableRowOrderStart] : []),
                ]}
              >
                <Text style={billingPdfStyles.colOrder}>
                  {row.isFirstInOrder ? row.orderNumber : ""}
                </Text>
                <Text style={[billingPdfStyles.colDate, billingPdfStyles.colDateValue]} wrap={false}>
                  {row.isFirstInOrder ? row.orderDate : ""}
                </Text>
                <Text style={billingPdfStyles.colName}>{row.productName}</Text>
                <Text style={[billingPdfStyles.colSku, billingPdfStyles.colSkuValue]}>{row.sku}</Text>
                <Text style={billingPdfStyles.colQty}>{formatPdfNumber(row.quantity)}</Text>
                <Text style={[billingPdfStyles.colUnit, billingPdfStyles.colUnitValue]}>
                  {formatPdfUnit(row.unit)}
                </Text>
                <Text style={billingPdfStyles.colPrice}>{formatPdfCurrency(row.unitPrice)}</Text>
                <Text style={billingPdfStyles.colTotal}>{formatPdfCurrency(row.lineTotal)}</Text>
              </View>
            ))}
          </View>
        )}

        {orders.length > 0 ? (
          <View style={shopPdfStyles.totalsRow}>
            <Text style={shopPdfStyles.muted}>Gesamt</Text>
            <Text style={shopPdfStyles.strong}>{formatPdfCurrency(grandTotal)}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

export type { BillingPdfLine, BillingPdfOrder, CostCenterBillingPdfDocumentProps };
