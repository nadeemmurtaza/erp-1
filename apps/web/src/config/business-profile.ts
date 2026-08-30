export const businessProfile = {
  // Brand Identity
  name: 'Yaseen Fabrics & Stitching',
  shortName: 'Yaseen.pk',
  tagline: 'Premium Fabrics & Custom Stitching',
  domain: 'yaseen.pk',
  url: 'https://yaseen.pk',
  
  // Contact Information
  email: 'support@yaseen.pk',
  phone: '+92 335 621 2709',
  whatsapp: '+92 335 621 2709',
  
  // Physical Location
  address: 'K 491, Shah Rukn e Alam Colony, Multan, Pakistan',
  city: 'Multan',
  country: 'Pakistan',
  
  // Operations & Support
  workingHours: '9 AM – 8 PM, Monday to Saturday',
  supportResponseTime: 'Within 1–2 business days',
  
  // Social Media Links (Update with real URLs)
  socials: {
    facebook: 'https://facebook.com/yaseen.pk',
    instagram: 'https://instagram.com/yaseen.pk',
    tiktok: 'https://tiktok.com/@yaseen.pk',
    youtube: 'https://youtube.com/@yaseen_pk',
  },
  
  // Legal & Tax (Useful for invoices / footer)
  taxNumber: 'NTN-XXXXXXX-X', // Replace with your real NTN
  registrationNumber: 'SECP-XXXXXXX', // Replace with your real registration if applicable
  
  // Banking (For wire transfers / COD refunds)
  banking: {
    bankName: 'Meezan Bank', // Replace with your bank
    accountTitle: 'Yaseen Fabrics',
    accountNumber: '00000000000000',
    iban: 'PK00 MEEZ 0000 0000 0000 0000',
  },

  // E-commerce Defaults
  currency: {
    code: 'PKR',
    symbol: 'Rs.',
  },
  
  // Delivery & Service Policies
  shipping: {
    standardDeliveryTime: '3-5 Working Days',
    stitchingTurnaroundTime: '10-14 Working Days',
    freeShippingThreshold: 5000, // PKR amount to trigger free shipping
  }
} as const;
