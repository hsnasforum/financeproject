"use client";

import { useEffect, useState } from "react";
import { A11Y_ANNOUNCE_EVENT } from "@/lib/forms/a11y";

type ErrorAnnouncerProps = {
  id?: string;
};

export function ErrorAnnouncer({ id = "form_error_announcer" }: ErrorAnnouncerProps) {
  const [message, setMessage] = useState("");

  useEffect(() => {
    function onAnnounce(event: Event) {
      const customEvent = event as CustomEvent<string>;
      if (typeof customEvent.detail !== "string") return;
      setMessage(customEvent.detail);
    }

    window.addEventListener(A11Y_ANNOUNCE_EVENT, onAnnounce as EventListener);
    return () => {
      window.removeEventListener(A11Y_ANNOUNCE_EVENT, onAnnounce as EventListener);
    };
  }, []);

  return (
    <div id={id} aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
