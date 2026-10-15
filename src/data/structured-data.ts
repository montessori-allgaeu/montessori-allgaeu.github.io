/** JSON inside an HTML script element must not contain an HTML closing tag. */
export function serializeStructuredData(value: object): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
