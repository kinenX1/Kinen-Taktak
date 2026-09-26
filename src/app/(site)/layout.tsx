import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { PageTransition } from "@/components/motion/page-transition";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <SmoothScroll>
      <Navbar />
      <main id="main" tabIndex={-1} className="outline-none">
        <PageTransition>{children}</PageTransition>
      </main>
      <Footer />
    </SmoothScroll>
  );
}
