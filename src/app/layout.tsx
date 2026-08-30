import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { GeoProvider } from "@/components/providers/GeoProvider";
import { LayoutContent } from "@/components/layout/LayoutContent";
import { cn } from "@/lib/utils/cn";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "Mavins — Artist Growth Platform",
  description: "Promote your music with real playlist pushes. Track growth with Spotify-style analytics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={cn(inter.className, inter.variable, playfair.variable, "luxury-vignette")}>
        {/* Task 45 Part 2 (handover.md) — QueryProvider added here,
            genuinely root-level, alongside Auth/Theme. GeoProvider
            joined it here as of Task 47 — previously believed to be
            mounted per-page in promote/page.tsx and fund-wallet/
            page.tsx, but that was a misreading of a grep match: those
            two files only ever imported `useGeo` from this provider's
            file path, they never actually rendered <GeoProvider>
            itself anywhere. The only place that ever happened was
            src/app/providers.tsx, which has zero importers anywhere
            in the app (see that file's own header comment) — meaning
            useGeo() has never resolved real detected geo data
            ANYWHERE in this app until now, not just on the home page
            as originally scoped. Deliberately placed outside
            AuthProvider, matching GeoProvider's own documented design
            intent: detected-connection geolocation has no relationship
            to login state and shouldn't reset on a login/logout event. */}
        <GeoProvider>
        <QueryProvider>
          <AuthProvider>
            <ThemeProvider>
              <LayoutContent>{children}</LayoutContent>
            </ThemeProvider>
          </AuthProvider>
        </QueryProvider>
        </GeoProvider>
      </body>
    </html>
  );
}

