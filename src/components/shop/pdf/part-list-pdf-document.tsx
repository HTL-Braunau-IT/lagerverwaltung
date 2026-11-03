import { Document, Page, Text, View } from "@react-pdf/renderer";
import { ensureShopPdfFonts, formatPdfNumber, shopPdfStyles } from "./shop-pdf-theme";

type PartListPdfLine = {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  unit: string;
  quantityOnHand: number;
};

type PartListPdfDocumentProps = {
  name: string;
  description?: string | null;
  maxOrderable: number;
  generatedAt: Date;
  items: PartListPdfLine[];
};

export function PartListPdfDocument({
  name,
  description,
  maxOrderable,
  generatedAt,
  items,
}: PartListPdfDocumentProps) {
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
              <Text style={shopPdfStyles.heading}>Teileliste Export</Text>
              <Text style={shopPdfStyles.subheading}>{name}</Text>
            </View>
            <Text style={shopPdfStyles.badge}>Stand: {generatedAtText}</Text>
          </View>
          {description ? <Text style={{ ...shopPdfStyles.subheading, marginTop: 8 }}>{description}</Text> : null}
          <Text style={{ ...shopPdfStyles.subheading, marginTop: 8 }}>
            Komplett verfügbar: {formatPdfNumber(maxOrderable)}x
          </Text>
        </View>

        <View style={shopPdfStyles.card}>
          <Text style={shopPdfStyles.sectionTitle}>Produkte ({formatPdfNumber(items.length)})</Text>
          <View style={shopPdfStyles.tableHeaderRow}>
            <Text style={shopPdfStyles.colName}>Produkt</Text>
            <Text style={shopPdfStyles.colSku}>SKU</Text>
            <Text style={shopPdfStyles.colQty}>Menge</Text>
            <Text style={shopPdfStyles.colUnit}>Einheit</Text>
            <Text style={shopPdfStyles.colTotal}>Bestand</Text>
          </View>
          {items.map((item) => (
            <View key={item.id} style={shopPdfStyles.tableRow}>
              <Text style={shopPdfStyles.colName}>{item.productName}</Text>
              <Text style={shopPdfStyles.colSku}>{item.sku}</Text>
              <Text style={shopPdfStyles.colQty}>{formatPdfNumber(item.quantity)}</Text>
              <Text style={shopPdfStyles.colUnit}>{item.unit.toLowerCase()}</Text>
              <Text style={shopPdfStyles.colTotal}>{formatPdfNumber(item.quantityOnHand)}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export type { PartListPdfDocumentProps, PartListPdfLine };
