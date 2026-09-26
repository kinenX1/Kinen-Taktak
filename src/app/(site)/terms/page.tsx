import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply when using the MovEra website and client portal.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="[Insert date]"
      intro={<p>These terms govern your use of the {siteConfig.name} website and client portal.</p>}
      sections={[
        { id: "acceptance", title: "Acceptance of terms", body: <p>[Replace with final text.] By creating an account or using the site you agree to these terms.</p> },
        {
          id: "accounts",
          title: "Accounts",
          body: <p>[Replace with final text.] You are responsible for keeping your login details confidential and for activity under your account.</p>,
        },
        {
          id: "project-requests",
          title: "Project requests",
          body: (
            <p>
              [Replace with final text.] Submitting a project brief does not create a contract. Any engagement is governed by a
              separate written agreement or proposal.
            </p>
          ),
        },
        {
          id: "content",
          title: "Your content",
          body: <p>[Replace with final text.] You keep ownership of the information and files you submit, and grant MovEra permission to use them to evaluate your request.</p>,
        },
        { id: "acceptable-use", title: "Acceptable use", body: <p>[Replace with final text.] Do not upload unlawful or malicious content or attempt to disrupt the service.</p> },
        { id: "liability", title: "Limitation of liability", body: <p>[Replace with final text.]</p> },
        { id: "changes", title: "Changes to these terms", body: <p>[Replace with final text.]</p> },
        { id: "contact", title: "Contact", body: <p>[Replace with final text.] Contact {siteConfig.email} with any questions.</p> },
      ]}
    />
  );
}
