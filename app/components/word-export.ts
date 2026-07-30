import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

export type VariantExportInput = {
  projectName: string;
  location: string;
  distance: number;
  unit: "t" | "m³";
  requestedQuantity: number;
  alternativeQuantity: number;
  requestedName: string;
  requestedVariant: string;
  requestedTemperature: string | null;
  requestedPrice: number;
  requestedDiscount: number;
  requestedNetUnit: number;
  requestedPriceTotal: number;
  requestedMaterialCo2: number;
  requestedCo2Total: number;
  alternativeName: string;
  alternativeVariant: string;
  alternativeTemperature: string | null;
  alternativePrice: number;
  alternativeDiscount: number;
  alternativeNetUnit: number;
  alternativePriceTotal: number;
  alternativeMaterialCo2: number;
  alternativeCo2Total: number;
  requestedTransportCo2: number;
  requestedTrips: number;
  requestedWeight: number;
  alternativeTransportCo2: number;
  alternativeTrips: number;
  alternativeWeight: number;
  payload: number;
  roundTripDistance: number;
  truckFactor: number;
};

const COLORS = {
  red: "C00D0D",
  anthracite: "4B4F51",
  gray: "E0DED8",
  lightGray: "F3F2F0",
  green: "5C848C",
  lightGreen: "A2BFAE",
  white: "FFFFFF",
};

function swiss(value: number, digits = 1) {
  const safe = Number.isFinite(value) ? value : 0;
  const formatted = Math.abs(safe)
    .toFixed(digits)
    .replace(/\.0+$/, "")
    .replace(/\B(?=(\d{3})+(?!\d))/g, "’");
  return `${safe < 0 ? "-" : ""}${formatted}`;
}

function money(value: number) {
  return `CHF ${swiss(value, 2)}`;
}

function outcome(delta: number) {
  if (Math.abs(delta) < 0.005) {
    return {
      color: COLORS.anthracite,
      fill: COLORS.lightGray,
      label: "gleich",
    };
  }
  if (delta < 0) {
    return {
      color: COLORS.green,
      fill: COLORS.lightGreen,
      label: "günstiger",
    };
  }
  return {
    color: COLORS.red,
    fill: "F4DADA",
    label: "teurer",
  };
}

function co2Outcome(delta: number) {
  const base = outcome(delta);
  return {
    ...base,
    label: delta < 0 ? "weniger CO₂" : delta > 0 ? "mehr CO₂" : "gleich",
  };
}

function run(
  text: string,
  options?: {
    heading?: boolean;
    color?: string;
    size?: number;
  },
) {
  return new TextRun({
    text,
    font: options?.heading ? "Museo Sans 900" : "Museo Sans 300",
    bold: options?.heading,
    color: options?.color ?? COLORS.anthracite,
    size: options?.size ?? 17,
  });
}

function paragraph(
  text: string,
  options?: {
    heading?: boolean;
    color?: string;
    size?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    before?: number;
    after?: number;
  },
) {
  return new Paragraph({
    alignment: options?.align ?? AlignmentType.LEFT,
    spacing: {
      before: options?.before ?? 0,
      after: options?.after ?? 0,
      line: 220,
    },
    children: [
      run(text, {
        heading: options?.heading,
        color: options?.color,
        size: options?.size,
      }),
    ],
  });
}

const border = {
  style: BorderStyle.SINGLE,
  color: "D6D4D0",
  size: 5,
};

const borders = {
  top: border,
  bottom: border,
  left: border,
  right: border,
  insideHorizontal: border,
  insideVertical: border,
};

function cell(
  children: Paragraph[],
  options?: { fill?: string; width?: number },
) {
  return new TableCell({
    children,
    width: options?.width
      ? { size: options.width, type: WidthType.DXA }
      : undefined,
    verticalAlign: VerticalAlign.CENTER,
    shading: options?.fill
      ? { type: ShadingType.CLEAR, fill: options.fill }
      : undefined,
    margins: { top: 75, bottom: 75, left: 105, right: 105 },
    borders,
  });
}

