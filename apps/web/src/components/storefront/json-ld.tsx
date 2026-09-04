/**
 * Renders one JSON-LD `<script>` tag. `data` is server-built from our own
 * catalogue/business-profile data, never raw user input, but a product name
 * or description could still legally contain the substring "</script>" —
 * escaping "<" keeps that from ever closing the tag early.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
