import { ButtonLink } from "@/components/ui/button";
import { Folder } from "@/components/ui/icons";
import { EmptyState } from "@/components/dashboard/page-header";

export default function NotFound() {
  return (
    <>
    <h1 className="sr-only">Page not found</h1>
    <EmptyState
      icon={<Folder size={20} />}
      title="We couldn't find that"
      action={
        <ButtonLink href="/dashboard" size="sm" variant="secondary">
          Back to your dashboard
        </ButtonLink>
      }
    >
      It may have been removed, or you may not have access to it.
    </EmptyState>
    </>
  );
}
