import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kästli | Ökologischer Variantenvergleich",
  description:
    "Preis- und CO₂-Vergleich für frei wählbare Asphalt- und Betonvarianten mit Transportberechnung.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      {
        url: "/kaestli-favicon.png",
        type: "image/png",
        sizes: "512x512",
      },
    ],
    shortcut: "/favicon.ico",
    apple: {
      url: "/kaestli-favicon.png",
      type: "image/png",
      sizes: "512x512",
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
