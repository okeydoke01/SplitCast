import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";

import { WalletProvider } from "@/context/WalletContext";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "SplitCast — Decentralized Revenue & Royalty Splits on Stellar",
  description: "Atomically distribute payments to multiple creators and collaborators on the Stellar network with real-time earnings feeds and transparent configurations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#0a0a0c] text-white">
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
