import { Link, createFileRoute } from "@tanstack/react-router"

import { ContactLink, LegalPage, LegalSection } from "@/features/landing/legal-page"
import { publicHead, site } from "@/lib/seo"

const TermsPage = () => (
  <LegalPage title="Terms of Use">
    <LegalSection title="The agreement">
      <p>
        These terms are between you and {site.author}, who runs {site.name}. By creating an account
        or using the app, you agree to them. If you don't agree, please don't use it.
      </p>
    </LegalSection>

    <LegalSection title="Who can use it">
      <p>
        You must be at least 18 and legally able to accept these terms. Keep your sign-in details
        safe. You're responsible for what happens under your account.
      </p>
    </LegalSection>

    <LegalSection title="You're in charge of your applications">
      <p>
        The app finds roles, judges how well they fit, and prepares applications. It can also act on
        your behalf where you turn that on, such as running scheduled searches, sorting your mail,
        moving applications and sending email through workflows.
      </p>
      <ul>
        <li>
          The app opens the real application form, fills in your answers and uploads your resume. It
          can also tick boxes that ask for your consent or agreement to terms, including the
          company's terms and privacy notices.
        </li>
        <li>
          It doesn't press Submit. Before you do, check everything on the form, including any ticked
          boxes, and change whatever isn't right.
        </li>
        <li>
          Once you submit, the application is yours. You're responsible for it being true and for
          following the rules of the employer and the site it's on.
        </li>
      </ul>
    </LegalSection>

    <LegalSection title="AI can be wrong">
      <p>
        Fit judgments, drafted answers, email sorting and resume reviews come from AI models and can
        be wrong or incomplete. They aren't career, legal or immigration advice. Please check
        anything you plan to rely on.
      </p>
    </LegalSection>

    <LegalSection title="No promise of a job">
      <p>
        The app doesn't guarantee interviews, offers or any other result. Job listings come from
        third parties, so they may be out of date, inaccurate or already filled. We don't check
        them, and we don't endorse any employer.
      </p>
    </LegalSection>

    <LegalSection title="Other services">
      <p>
        The app works with services we don't run, including job boards, company application sites
        and your own Cloudflare account if you connect it. Their terms apply to your use of them,
        and we aren't responsible for them. Some sites don't allow automated tools, so it's up to
        you to decide whether to use the app with them.
      </p>
    </LegalSection>

    <LegalSection title="Your content">
      <p>
        What you add stays yours. You give us permission to store and process it only to run the app
        for you, including sending it to the providers listed in the{" "}
        <Link to="/privacy">Privacy Policy</Link>. Only add information you have the right to use,
        including details about other people.
      </p>
    </LegalSection>

    <LegalSection title="Fair use">
      <p>You agree not to:</p>
      <ul>
        <li>Send spam, or use mail or booking pages to harass or mislead anyone.</li>
        <li>Submit false information to employers, or apply as someone else.</li>
        <li>Break the law, or try to get around the app's limits or security.</li>
        <li>Try to reach other people's data, or disrupt the app.</li>
      </ul>
      <p>
        Booking pages are public to anyone with the link. They show your name, the page's title and
        location, and when you're busy, so only share them with people you trust.
      </p>
    </LegalSection>

    <LegalSection title="An early version">
      <p>
        The app is at an early stage. Features can change, stop working or be removed, and it can
        have outages or errors, including losing data. Keep your own copies of anything important,
        like your resume and application records. We may limit or end the service at any time.
      </p>
    </LegalSection>

    <LegalSection title="Ending your use">
      <p>
        You can stop at any time and delete your account from the Account page. The{" "}
        <Link to="/privacy">Privacy Policy</Link> explains what that removes. We may suspend or
        close an account that breaks these terms or puts the service or other people at risk.
      </p>
    </LegalSection>

    <LegalSection title="No warranty">
      <p>
        To the extent the law allows, the app is provided “as is” and “as available”, without
        warranties of any kind, including that it will be accurate, reliable, secure or fit for a
        particular purpose.
      </p>
    </LegalSection>

    <LegalSection title="Limits on liability">
      <p>
        To the extent the law allows, we aren't liable for indirect or consequential losses, such as
        missed job opportunities, lost income or lost data. Our total liability for any claim is
        limited to the greater of what you paid us in the 12 months before the claim and US$50.
      </p>
      <p>
        Nothing in these terms limits rights or liability that the law says can't be limited,
        including your rights as a consumer where you live.
      </p>
    </LegalSection>

    <LegalSection title="Changes">
      <p>
        We may update these terms, and we'll change the date at the top when we do. If you keep
        using the app after a change, the new terms apply. If you don't agree with them, please stop
        using it.
      </p>
    </LegalSection>

    <LegalSection title="Contact">
      <p>
        Questions about these terms: <ContactLink />
      </p>
    </LegalSection>
  </LegalPage>
)

export const Route = createFileRoute("/terms")({
  head: () =>
    publicHead({
      title: "Terms of Use | Job Tracking Helper",
      description:
        "The rules for using Job Tracking Helper: you review and submit every application, AI can be wrong, and the app doesn't promise a job.",
      path: "/terms",
    }),
  component: TermsPage,
})
