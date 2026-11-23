import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Fraunces } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SWFL Founding Beta | Consent-First Live Introductions",
  description:
    "Meet one verified person at a time. Start with voice, talk like real people, and reveal more only when you both choose to.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${fraunces.variable}`}>
      <body className="font-sans antialiased min-h-screen bg-[#161412] text-[#F5F0EB] selection:bg-[#E5C185]/30 selection:text-[#F5F0EB]">
        {children}
      </body>
    </html>
  );
}
