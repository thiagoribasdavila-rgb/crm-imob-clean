import "./globals.css";

export const metadata = {
  title: "CRM Imobiliário",
  description: "Sistema de leads imobiliários",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "Arial" }}>
        {children}
      </body>
    </html>
  );
}
