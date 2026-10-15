import { expect, test } from "vitest";
import { serializeStructuredData } from "./structured-data";

test("editorial text cannot close the JSON-LD element and remains valid JSON", () => {
  const data = {
    address: { streetAddress: '</script><script>alert("x")</script><!--' },
    description: "<p>Kind & Schule</p>",
  };
  const serialized = serializeStructuredData(data);
  expect(serialized).not.toContain("<");
  expect(JSON.parse(serialized)).toEqual(data);
});
