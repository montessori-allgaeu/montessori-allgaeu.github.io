import type { ReactNode } from "react";
import type { EditorField } from "../../src/admin/content-model";
import type { ContentCollection, ContentData, JsonValue, Role } from "../../src/admin/types";

export type ContentEditorProps = {
  collection: ContentCollection;
  data: ContentData;
  originalData: ContentData;
  fields: EditorField[];
  role: Role;
  previews: Record<string, string>;
  disabled: boolean;
  onChange: (key: string, value: JsonValue | undefined) => void;
  renderField: (field: EditorField, path?: string[]) => ReactNode;
};
