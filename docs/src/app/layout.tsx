import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import { DM_Sans, Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import {Metadata} from "next";

const inter = Inter({
  subsets: ["latin"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "WONK", "opsz"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    template: '%s | Telaio - Build backends with certainty.',
    default: 'Telaio - Build backends with certainty.',
  },
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.className} ${fraunces.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
