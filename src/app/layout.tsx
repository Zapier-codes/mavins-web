import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
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
            genuinely root-level, alongside Auth/Theme rather than
            scoped per-page like GeoProvider (see that provider's own
            usage in promote/page.tsx and fund-wallet/page.tsx — a
            different, narrower pattern, not changed here). Reference
            data is small/cheap enough that fetching it app-wide isn't
            wasteful, and it means the promote page never waits on a
            fresh fetch the first time a user reaches it. */}
        <QueryProvider>
          <AuthProvider>
            <ThemeProvider>
              <LayoutContent>{children}</LayoutContent>
            </ThemeProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

