import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: {
    default: "Atlas AI — Real Estate Intelligence",
    template: "%s | Atlas AI",
  },
  description:
    "Sistema operacional imobiliário para leads, imóveis, vendas, marketing e inteligência comercial.",
  applicationName: "Atlas AI Real Estate OS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
