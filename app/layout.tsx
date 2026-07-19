import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: {
    default: "Atlas AI — Inteligência comercial imobiliária",
    template: "%s | Atlas AI",
  },
  description:
    "A plataforma de inteligência comercial que transforma leads em vendas previsíveis para incorporadoras e imobiliárias.",
  applicationName: "Atlas AI",
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
