import { createFileRoute } from "@tanstack/react-router"

import { ContactLink, LegalPage, LegalSection } from "@/features/landing/legal-page"
import { publicHead, site } from "@/lib/seo"

const PrivacyPage = () => (
  <LegalPage title="Privacy Policy">
    <LegalSection title="Who runs this">
      <p>
        The operator of {site.name} is responsible for your data here. For anything about your
        privacy, write to <ContactLink />.
      </p>
    </LegalSection>

    <LegalSection title="What we collect">
      <ul>
        <li>
          <strong>Account.</strong> Your name, email, username, preferred name, social links and
          photo. When you sign in with GitHub, it gives us your name and email.
        </li>
        <li>
          <strong>Job search.</strong> What you want from a job, your skills and locations, lowest
          acceptable pay, whether you need a visa, and answers you save for application forms.
        </li>
        <li>
          <strong>Resume.</strong> The file, its text and its review.
        </li>
        <li>
          <strong>Applications.</strong> Roles, statuses, notes, tasks, goals and the answers
          prepared for each form.
        </li>
        <li>
          <strong>Mail and contacts.</strong> If you connect your Cloudflare account: its access
          token, your messages and drafts, and the people you write to.
        </li>
        <li>
          <strong>Calendar and booking.</strong> Your events and attendees. Guests who book through
          your pages give their name, email and a note.
        </li>
        <li>
          <strong>Activity.</strong> A record of what you changed, what the app did for you and what
          failed. Summaries can name companies and goals.
        </li>
        <li>
          <strong>Analytics.</strong> Page views, page speed, clicks on links that leave the site
          and session replays. Separately, our server tells Databuddy when an AI crawler or AI agent
          requests a page, except booking pages: the path, host, user agent, accept header, referrer
          and the format asked for. An AI browser acting for you can be counted this way, and
          browser privacy signals don't stop it, because it doesn't run in your browser.
        </li>
      </ul>
      <p>
        Some of this is about other people, like your contacts and booking guests. Please only add
        it if you have the right to.
      </p>
    </LegalSection>

    <LegalSection title="How we use it">
      <p>
        We use your data to run the app for you, keep it secure, fix problems and understand how
        it's used. We rely on the agreement with you to provide the app, on legitimate interests for
        security and analytics, and on your consent where we ask for it. We don't sell your data,
        and we don't use it for advertising.
      </p>
    </LegalSection>

    <LegalSection title="Who we share it with">
      <p>Only with the services that make the app work, and only for what's listed here:</p>
      <ul>
        <li>
          <strong>Convex.</strong> Hosts the database, backend and files, so it holds everything
          above.
        </li>
        <li>
          <strong>Cloudflare.</strong> Hosts the website. If you connect your own Cloudflare
          account, your token, messages and recipients are used there to send and receive mail.
        </li>
        <li>
          <strong>TypeSafe (the Jev model), through the Convex AI gateway.</strong> Your
          preferences, skills, pay and visa needs, the roles you rated, your saved answers and form
          questions, goals and workflow text, and your resume text when you press Review. If you
          allow it, also each email's sender, subject and up to 4,000 characters of its text.
        </li>
        <li>
          <strong>Anthropic (the Claude model), through the Convex AI gateway.</strong> To draft
          answers: the job posting, saved answers that aren't personal details, and up to 6,000
          characters of your resume. The app tries to remove your email and phone number first, but
          this is automatic and can miss things, and other personal details stay in. These requests
          ask the provider not to keep the data. Requests to Jev don't.
        </li>
        <li>
          <strong>Firecrawl.</strong> Search terms from your loops and the posting addresses. When
          you open a form, also your answers and a link to your resume, so its browser can fill the
          form in.
        </li>
        <li>
          <strong>AI agents you connect.</strong> If you connect an agent, such as Claude or
          ChatGPT, its company gets what you allow when you connect it, which can include your
          preferences, your shortlist, your prepared applications and their answers, your goals,
          views, loops and workflows, and your contacts. Disconnect one any time under Account.
        </li>
        <li>
          <strong>context.dev.</strong> Search terms and company domains, used to find job boards.
        </li>
        <li>
          <strong>Arbeitsagentur.</strong> For a loop in your places, the kinds of work you listed
          and those places, used to search Germany&apos;s federal job board. Nothing that names you.
        </li>
        <li>
          <strong>GitHub.</strong> Handles sign-in.
        </li>
        <li>
          <strong>Databuddy.</strong> Analytics and session replays.
        </li>
      </ul>
      <p>
        When you press Submit on a form, your application goes to that company and the site it uses.
        Their own privacy policies apply from there. We may also share data if the law requires it.
        These services may process data outside your country.
      </p>
    </LegalSection>

    <LegalSection title="Cookies and browser storage">
      <p>The app keeps a few things in your browser:</p>
      <ul>
        <li>Your sign-in tokens and color theme, in local storage.</li>
        <li>Whether the sidebar is open, in a cookie that lasts 7 days.</li>
        <li>Calendar display settings, in local storage.</li>
        <li>Session and anonymous visitor IDs for analytics, set by Databuddy.</li>
      </ul>
    </LegalSection>

    <LegalSection title="Security">
      <p>
        Cloudflare tokens, connection details, mail, contacts and drafts are encrypted with
        AES-256-GCM, under a key only the server holds. Your resume, saved answers, applications and
        calendar don't get this extra layer. We try to keep your data safe, but no system is
        completely secure, so please think about what you store here.
      </p>
      <p>
        The app is built to skip demographic questions, like gender, race or disability, but it
        recognizes them by their wording and can miss one, so check each form. It doesn't store
        job-site passwords.
      </p>
    </LegalSection>

    <LegalSection title="How long we keep it">
      <ul>
        <li>Archived applications move to Trash after 30 days.</li>
        <li>
          Trash is deleted after the time you choose: 30, 90 (the default), 180 or 365 days, or
          never.
        </li>
        <li>Activity records are kept for 90 days.</li>
        <li>Everything else stays until you delete it or your account.</li>
      </ul>
    </LegalSection>

    <LegalSection title="Deleting your account">
      <p>
        Delete your account from the Account page. Your profile, resume file, mail, notifications
        and other records are removed right away or shortly after, in the background. A few things
        stay:
      </p>
      <ul>
        <li>An empty account record and your sign-in link with GitHub or your password record.</li>
        <li>
          Anything in your own Cloudflare account, like the email Worker. You can remove it there.
        </li>
        <li>Data that providers already received, which their own policies cover.</li>
      </ul>
      <p>
        To have the rest removed, or if something looks left behind, write to <ContactLink />.
      </p>
    </LegalSection>

    <LegalSection title="Your rights">
      <p>
        Depending on where you live, you can ask to see, correct, delete or get a copy of your data,
        or object to or limit how we use it. You can withdraw consent at any time. Write to{" "}
        <ContactLink /> and we'll answer within 30 days. You can also complain to your local data
        protection authority.
      </p>
    </LegalSection>

    <LegalSection title="Age">
      <p>The app is for people aged 18 and over. We don't knowingly collect children's data.</p>
    </LegalSection>

    <LegalSection title="Changes">
      <p>
        If we change this policy, we'll update the date at the top. For bigger changes, we'll tell
        you in the app.
      </p>
    </LegalSection>
  </LegalPage>
)

export const Route = createFileRoute("/privacy")({
  head: () =>
    publicHead({
      title: "Privacy Policy | Job Tracking Helper",
      description:
        "What Job Tracking Helper stores, which services it shares data with and why, how long it's kept, and how to delete it.",
      path: "/privacy",
    }),
  component: PrivacyPage,
})
