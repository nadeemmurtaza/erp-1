import type { Metadata } from 'next';
import { LegalPage } from '@/components/storefront/legal-page';
import type { RailSection } from '@/components/ui';
import { businessProfile } from '@/config/business-profile';

export const metadata: Metadata = {
  title: `Privacy Policy — ${businessProfile.shortName}`,
  description: `Learn how ${businessProfile.shortName} collects, uses, stores, and protects your personal information when you shop with us.`,
};

const SECTIONS: RailSection[] = [
  {
    id: 'introduction',
    label: '1. Introduction',
    content: (
      <>
        <p>
          {businessProfile.name} (&quot;{businessProfile.shortName},&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting
          the privacy and personal information of our customers, visitors, and users. This Privacy Policy
          explains what information we collect, how we use it, with whom we share it, and the choices
          you have regarding your personal data.
        </p>
        <p>
          This policy applies to all information collected through our website at{' '}
          <strong>{businessProfile.domain}</strong>, our mobile-optimised storefront, our admin systems, and any
          related communications (SMS, email, WhatsApp) we send to you.
        </p>
        <p>
          By using our Site or placing an order, you consent to the collection and use of information in
          accordance with this Privacy Policy. If you do not agree, please refrain from using our Site
          or services.
        </p>
      </>
    ),
  },
  {
    id: 'information-we-collect',
    label: '2. Information We Collect',
    content: (
      <>
        <p>We collect the following categories of personal information:</p>

        <h3>a. Information You Provide Directly</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Account registration:</strong> Name, email address, phone number, and password (stored as a secure hash — we never store your plain password).</li>
          <li><strong>Ordering:</strong> Billing and delivery address, phone number, order contents, and payment method preference.</li>
          <li><strong>Stitching services:</strong> Body measurements (e.g., chest, waist, length, sleeve), garment preferences, custom design notes, and style selections.</li>
          <li><strong>Communication:</strong> Messages, enquiries, complaints, or feedback you send us via email, WhatsApp, or the contact form.</li>
        </ul>

        <h3>b. Information Collected Automatically</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Usage data:</strong> Pages visited, time spent, links clicked, and the referring URL.</li>
          <li><strong>Device data:</strong> Browser type, operating system, screen resolution, and language settings.</li>
          <li><strong>Session data:</strong> Anonymous session identifiers used to maintain your shopping cart and login state. These are never linked to your identity without your consent.</li>
          <li><strong>IP address:</strong> Collected for fraud prevention and security purposes. We do not use it to identify or track individual users beyond security screening.</li>
        </ul>

        <h3>c. Information from Third Parties</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Payment processors:</strong> We receive a transaction reference and payment status from our payment gateway. We do not receive or store your full card details.</li>
          <li><strong>Courier services:</strong> Delivery status updates and proof of delivery associated with your order.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'how-we-use-your-information',
    label: '3. How We Use Your Information',
    content: (
      <>
        <p>We use your personal information for the following purposes:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Order processing:</strong> To confirm, process, pack, dispatch, and deliver your orders; to send order status updates via SMS or email.</li>
          <li><strong>Stitching services:</strong> To record your measurements and style preferences for accurate garment construction, and to maintain your measurement profile for future orders.</li>
          <li><strong>Account management:</strong> To create and manage your account, authenticate your login, and enable saved addresses and order history.</li>
          <li><strong>Customer support:</strong> To respond to your enquiries, resolve complaints, and coordinate returns or exchanges.</li>
          <li><strong>Fraud prevention and security:</strong> To detect, investigate, and prevent fraudulent transactions, unauthorised account access, and other illegal activities.</li>
          <li><strong>Legal compliance:</strong> To comply with applicable {businessProfile.country} laws, tax regulations, and court orders.</li>
          <li><strong>Marketing (with consent):</strong> To send promotional offers, new arrivals, and seasonal campaigns via SMS or email, only where you have opted in. You may opt out at any time.</li>
          <li><strong>Site improvement:</strong> To analyse aggregated, anonymised usage patterns and improve the performance, design, and content of our Site.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'legal-basis-for-processing',
    label: '4. Legal Basis for Processing',
    content: (
      <>
        <p>We process your personal data on the following legal grounds:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Contractual necessity:</strong> Processing required to fulfil an order or provide a stitching service you have requested.</li>
          <li><strong>Legitimate interest:</strong> Fraud detection, platform security, and improving our services — balanced against your rights and interests.</li>
          <li><strong>Legal obligation:</strong> Compliance with tax laws, regulatory requirements, or court orders.</li>
          <li><strong>Consent:</strong> Marketing communications and optional analytics cookies, where explicitly consented to.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'sharing-your-information',
    label: '5. Sharing Your Information',
    content: (
      <>
        <p>
          We do not sell, rent, or trade your personal information to third parties for their marketing
          purposes. We share your data only in the following limited circumstances:
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Courier and logistics partners:</strong> Your name, phone number, and delivery address are shared with our courier partners solely for the purpose of delivering your order.</li>
          <li><strong>Payment processors:</strong> Your payment details are transmitted directly to our secure payment gateway. We only receive a confirmation token and transaction status.</li>
          <li><strong>Technology service providers:</strong> Our hosting, cloud storage, and email service providers may process your data on our behalf under strict data processing agreements that prohibit them from using your data for any other purpose.</li>
          <li><strong>Legal and regulatory authorities:</strong> Where required by {businessProfile.country} law, regulation, or a valid court order, we may disclose your information to law enforcement or regulatory bodies.</li>
          <li><strong>Business transfers:</strong> In the event of a merger, acquisition, or sale of all or part of our business, your personal data may be transferred to the new entity, subject to the same level of protection as described in this policy.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'data-retention',
    label: '6. Data Retention',
    content: (
      <>
        <p>
          We retain your personal information for as long as is necessary to fulfil the purposes for
          which it was collected, as follows:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Order data:</strong> Retained for 7 years from the date of the transaction to comply with {businessProfile.country} tax and business record-keeping requirements.</li>
          <li><strong>Account data:</strong> Retained for as long as your account is active. Upon account deletion, identifiable data is anonymised or deleted within 30 days, except where retention is legally required.</li>
          <li><strong>Measurement profiles:</strong> Retained as part of your account until you delete them or close your account.</li>
          <li><strong>Marketing consent records:</strong> Retained for 3 years from the date of consent or last interaction, whichever is later.</li>
          <li><strong>Security logs:</strong> Retained for 90 days for fraud investigation purposes.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'your-measurement-data',
    label: '7. Your Measurement Data',
    content: (
      <>
        <p>
          Your body measurements are sensitive personal data. We treat them with the highest level of
          care. They are:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Stored in encrypted form in our database.</li>
          <li>Accessible only by authorised tailoring staff for the purpose of fulfilling your stitching order.</li>
          <li>Never shared with third parties except as strictly necessary for stitching fulfilment.</li>
          <li>Deletable by you at any time from your account&apos;s measurement profile section.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'cookies-tracking',
    label: '8. Cookies & Tracking',
    content: (
      <>
        <p>
          We use the following types of cookies and similar technologies:
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Essential cookies:</strong> Required for the Site to function — maintaining your session, keeping items in your cart, and remembering your login. These cannot be disabled without breaking core Site functionality.</li>
          <li><strong>Analytics cookies (optional):</strong> Anonymous, aggregate data about how visitors use the Site, to help us improve the experience. We use first-party analytics only — we do not use Google Analytics or Facebook Pixel tracking by default.</li>
          <li><strong>Marketing cookies (optional):</strong> Set only with your explicit consent for personalised advertising. You may withdraw consent at any time by clearing your cookies or contacting us.</li>
        </ul>
        <p>
          You can manage cookie preferences through your browser settings. Please note that disabling
          essential cookies will prevent you from using the cart, checkout, or login features.
        </p>
      </>
    ),
  },
  {
    id: 'data-security',
    label: '9. Data Security',
    content: (
      <>
        <p>
          We implement industry-standard technical and organisational security measures to protect your
          personal data from unauthorised access, alteration, disclosure, or destruction. These
          measures include:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>HTTPS encryption for all data transmitted between your browser and our servers.</li>
          <li>Passwords stored as one-way bcrypt hashes — not readable by our staff.</li>
          <li>Regular automated database backups stored off-site.</li>
          <li>Access to personal data restricted to authorised personnel only, on a need-to-know basis.</li>
          <li>No payment card data stored on our servers — handled entirely by our PCI-compliant payment gateway.</li>
        </ul>
        <p>
          Despite our best efforts, no method of transmission over the internet or electronic storage is
          100% secure. We cannot guarantee absolute security but will notify you promptly in the event
          of a data breach that affects your rights or freedoms.
        </p>
      </>
    ),
  },
  {
    id: 'your-rights',
    label: '10. Your Rights',
    content: (
      <>
        <p>You have the following rights regarding your personal information:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Access:</strong> You may request a copy of the personal data we hold about you.</li>
          <li><strong>Correction:</strong> You may update inaccurate or incomplete information directly through your account settings, or by contacting us.</li>
          <li><strong>Deletion:</strong> You may request deletion of your account and associated personal data, subject to our legal retention obligations.</li>
          <li><strong>Opt-out of marketing:</strong> You may unsubscribe from marketing communications at any time by clicking the unsubscribe link in any email, replying STOP to any SMS, or contacting us directly.</li>
          <li><strong>Data portability:</strong> You may request your order history and measurement data in a structured, machine-readable format.</li>
          <li><strong>Withdraw consent:</strong> Where processing is based on consent (e.g., marketing), you may withdraw consent at any time without affecting the lawfulness of prior processing.</li>
        </ul>
        <p>
          To exercise any of these rights, contact us at{' '}
          <a href={`mailto:${businessProfile.email}`} className="text-blue-600 underline hover:text-blue-800">
            {businessProfile.email}
          </a>
          . We will respond within 30 days.
        </p>
      </>
    ),
  },
  {
    id: 'children-s-privacy',
    label: '11. Children\'s Privacy',
    content: (
      <>
        <p>
          Our Site is not directed at children under the age of 13. We do not knowingly collect
          personal information from children. If you believe a child has provided us with personal
          information without parental consent, please contact us and we will delete it promptly.
        </p>
      </>
    ),
  },
  {
    id: 'changes-to-this-policy',
    label: '12. Changes to This Policy',
    content: (
      <>
        <p>
          We may update this Privacy Policy from time to time. Any material changes will be communicated
          by posting the updated policy on this page with a revised effective date. We encourage you to
          review this policy periodically.
        </p>
      </>
    ),
  },
  {
    id: 'contact-us',
    label: '13. Contact Us',
    content: (
      <>
        <p>
          For any privacy-related questions, requests, or concerns, please contact our Privacy Team:
        </p>
        <ul className="list-none space-y-1 pl-0">
          <li><strong>Email:</strong> <a href={`mailto:${businessProfile.email}`} className="text-blue-600 underline hover:text-blue-800">{businessProfile.email}</a></li>
          <li><strong>WhatsApp:</strong> <a href={`https://wa.me/${businessProfile.whatsapp.replace(/[^0-9]/g, '')}`} className="text-blue-600 underline hover:text-blue-800">{businessProfile.whatsapp}</a></li>
          <li><strong>Address:</strong> {businessProfile.address}</li>
        </ul>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="Last updated: 29 August 2026  ·  Effective immediately"
      sections={SECTIONS}
    />
  );
}
