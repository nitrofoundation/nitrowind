type JsonLdValue = Record<string, unknown> | Array<Record<string, unknown>>;

export default function JsonLd({ value }: { value: JsonLdValue }) {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, '\\u003c') }}
      type="application/ld+json"
    />
  );
}
