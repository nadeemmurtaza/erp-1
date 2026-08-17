/**
 * The app's colours and spacing, matching the website.
 *
 * The brand teal is the same `#0f8fa3` the dashboard charts use — it clears the
 * chroma floor and the contrast checks, so it reads as a colour rather than as
 * grey for a colourblind customer.
 */
export const theme = {
  color: {
    brand: '#0f8fa3',
    brandDark: '#0b6d7d',
    brandSoft: '#e6f4f6',
    gold: '#b8863b',
    ink: '#2a2724',
    inkSoft: '#6b6560',
    inkFaint: '#9a938c',
    sand: '#faf7f2',
    sandDeep: '#f1ebe1',
    line: '#e5ded2',
    surface: '#ffffff',
    danger: '#b42318',
    dangerSoft: '#fef3f2',
  },
  space: (units: number) => units * 4,
  radius: { sm: 6, md: 10, lg: 16, pill: 999 },
  text: {
    title: { fontSize: 22, fontWeight: '600' as const },
    heading: { fontSize: 17, fontWeight: '600' as const },
    body: { fontSize: 15 },
    small: { fontSize: 13 },
    tiny: { fontSize: 11 },
  },
};

export type Theme = typeof theme;
