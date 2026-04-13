import type { Metadata } from "next";
import localFont from "next/font/local";
import "@fontsource-variable/noto-serif-sc";
import "./globals.css";

const silkscreen = localFont({
  variable: "--font-pixel",
  src: [
    { path: "../../public/fonts/Silkscreen-Regular.woff2", weight: "400" },
    { path: "../../public/fonts/Silkscreen-Bold.woff2", weight: "700" },
  ],
});

const jetbrainsMono = localFont({
  variable: "--font-code",
  src: "../../public/fonts/JetBrainsMono-Latin.woff2",
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
      className={`${silkscreen.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
