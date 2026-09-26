import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How MovEra collects, uses and protects personal information.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="[Insert date]"
      intro={<p>This policy explains what personal information {siteConfig.name} collects, why we collect it and the choices you have.</p>}
      sections={[
        {
          id: "information-we-collect",
          title: "Information we collect",
          body: (
            <>
              <p>[Replace with final text.] We collect information you provide directly, such as:</p>
              <ul>
                <li>Account details: name, email address and a securely hashed password.</li>
                <li>Profile details you choose to add: phone number, company and country.</li>
                <li>Project briefs, messages and files you submit.</li>
                <li>Basic technical data needed to keep your session secure, such as your browser type.</li>
              </ul>
            </>
          ),
        },
        {
          id: "how-we-use-it",
          title: "How we use information",
          body: <p>[Replace with final text.] To respond to enquiries, evaluate and deliver projects, operate the client portal, keep accounts secure and meet legal obligations.</p>,
        },
        {
          id: "cookies",
          title: "Cookies",
          body: <p>[Replace with final text.] We use essential cookies to keep you signed in. We do not use advertising cookies. Describe any analytics tools here if added.</p>,
        },
        {
          id: "sharing",
          title: "Sharing and processors",
          body: <p>[Replace with final text.] List hosting, email and storage providers that process data on MovEra&apos;s behalf.</p>,
        },
        {
          id: "retention",
          title: "Data retention",
          body: <p>[Replace with final text.] Explain how long account data, project briefs and files are kept.</p>,
        },
        {
          id: "your-rights",
          title: "Your rights",
          body: (
            <p>
              [Replace with final text.] You can access and update your profile from your dashboard and delete your account from
              Settings. For other requests, contact {siteConfig.email}.
            </p>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          body: <p>[Replace with final text.] Questions about this policy can be sent to {siteConfig.email}.</p>,
        },
      ]}
    />
  );
}
