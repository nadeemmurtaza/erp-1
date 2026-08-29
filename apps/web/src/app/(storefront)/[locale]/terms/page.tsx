import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms & Conditions — Yaseen.pk',
  description:
    'Read the Terms and Conditions that govern your use of Yaseen.pk, including ordering, payments, stitching services, and your legal rights.',
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-gray-900">Terms &amp; Conditions</h1>
      <p className="mb-8 text-sm text-gray-500">
        Last updated: 29 August 2026 &nbsp;·&nbsp; Effective immediately
      </p>

      <div className="prose prose-gray max-w-none space-y-8 text-gray-700">

        <section>
          <h2 className="text-xl font-semibold text-gray-900">1. About These Terms</h2>
          <p>
            These Terms and Conditions (&quot;Terms&quot;) govern your access to and use of the website at{' '}
            <strong>yaseen.pk</strong> (&quot;Site&quot;), including any purchase of readymade garments, custom
            stitching services, or any other goods and services offered by{' '}
            <strong>Yaseen Fabrics &amp; Stitching</strong> (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), a business registered
            and operating in Pakistan.
          </p>
          <p>
            By browsing the Site, creating an account, placing an order, or using our stitching booking
            system, you confirm that you have read, understood, and agree to be bound by these Terms in
            full. If you do not agree with any part of these Terms, you must not use our Site or services.
          </p>
          <p>
            We reserve the right to amend these Terms at any time. Material changes will be posted on
            this page with an updated effective date. Continued use of the Site after changes constitutes
            acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">2. Eligibility</h2>
          <p>
            You must be at least 18 years of age, or have the consent of a parent or legal guardian, to
            place an order on this Site. By placing an order you represent and warrant that all information
            you submit is accurate, complete, and current, and that you are authorised to use the payment
            method you provide.
          </p>
          <p>
            We serve customers across Pakistan. Orders outside Pakistan are not currently accepted unless
            explicitly stated at checkout. We reserve the right to refuse service to any person or entity
            at our sole discretion.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">3. Product Information &amp; Pricing</h2>
          <p>
            We make every reasonable effort to display product colours, fabric textures, and dimensions
            accurately. However, the actual appearance may vary depending on your device screen calibration.
            Slight colour variation between the displayed image and the delivered item does not constitute
            a defect.
          </p>
          <p>
            All prices are listed in Pakistani Rupees (PKR) and are inclusive of applicable taxes unless
            otherwise stated. Prices are subject to change without notice. The price applicable to your
            order is the price displayed at the time you complete checkout. If a pricing error is discovered
            after your order is confirmed, we will notify you promptly and give you the option to proceed
            at the correct price or cancel the order for a full refund.
          </p>
          <p>
            Promotional prices, discount codes, and sale offers are valid for the stated period only and
            cannot be applied retrospectively to previous orders. Only one discount code may be applied
            per order unless otherwise indicated.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">4. Ordering &amp; Contract Formation</h2>
          <p>
            Placing an item in your cart does not constitute an order or reservation of stock. An order is
            formally placed only when you complete the checkout process and receive an order confirmation
            number via SMS or email. This confirmation constitutes acceptance of your offer to purchase and
            forms a binding contract between you and Yaseen.pk.
          </p>
          <p>
            We reserve the right to cancel or refuse any order at any time before dispatch for reasons
            including: suspected fraud, payment failure, product unavailability, or pricing errors. In such
            cases, any payment received will be refunded in full within 5–7 working days.
          </p>
          <p>
            For stitching orders, the contract is formed upon confirmation of your measurements and style
            selections. Once cutting has commenced on custom-stitched garments, the order cannot be
            cancelled. Please review Section 6 (Stitching Services) carefully before placing a stitching
            order.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">5. Payment</h2>
          <p>
            We accept Cash on Delivery (COD), bank transfer, and any digital payment options available at
            checkout. All online payments are processed through secure, encrypted payment gateways. We do
            not store your full card number or banking credentials on our systems.
          </p>
          <p>
            <strong>Cash on Delivery:</strong> COD is available for eligible orders and areas as determined
            at checkout. A COD handling fee may apply and will be disclosed before you confirm your order.
            If a COD order is refused at delivery without a valid reason, your account may be restricted
            from placing future COD orders.
          </p>
          <p>
            <strong>Bank Transfer / Online Payment:</strong> Orders paid by bank transfer are held pending
            payment verification. You must send proof of payment within 24 hours of placing the order.
            Orders for which payment is not confirmed within this window may be cancelled automatically.
          </p>
          <p>
            All transactions are subject to verification and fraud screening. We reserve the right to
            request additional identification before processing any payment.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">6. Stitching Services</h2>
          <p>
            Yaseen.pk offers custom stitching services for select garments. When you book a stitching
            service, you agree to provide accurate measurements and style preferences. We accept no
            liability for incorrect measurements submitted by the customer.
          </p>
          <p>
            <strong>Turnaround Time:</strong> Standard stitching orders are completed within 10–14 working
            days from the date of confirmed order. Rush orders may be accommodated subject to capacity and
            an additional fee. Turnaround times are estimates and not guaranteed.
          </p>
          <p>
            <strong>Style Selections:</strong> Once your stitching order is confirmed and cutting has
            commenced, changes to style, design, or measurements cannot be accepted. Please double-check
            all selections before confirming.
          </p>
          <p>
            <strong>Fitting Adjustments:</strong> Minor fitting adjustments — such as taking in or letting
            out seams by up to 1 inch — are offered free of charge within 7 days of delivery, provided
            the garment has not been worn, washed, or altered externally.
          </p>
          <p>
            <strong>Customer-Supplied Fabric:</strong> If you supply your own fabric, we accept no
            responsibility for fabric quality, quantity errors, or damage arising from inherent fabric
            defects. We recommend providing 10% extra fabric.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">7. Shipping &amp; Delivery</h2>
          <p>
            We deliver across Pakistan via third-party courier services. Delivery timelines are estimates
            and not guaranteed. Yaseen.pk is not liable for delays caused by the courier, natural
            disasters, civil unrest, or any other event beyond our reasonable control.
          </p>
          <p>
            Shipping charges, if applicable, are displayed at checkout. Risk of loss or damage to goods
            passes to you upon handover to the courier.
          </p>
          <p>
            You are responsible for providing an accurate and complete delivery address. We are not liable
            for orders delivered to an incorrect address provided by you. If an order is returned due to
            failed delivery, we will contact you to arrange re-delivery at your cost.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">8. Returns, Exchanges &amp; Refunds</h2>
          <p>
            Our detailed returns and refunds policy is set out in our separate{' '}
            <a href="/returns" className="text-blue-600 underline hover:text-blue-800">
              Returns &amp; Refund Policy
            </a>
            , which forms part of these Terms.
          </p>
          <p>
            In summary: readymade garments may be returned within 7 days of delivery if unworn, unwashed,
            and with original tags attached. Custom-stitched garments are non-returnable except where there
            is a manufacturing defect.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">9. Intellectual Property</h2>
          <p>
            All content on this Site — including photographs, text, product descriptions, logos, design
            patterns, illustrations, and software — is the property of Yaseen Fabrics &amp; Stitching or
            its licensors and is protected under applicable Pakistani and international intellectual
            property laws.
          </p>
          <p>
            You may not copy, reproduce, distribute, publicly display, modify, or create derivative works
            from any Site content without our prior written permission. Unauthorised use may result in
            civil or criminal liability.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">10. User Accounts</h2>
          <p>
            You are responsible for maintaining the confidentiality of your login credentials and for all
            activities that occur under your account. Notify us immediately if you suspect unauthorised
            use of your account.
          </p>
          <p>
            We reserve the right to suspend or terminate accounts that violate these Terms, engage in
            fraudulent activity, or are inactive for an extended period.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">11. Limitation of Liability</h2>
          <p>
            To the fullest extent permitted by Pakistani law, Yaseen.pk&apos;s total liability to you for
            any claim arising from your use of this Site or our services shall not exceed the amount you
            paid for the specific order giving rise to the claim.
          </p>
          <p>
            We are not liable for any indirect, incidental, special, consequential, or punitive damages,
            including loss of profit, loss of data, or loss of goodwill, whether arising in contract,
            tort, or otherwise.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">12. Governing Law &amp; Disputes</h2>
          <p>
            These Terms are governed by the laws of the Islamic Republic of Pakistan. Any dispute arising
            from or relating to these Terms or our services shall first be attempted to be resolved through
            good-faith negotiation. If a resolution cannot be reached within 30 days, the dispute shall be
            submitted to the exclusive jurisdiction of the courts of Pakistan.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">13. Contact Us</h2>
          <ul className="list-none space-y-1 pl-0">
            <li><strong>Business:</strong> Yaseen Fabrics &amp; Stitching</li>
            <li><strong>Website:</strong> yaseen.pk</li>
            <li><strong>Email:</strong> support@yaseen.pk</li>
            <li><strong>WhatsApp:</strong> +92 335 621 2709</li>
            <li><strong>Address:</strong> K 491, Shah Rukn e Alam Colony, Multan, Pakistan</li>
          </ul>
        </section>

      </div>
    </main>
  );
}
