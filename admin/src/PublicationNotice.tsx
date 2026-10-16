import { useEffect, useState } from "react";
import "./publication-notice.css";

type PublicationNoticeProps = {
  visible: boolean;
  failedCount: number;
  onOpen: () => void;
};

export function PublicationNotice({ visible, failedCount, onOpen }: PublicationNoticeProps) {
  const [lastFailedCount, setLastFailedCount] = useState(failedCount);

  useEffect(() => {
    if (visible) setLastFailedCount(failedCount);
  }, [visible, failedCount]);

  // Keep the previous message while the notice fades out after publication or navigation.
  const displayedFailures = visible ? failedCount : lastFailedCount;

  return (
    <div
      className={`publication-notice${displayedFailures ? " failed" : ""}`}
      data-visible={visible}
      role="status"
      aria-atomic="true"
      aria-hidden={!visible}
      inert={!visible}
    >
      <svg
        className="publication-notice-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        {displayedFailures ? <path d="M12 7.5v5M12 16h.01" /> : <path d="m7.5 12 3 3 6-6" />}
      </svg>
      <span>
        {displayedFailures
          ? `${displayedFailures === 1 ? "Eine gespeicherte Änderung konnte" : `${displayedFailures} gespeicherte Änderungen konnten`} nicht veröffentlicht werden.`
          : "Gespeichert. Die Website wird im Hintergrund aktualisiert."}
      </span>
      <button className="publication-notice-action" onClick={onOpen}>
        {displayedFailures ? "Problem ansehen" : "Stand ansehen"}
      </button>
    </div>
  );
}
