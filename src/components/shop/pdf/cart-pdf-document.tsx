import { Document, Page, Text, View } from "@react-pdf/renderer";
import { ensureShopPdfFonts, formatPdfCurrency, formatPdfNumber, shopPdfStyles } from "./shop-pdf-theme";

type CartPdfLine = {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  sourcePartListName?: string;
};

type CartPdfGroup = {
  id: string;
  name: string;
  items: CartPdfLine[];
};

type CartPdfDocumentProps = {
  lines: CartPdfLine[];
  partListGroups: CartPdfGroup[];
  generatedAt: Date;
  total: number;
  positionCount: number;
};

function CartTable({ items }: { items: CartPdfLine[] }) {
  return (
    <View>
      <View style={shopPdfStyles.tableHeaderRow}>
        <Text style={shopPdfStyles.colName}>Produkt</Text>
        <Text style={shopPdfStyles.colSku}>SKU</Text>
        <Text style={shopPdfStyles.colQty}>Menge</Text>
        <Text style={shopPdfStyles.colUnit}>Einheit</Text>
        <Text style={shopPdfStyles.colPrice}>Preis</Text>
        <Text style={shopPdfStyles.colTotal}>Summe</Text>
      </View>
      {items.map((item) => {
        const lineTotal = item.quantity * item.unitPrice;
        return (
          <View key={item.id} style={shopPdfStyles.tableRow}>
            <Text style={shopPdfStyles.colName}>{item.productName}</Text>
            <Text style={shopPdfStyles.colSku}>{item.sku}</Text>
            <Text style={shopPdfStyles.colQty}>{formatPdfNumber(item.quantity)}</Text>
            <Text style={shopPdfStyles.colUnit}>{item.unit.toLowerCase()}</Text>
            <Text style={shopPdfStyles.colPrice}>{formatPdfCurrency(item.unitPrice)}</Text>
            <Text style={shopPdfStyles.colTotal}>{formatPdfCurrency(lineTotal)}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function CartPdfDocument({
  lines,
  partListGroups,
  generatedAt,
  total,
  positionCount,
}: CartPdfDocumentProps) {
  ensureShopPdfFonts();
  const generatedAtText = new Intl.DateTimeFormat("de-AT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(generatedAt);

  return (
    <Document>
      <Page size="A4" style={shopPdfStyles.page}>
        <View style={shopPdfStyles.card}>
          <View style={shopPdfStyles.rowBetween}>
            <View>
              <Text style={shopPdfStyles.heading}>Warenkorb Export</Text>
              <Text style={shopPdfStyles.subheading}>Stand: {generatedAtText}</Text>
            </View>
            <Text style={shopPdfStyles.badge}>{formatPdfNumber(positionCount)} Positionen</Text>
          </View>
        </View>

        {lines.length === 0 && partListGroups.length > 0 ? (
          <>
            {partListGroups.map((group, index) => (
              <View key={group.id} style={shopPdfStyles.card}>
                <Text style={shopPdfStyles.sectionTitle}>Stückliste - {group.name}</Text>
                <CartTable items={group.items} />
                {index === partListGroups.length - 1 ? (
                  <View style={shopPdfStyles.totalsRow}>
                    <Text style={shopPdfStyles.muted}>Gesamt</Text>
                    <Text style={shopPdfStyles.strong}>{formatPdfCurrency(total)}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </>
        ) : (
          <View style={shopPdfStyles.card}>
            {partListGroups.map((group) => (
              <View key={group.id} style={{ marginBottom: 10 }}>
                <Text style={shopPdfStyles.sectionTitle}>Stückliste - {group.name}</Text>
                <CartTable items={group.items} />
              </View>
            ))}

            {lines.length > 0 ? (
              <View style={{ marginBottom: 10 }}>
                <Text style={shopPdfStyles.sectionTitle}>Einzelprodukte</Text>
                <CartTable items={lines} />
              </View>
            ) : null}
            <View style={shopPdfStyles.totalsRow}>
              <Text style={shopPdfStyles.muted}>Gesamt</Text>
              <Text style={shopPdfStyles.strong}>{formatPdfCurrency(total)}</Text>
            </View>
          </View>
        )}
      </Page>
    </Document>
  );
}

export type { CartPdfDocumentProps, CartPdfGroup, CartPdfLine };
