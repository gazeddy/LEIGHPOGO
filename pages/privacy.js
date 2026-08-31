import Head from "next/head"
import Link from "next/link"
import {
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_VERSION,
} from "../lib/privacyPolicy"

export default function PrivacyPolicy() {
  return (
    <main className="container privacy-page">
      <Head>
        <title>Privacy Policy | LeighPogo</title>
      </Head>

      <h1>LeighPogo Privacy Policy</h1>
      <p className="muted">
        Effective {PRIVACY_POLICY_EFFECTIVE_DATE} · Policy version {PRIVACY_POLICY_VERSION}
      </p>

      <section className="card">
        <h2>Who this policy is for</h2>
        <p>
          LeighPogo is a community Pokémon GO companion service intended for people aged 13 or over.
          This notice explains what personal information LeighPogo uses, why it is used, and the choices
          available to registered users.
        </p>
        <p>
          LeighPogo is an independent community project and is not affiliated with, endorsed by, or
          sponsored by Niantic, The Pokémon Company, Nintendo, or their affiliates.
        </p>
      </section>

      <section className="card">
        <h2>Information we use</h2>
        <ul>
          <li>Your optional display name, Pokémon GO in-game name (IGN), account role and password hash.</li>
          <li>Your trainer team and friend code when you choose to add them.</li>
          <li>Your Pokédex progress, saved search strings, wanted trades, trade listings and related notifications.</li>
          <li>
            Pokédex screenshots you upload for import. They are stored privately while the import is queued
            or processed and are removed when the import is cleared or your account is deleted.
          </li>
          <li>
            If you enable push notifications: the browser/device push endpoint, encryption keys, user-agent,
            time zone and your notification preferences.
          </li>
          <li>
            Basic usage records generated when registered users use supported features, such as event type,
            page path, broad device class and limited feature metadata. These records are used to understand
            and improve LeighPogo.
          </li>
          <li>Essential authentication/session information used to keep you signed in and protect requests.</li>
          <li>Normal server and security logs needed to operate, diagnose and protect the service.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Why we use it</h2>
        <p>We use account and feature data only as needed to provide and secure LeighPogo, including to:</p>
        <ul>
          <li>authenticate your account and keep it secure;</li>
          <li>show your trainer profile, friend code, Pokédex and trade information;</li>
          <li>match trade listings and generate requested notifications;</li>
          <li>process Pokédex screenshot imports;</li>
          <li>remember your site, ticker and push preferences; and</li>
          <li>measure feature usage, troubleshoot faults, prevent abuse and improve the service.</li>
        </ul>
        <p>
          For core account and service operation we rely on the legitimate interests of operating a useful,
          secure community service. Where a feature genuinely requires your choice, such as browser push
          notifications, you can enable or disable that feature at any time.
        </p>
      </section>

      <section className="card">
        <h2>Who receives information</h2>
        <p>
          LeighPogo does not sell personal information. Data is processed by the LeighPogo server for the
          purposes above. Information that you deliberately publish to a community feature — for example a
          friend code or active trade listing — is visible to other LeighPogo users as that feature describes.
        </p>
        <p>
          If you enable Web Push, notification delivery necessarily uses the push service selected by your
          browser or operating system. Those providers process the push endpoint and delivery traffic under
          their own terms. Links to external websites are also governed by those sites&apos; own privacy policies.
        </p>
      </section>

      <section className="card">
        <h2>Cookies and local storage</h2>
        <p>
          LeighPogo uses essential authentication cookies and related browser storage so sign-in, security,
          PWA behaviour and user-selected settings can work. We do not use advertising cookies.
        </p>
      </section>

      <section className="card">
        <h2>Retention and deletion</h2>
        <p>
          Account-linked feature data is kept while your account is active or while it is needed to provide
          the feature. Pokédex import images are temporary working files and are removed through the import
          cleanup flow. You can delete your LeighPogo account yourself from Account settings.
        </p>
        <p>
          Account deletion removes your account credentials and account-linked profile, friend-code, Pokédex,
          trade, notification, preference, import and usage records. Any queued Pokédex screenshot files for
          your account are also removed. LeighPogo retains only the former numeric internal user ID and the
          deletion timestamp as a non-profile security tombstone so authentication tokens issued before deletion
          can be rejected. Ordinary infrastructure/security logs may remain for their normal operational lifetime
          where they are required for security or fault investigation.
        </p>
      </section>

      <section className="card">
        <h2>Your rights</h2>
        <p>
          UK data-protection law may give you rights to ask for access to personal information, correction,
          deletion, restriction, objection, or a portable copy where applicable. You can also complain to the
          UK Information Commissioner&apos;s Office if you believe your information has been handled incorrectly.
        </p>
        <p>
          <strong>Privacy contact:</strong> [V4 release blocker: add a monitored LeighPogo privacy contact
          address before production deployment.]
        </p>
      </section>

      <section className="card">
        <h2>Policy acknowledgement and changes</h2>
        <p>
          Registered users are asked to acknowledge the current version of this notice. LeighPogo stores the
          policy version and acknowledgement time. If this policy changes materially, its version will change
          and registered users will be asked to read and acknowledge the new version before continuing.
        </p>
        <p>
          Acknowledging this notice confirms that you have read and understood it; it is not treated as blanket
          consent for every use of personal information.
        </p>
      </section>

      <p>
        <Link href="/">Return to LeighPogo</Link>
      </p>
    </main>
  )
}
