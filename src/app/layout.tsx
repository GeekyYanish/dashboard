import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { PrefsProvider, PREFS_BOOT_SCRIPT } from "@/frontend/prefs";
import { Toaster } from "@/frontend/components/neo/toaster";
import { FEST } from "@/lib/fest.config";

/**
 * Three roles, three faces:
 *   Bricolage Grotesque — display. Headings and the big KPI numerals. Enough
 *     character to carry the "instrument panel" idea without being a novelty.
 *   Archivo — UI and tables. A workhorse grotesque with excellent tabular
 *     figures, which is what 3,000 rows of money actually needs.
 *   JetBrains Mono — UTRs, registration IDs, invoice serials. Reference numbers
 *     get compared character-by-character; monospace is functional here.
 */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `Registration Console — ${FEST.fullName}`,
    template: `%s — ${FEST.fullName}`,
  },
  description: `Registration, payments and on-ground operations console for ${FEST.fullName}, ${FEST.tagline}.`,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eceae4" },
    { media: "(prefers-color-scheme: dark)", color: "#26262a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bricolage.variable} ${archivo.variable} ${jetbrains.variable} h-full`}
    >
      <head>
        {/* Applies stored theme/density before first paint — no flash. */}
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full antialiased">
        <PrefsProvider>
          {children}
          <Toaster />
        </PrefsProvider>
      </body>
    </html>
  );
}