function barTable(
  requested: number,
  alternative: number,
  format: (value: number) => string,
  alternativeColor: string,
) {
  const max = Math.max(requested, alternative, 1);
  const segmentCount = 10;
  const labelWidth = 1800;
  const segmentWidth = 520;
  const valueWidth = 2580;
  const row = (label: string, value: number, fill: string) => {
    const filledSegments =
      value > 0
        ? Math.max(1, Math.round((value / max) * segmentCount))
        : 0;
    return new TableRow({
      children: [
        cell([paragraph(label, { heading: true, size: 15 })], {
          width: labelWidth,
        }),
        ...Array.from({ length: segmentCount }, (_, index) =>
          cell([paragraph("")], {
            fill: index < filledSegments ? fill : COLORS.lightGray,
            width: segmentWidth,
          }),
        ),
        cell(
          [
            paragraph(format(value), {
              heading: true,
              size: 16,
              align: AlignmentType.RIGHT,
            }),
          ],
          { width: valueWidth },
        ),
      ],
    });
  };

  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 9580, type: WidthType.DXA },
    columnWidths: [
      labelWidth,
      ...Array(segmentCount).fill(segmentWidth),
      valueWidth,
    ],
    rows: [
      row("Bauherrenvariante", requested, COLORS.anthracite),
      row("Kästli-Alternative", alternative, alternativeColor),
    ],
  });
}

