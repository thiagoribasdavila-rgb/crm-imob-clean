import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: {
    default: "Atlas One — Inteligência comercial imobiliária",
    template: "%s | Atlas One",
  },
  description:
    "A plataforma de inteligência comercial que transforma leads em vendas previsíveis para incorporadoras e imobiliárias.",
  applicationName: "Atlas One",
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
