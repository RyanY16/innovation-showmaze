import "./globals.css";
import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";

const gameFont = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-body"
});

export const metadata: Metadata = {
  title: "Innovation Showmaze",
  description: "A collaborative maze experience for innovation demos."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${gameFont.variable} scanlines`}>{children}</body>
    </html>
  );
}
