import type { Metadata } from "next";
import { Silkscreen, Noto_Serif_SC, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const silkscreen = Silkscreen({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const notoSerifSC = Noto_Serif_SC({
  variable: "--font-serif-sc",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-code",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Pixelverse",
  description: "像素宇宙，创意工坊",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${silkscreen.variable} ${notoSerifSC.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
