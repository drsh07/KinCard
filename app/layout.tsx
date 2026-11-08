import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KinCard · A little familiarity. A better visit.",
  description: "The person behind the care. A care card that helps every caregiver know the person.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
