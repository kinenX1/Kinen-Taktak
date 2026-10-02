import { getNavUser } from "@/lib/data/nav";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { PageTransition } from "@/components/motion/page-transition";
import { CursorGlow } from "@/components/motion/cursor-glow";

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const user = await getNavUser();
  return (
    <SmoothScroll>
      <CursorGlow />
      <Navbar user={user} />
      <main id="main" tabIndex={-1} className="outline-none">
        <PageTransition>{children}</PageTransition>
      </main>
      <Footer />
    </SmoothScroll>
  );
}
