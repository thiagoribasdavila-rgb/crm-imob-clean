import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
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
  // As variáveis --font-geist-sans e --font-geist-mono já eram consumidas pelo
  // globals.css, mas nunca eram definidas: a interface inteira caía na fonte do
  // sistema. Carregá-las aqui cumpre a promessa que o CSS já fazia.
  return (
    <html
      lang="pt-BR"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Aplica o tema ANTES da primeira pintura. Sem isto o navegador desenha o tema
          padrão e troca em seguida — o "flash" que denuncia que a escolha do usuário é
          uma correção, não uma decisão. Precisa ser script inline e síncrono no <head>:
          um efeito de React roda tarde demais.

          Sem dependência nova, de propósito. São nove linhas contra um pacote.
          O padrão continua escuro: só troca quem escolheu.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("atlas:theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
