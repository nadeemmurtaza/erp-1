import type { Metadata } from 'next';
import { LegalPage } from '@/components/storefront/legal-page';
import type { RailSection } from '@/components/ui';
import { businessProfile } from '@/config/business-profile';
import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';

export const metadata: Metadata = {
  title: `Returns & Refund Policy — ${businessProfile.shortName}`,
  description: `Understand our returns, exchange, and refund process for readymade garments and custom stitching orders at ${businessProfile.shortName}.`,
};

const SECTIONS: RailSection[] = [
  {
    id: 'overview',
    label: '1. Overview',
    content: (
      <>
        <p>
          At {businessProfile.shortName}, we take pride in the quality of our garments and stitching. We want you to be
          completely satisfied with every purchase. If something is not right, we are here to help.
          Please read this policy carefully before placing an order, as different rules apply to
          readymade garments and custom-stitched orders.
        </p>
        <p>
          This Returns &amp; Refund Policy forms part of our{' '}
          <Link href={ROUTES.storefront.terms} className="text-blue-600 underline hover:text-blue-800">
            Terms &amp; Conditions
          </Link>
          . By placing an order, you agree to the terms set out in this policy.
        </p>
      </>
    ),
  },
  {
    id: 'readymade-garments-returns-exchanges',
    label: '2. Readymade Garments — Returns & Exchanges',
    content: (
      <>

        <h3>Eligibility for Return</h3>
        <p>Readymade (non-stitched) garments may be returned or exchanged within <strong>7 days of delivery</strong>, provided that:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>The item is unworn, unwashed, and in its original, saleable condition.</li>
          <li>All original tags, labels, and packaging are intact and attached.</li>
          <li>The item has not been ironed, steamed, or altered in any way.</li>
          <li>The item is not from an excluded category (see Section 5 below).</li>
          <li>You have proof of purchase (order number or confirmation SMS/email).</li>
        </ul>

        <h3>How to Initiate a Return</h3>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            Contact us within 7 days of delivery via WhatsApp at {businessProfile.whatsapp} or email at{' '}
            {businessProfile.email}. Include your order number and a brief description of the reason for
            return.
          </li>
          <li>
            Our team will respond within 1–2 business days to confirm eligibility and provide return
            instructions.
          </li>
          <li>
            Pack the item securely in its original packaging (or equivalent) and ship it to the address
            we provide. We recommend using a tracked courier service.
          </li>
          <li>
            Once we receive and inspect the returned item (typically within 2–3 business days of
            receipt), we will process your exchange or refund.
          </li>
        </ol>

        <h3>Return Shipping Costs</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Manufacturing defect or wrong item sent:</strong> We will cover the full return shipping cost.</li>
          <li><strong>Change of mind or size exchange:</strong> Return shipping is at the customer&apos;s expense. We will cover the cost of re-sending the exchanged item to you once.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'custom-stitched-garments-returns-policy',
    label: '3. Custom-Stitched Garments — Returns Policy',
    content: (
      <>
        <p>
          Custom-stitched garments are made to your specific measurements and design selections and are
          therefore <strong>non-returnable and non-refundable</strong> except in the following
          circumstances:
        </p>

        <h3>Accepted Return/Remake Situations</h3>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Manufacturing defect:</strong> A clear defect in stitching quality — such as open
            seams, misaligned panels, incorrect fabric cutting, or broken stitches — that is not caused
            by wear or washing.
          </li>
          <li>
            <strong>Significant deviation from confirmed design:</strong> If the delivered garment
            differs materially from the style selections you confirmed at the time of ordering (e.g.,
            completely wrong neckline style, incorrect embellishment placement).
          </li>
          <li>
            <strong>Wrong measurements used:</strong> If our team used measurements that differ from
            those recorded in your confirmed measurement profile, we will remake the garment at no
            additional charge.
          </li>
        </ul>

        <h3>Free Fitting Adjustments</h3>
        <p>
          We offer free minor fitting adjustments — such as taking in or letting out seams by up to
          1 inch — within <strong>7 days of delivery</strong>, provided the garment has not been worn,
          washed, or externally altered. To request a fitting adjustment, contact us with your order
          number and a description of the required change.
        </p>

        <h3>Not Covered</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Dissatisfaction with a style choice you confirmed at ordering (e.g., you changed your mind about the neckline).</li>
          <li>Size issues arising from incorrect measurements submitted by the customer.</li>
          <li>Colour variation due to screen display differences.</li>
          <li>Garments that have been worn, washed, or altered by a third party.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'defective-or-wrong-items',
    label: '4. Defective or Wrong Items',
    content: (
      <>
        <p>
          If you receive an item that is defective, damaged in transit, or different from what you
          ordered, please contact us <strong>within 48 hours of delivery</strong> with:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Your order number.</li>
          <li>Clear photographs showing the defect or discrepancy.</li>
          <li>A brief description of the issue.</li>
        </ul>
        <p>
          We will arrange collection of the item at our cost and either replace it or issue a full
          refund, at your preference, within 5–7 working days of collecting the returned item.
        </p>
      </>
    ),
  },
  {
    id: 'non-returnable-items',
    label: '5. Non-Returnable Items',
    content: (
      <>
        <p>The following items are excluded from our returns policy and cannot be returned or exchanged:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Custom-stitched garments (except as described in Section 3).</li>
          <li>Items marked &quot;Final Sale&quot; or &quot;Non-Returnable&quot; on the product page.</li>
          <li>Undergarments, innerwear, and hosiery for hygiene reasons.</li>
          <li>Items that have been worn, washed, ironed, or altered.</li>
          <li>Items without original tags or packaging.</li>
          <li>Gift cards and store credit vouchers.</li>
          <li>Items purchased during clearance sales (unless defective).</li>
        </ul>
      </>
    ),
  },
  {
    id: 'exchanges',
    label: '6. Exchanges',
    content: (
      <>
        <p>
          We offer size and colour exchanges on eligible readymade garments, subject to availability.
          If your preferred size or colour is unavailable, we will issue store credit or a refund.
        </p>
        <p>
          To request an exchange, follow the same process as a return (Section 2). Please clearly state
          the size or colour you would like in exchange. Exchange items are dispatched within 3–5
          business days of receiving the returned item.
        </p>
      </>
    ),
  },
  {
    id: 'refunds',
    label: '7. Refunds',
    content: (
      <>

        <h3>Refund Method</h3>
        <p>Refunds are issued via the original payment method where possible:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Bank transfer / online payment:</strong> Refunded to the original account within 5–7 working days of approval.</li>
          <li><strong>Cash on Delivery orders:</strong> Refunded via bank transfer. You will need to provide your bank account details (account title, account number, and bank name/IBAN) for processing.</li>
          <li><strong>Store credit:</strong> If preferred, you may opt for store credit which will be added to your account immediately upon return approval and can be used on any future order.</li>
        </ul>

        <h3>Refund Timeline</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Return inspection:</strong> 2–3 business days after we receive the returned item.</li>
          <li><strong>Refund processing:</strong> 1–2 business days after inspection approval.</li>
          <li><strong>Bank processing:</strong> 3–5 additional business days depending on your bank.</li>
        </ul>
        <p>
          Total expected timeline: <strong>5–10 working days</strong> from the date we receive the
          returned item.
        </p>

        <h3>Shipping Fee Refunds</h3>
        <p>
          Original delivery charges are non-refundable unless the return is due to a defective or
          incorrect item sent by us.
        </p>
      </>
    ),
  },
  {
    id: 'order-cancellations',
    label: '8. Order Cancellations',
    content: (
      <>

        <h3>Before Dispatch</h3>
        <p>
          You may cancel a readymade garment order before it has been dispatched by contacting us via
          WhatsApp or email with your order number. If cancelled before dispatch, a full refund will
          be issued. We aim to process orders quickly, so please contact us as soon as possible.
        </p>

        <h3>After Dispatch</h3>
        <p>
          Once an order has been dispatched, it cannot be cancelled. You may refuse delivery of the
          parcel and it will be returned to us. Upon receipt and inspection, a refund of the item
          price (excluding delivery charges) will be processed. COD orders refused at delivery will
          have the item cost refunded via bank transfer; the COD handling fee is non-refundable.
        </p>

        <h3>Custom Stitching Orders</h3>
        <p>
          Custom stitching orders can be cancelled within <strong>24 hours of placement</strong> for a
          full refund. After 24 hours, if cutting has not yet commenced, a 20% cancellation fee
          applies. Once cutting has commenced, the order cannot be cancelled and no refund is
          available, except as described in Section 3.
        </p>
      </>
    ),
  },
  {
    id: 'dispute-resolution',
    label: '9. Dispute Resolution',
    content: (
      <>
        <p>
          If you are not satisfied with the outcome of a return, exchange, or refund request, please
          escalate the matter to our management team by emailing{' '}
          <a href={`mailto:${businessProfile.email}`} className="text-blue-600 underline hover:text-blue-800">
            {businessProfile.email}
          </a>{' '}
          with the subject line &quot;Return Dispute — [Your Order Number].&quot; We will review your case
          independently and respond within 3 business days.
        </p>
        <p>
          We are committed to resolving all customer concerns fairly and promptly. We value your
          trust and aim to find a resolution that is satisfactory to both parties.
        </p>
      </>
    ),
  },
  {
    id: 'contact-us',
    label: '10. Contact Us',
    content: (
      <>
        <p>For any return, exchange, or refund enquiry, please contact our Customer Care team:</p>
        <ul className="list-none space-y-1 pl-0">
          <li><strong>WhatsApp:</strong> <a href={`https://wa.me/${businessProfile.whatsapp.replace(/[^0-9]/g, '')}`} className="text-blue-600 underline hover:text-blue-800">{businessProfile.whatsapp}</a> ({businessProfile.workingHours})</li>
          <li><strong>Email:</strong> <a href={`mailto:${businessProfile.email}`} className="text-blue-600 underline hover:text-blue-800">{businessProfile.email}</a></li>
          <li><strong>Website:</strong> {businessProfile.domain}</li>
          <li><strong>Response time:</strong> Within 1–2 business days</li>
        </ul>
      </>
    ),
  },
];

export default function ReturnsPage() {
  return (
    <LegalPage
      title="Returns & Refund Policy"
      updated="Last updated: 29 August 2026  ·  Effective immediately"
      sections={SECTIONS}
    />
  );
}
