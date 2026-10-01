import { Suspense } from "react";
import { Announcement } from "@/components/layout/announcement";
import { Footer } from "@/components/layout/footer";
import { Navbar, NavbarFallback } from "@/components/layout/navbar";
import { BagToast } from "@/components/cart/bag-toast";
import { PageTransition } from "@/components/motion/page-transition";
import { ScrollProgress } from "@/components/motion/scroll-progress";
import { SmoothScroll } from "@/components/motion/smooth-scroll";

export default function StoreLayout({ children }: LayoutProps<"/">) {
  return (
    <SmoothScroll>
      <ScrollProgress />
      <Announcement />
      <Suspense fallback={<NavbarFallback />}>
        <Navbar />
      </Suspense>
      <main id="main" tabIndex={-1} className="outline-none">
        <PageTransition>{children}</PageTransition>
      </main>
      <Footer />
      <BagToast />
    </SmoothScroll>
  );
}
