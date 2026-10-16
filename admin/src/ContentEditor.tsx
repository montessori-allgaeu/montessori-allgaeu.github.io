import { JobEditor } from "./JobEditor";
import { DonationEditor } from "./DonationEditor";
import { CostEditor, OpeningHoursEditor, isCostCollection } from "./TableEditors";
import { AdmissionEditor, DownloadEditor, EventEditor, PersonEditor } from "./ContentPreviews";
import type { ContentEditorProps } from "./content-editor";

export function ContentEditor(props: ContentEditorProps) {
  const { collection, fields, originalData, renderField } = props;
  if (collection === "jobs") return <JobEditor {...props} />;
  if (collection === "donations") return <DonationEditor {...props} />;
  if (isCostCollection(collection)) return <CostEditor {...props} />;
  if (collection === "openingHoursSettings") return <OpeningHoursEditor {...props} />;
  if (collection === "events") return <EventEditor {...props} />;
  if (collection === "downloads") return <DownloadEditor {...props} />;
  if (collection === "team" || collection === "parentCouncil") return <PersonEditor {...props} />;
  if (collection === "schoolAdmissionSettings" || collection === "kindergartenAdmissionSettings")
    return <AdmissionEditor {...props} />;
  const visibleFields = fields.filter((field) => field.key !== "position");
  const optional = visibleFields.filter(
    (field) => field.optional && originalData[field.key] === undefined,
  );
  return (
    <div className="editor-fields">
      {visibleFields
        .filter((field) => !optional.includes(field))
        .map((field) => renderField(field))}
      {optional.length > 0 && (
        <details className="optional-fields">
          <summary>Weitere Angaben ergänzen</summary>
          {optional.map((field) => renderField(field))}
        </details>
      )}
    </div>
  );
}