export async function createVariantDocument(
  input: VariantExportInput,
  logo: Uint8Array,
) {
  const priceDelta =
    input.alternativePriceTotal - input.requestedPriceTotal;
  const co2Delta = input.alternativeCo2Total - input.requestedCo2Total;
  const priceStyle = outcome(priceDelta);
  const co2Style = co2Outcome(co2Delta);
  const comparisonRows = [
    [
      "Produkt",
      `${input.requestedName}\n${input.requestedVariant}`,
      `${input.alternativeName}\n${input.alternativeVariant}`,
    ],
    [
      "Herstellung",
      input.requestedTemperature ?? "A1–A3",
      input.alternativeTemperature ?? "A1–A3",
    ],
    [
      "Menge",
      `${swiss(input.requestedQuantity)} ${input.unit}`,
      `${swiss(input.alternativeQuantity)} ${input.unit}`,
    ],
    [
      "Transportgewicht",
      `${swiss(input.requestedWeight)} t`,
      `${swiss(input.alternativeWeight)} t`,
    ],
    [
      "Fuhren",
      `${input.requestedTrips}`,
      `${input.alternativeTrips}`,
    ],
    [
      "Produktpreis",
      `${money(input.requestedPrice)} / ${input.unit}`,
      `${money(input.alternativePrice)} / ${input.unit}`,
    ],
    [
      "Rabatt",
      `${swiss(input.requestedDiscount)} %`,
      `${swiss(input.alternativeDiscount)} %`,
    ],
    [
      "Netto-Einheitspreis",
      `${money(input.requestedNetUnit)} / ${input.unit}`,
      `${money(input.alternativeNetUnit)} / ${input.unit}`,
    ],
    [
      "Totalpreis",
      money(input.requestedPriceTotal),
      money(input.alternativePriceTotal),
    ],
    [
      "CO₂ Herstellung",
      `${swiss(input.requestedMaterialCo2)} kg CO₂e`,
      `${swiss(input.alternativeMaterialCo2)} kg CO₂e`,
    ],
    [
      "CO₂ Transport",
      `${swiss(input.requestedTransportCo2)} kg CO₂e`,
      `${swiss(input.alternativeTransportCo2)} kg CO₂e`,
    ],
    [
      "CO₂ gesamt",
      `${swiss(input.requestedCo2Total)} kg CO₂e`,
      `${swiss(input.alternativeCo2Total)} kg CO₂e`,
    ],
  ];

  const comparisonTable = new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 9580, type: WidthType.DXA },
    columnWidths: [1900, 3840, 3840],
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell([paragraph("Kennzahl", { heading: true, color: COLORS.white })], {
            fill: COLORS.anthracite,
            width: 1900,
          }),
          cell(
            [
              paragraph("Bauherrenvariante", {
                heading: true,
                color: COLORS.white,
              }),
            ],
            { fill: COLORS.anthracite, width: 3840 },
          ),
          cell(
            [
              paragraph("Kästli-Alternative", {
                heading: true,
                color: COLORS.white,
              }),
            ],
            { fill: COLORS.red, width: 3840 },
          ),
        ],
      }),
      ...comparisonRows.map(([label, requested, alternative], index) => {
        const highlightPrice = index === 8;
        const highlightCo2 = index === 11;
        const highlight = highlightPrice
          ? priceStyle
          : highlightCo2
            ? co2Style
            : null;
        return new TableRow({
          children: [
            cell([paragraph(label, { heading: true })], {
              fill: COLORS.lightGray,
              width: 1900,
            }),
            cell(
              requested
                .split("\n")
                .map((line) =>
                  paragraph(line, { heading: highlightPrice || highlightCo2 }),
                ),
              { width: 3840 },
            ),
            cell(
              alternative
                .split("\n")
                .map((line) =>
                  paragraph(line, {
                    heading: highlightPrice || highlightCo2,
                    color: highlight?.color,
                  }),
                ),
              { width: 3840, fill: highlight?.fill },
            ),
          ],
        });
      }),
    ],
  });

  const resultTable = new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 9580, type: WidthType.DXA },
    columnWidths: [4790, 4790],
    rows: [
      new TableRow({
        children: [
          cell(
            [
              paragraph(`Preis: ${priceStyle.label}`, {
                heading: true,
                color: priceStyle.color,
              }),
              paragraph(
                `${priceDelta > 0 ? "+" : priceDelta < 0 ? "-" : ""}${money(
                  Math.abs(priceDelta),
                )}`,
                { heading: true, color: priceStyle.color, size: 22 },
              ),
            ],
            { fill: priceStyle.fill, width: 4790 },
          ),
          cell(
            [
              paragraph(co2Style.label, {
                heading: true,
                color: co2Style.color,
              }),
              paragraph(
                `${co2Delta > 0 ? "+" : co2Delta < 0 ? "-" : ""}${swiss(
                  Math.abs(co2Delta),
                )} kg CO₂e`,
                { heading: true, color: co2Style.color, size: 22 },
              ),
            ],
            { fill: co2Style.fill, width: 4790 },
          ),
        ],
      }),
    ],
  });

  return new Document({
    creator: "Kästli Unternehmungen",
    title: "Ökologischer Variantenvergleich",
    description:
      "Bearbeitbare Offertenbeilage mit Preis- und CO₂-Vergleich",
    styles: {
      default: {
        document: {
          run: {
            font: "Museo Sans 300",
            size: 17,
            color: COLORS.anthracite,
          },
          paragraph: { spacing: { after: 60, line: 220 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top: 2268,
              right: 624,
              bottom: 1701,
              left: 1701,
              header: 510,
              footer: 680,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 },
                children: [
                  new ImageRun({
                    type: "jpg",
                    data: logo,
                    transformation: { width: 125, height: 34 },
                    altText: {
                      title: "Kästli",
                      description: "Kästli Logo",
                      name: "Kästli Logo",
                    },
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                spacing: { after: 0, line: 210 },
                children: [
                  run("Kästli Unternehmungen", {
                    heading: true,
                    size: 18,
                  }),
                  run(" | Altes Riedgässli 2 | 3113 Rubigen", { size: 18 }),
                ],
              }),
              paragraph(
                "+41 31 939 31 31 | info@kaestligruppe.ch | kaestligruppe.ch",
                { size: 18 },
              ),
            ],
          }),
        },
        children: [
          paragraph("VARIANTENVERGLEICH", {
            heading: true,
            color: COLORS.red,
            size: 36,
            after: 20,
          }),
          paragraph("Preis und CO₂ transparent gegenübergestellt", {
            heading: true,
            size: 20,
            after: 70,
          }),
          paragraph(
            `Projekt ${input.projectName} | Baustelle ${input.location} | ${swiss(
              input.distance,
            )} km ab Werk Rubigen`,
            { color: "6B7072", size: 15, after: 80 },
          ),
          comparisonTable,
          paragraph("PREISVERGLEICH", {
            heading: true,
            color: COLORS.red,
            size: 15,
            before: 80,
            after: 25,
          }),
          barTable(
            input.requestedPriceTotal,
            input.alternativePriceTotal,
            money,
            priceStyle.color,
          ),
          paragraph("CO₂E · HERSTELLUNG + TRANSPORT", {
            heading: true,
            color: COLORS.red,
            size: 15,
            before: 55,
            after: 25,
          }),
          barTable(
            input.requestedCo2Total,
            input.alternativeCo2Total,
            (value) => `${swiss(value)} kg`,
            co2Style.color,
          ),
          paragraph("", { after: 35 }),
          resultTable,
          paragraph(
            `Transportannahme: ${input.requestedTrips} Fuhre${
              input.requestedTrips === 1 ? "" : "n"
            } Bauherrenvariante / ${input.alternativeTrips} Fuhre${
              input.alternativeTrips === 1 ? "" : "n"
            } Kästli-Alternative mit 40-t-Dieselfahrzeug, ${swiss(
              input.payload,
            )} t Nutzlast, Hin- und Rückweg (${swiss(
              input.roundTripDistance,
            )} km je Fuhre), ${swiss(
              input.truckFactor,
              3,
            )} kg CO₂e/Fz-km. Bei den Produktwerten werden ausschliesslich Herstellungsemissionen A1–A3 in kg CO₂e berücksichtigt; Entsorgung und Lebensende sind nicht enthalten. Preise exkl. MWST und ohne Transportkosten.`,
            { size: 12, color: "6B7072", before: 70 },
          ),
        ],
      },
    ],
  });
}

export async function packVariantDocument(document: Document) {
  return Packer.toBlob(document);
}
