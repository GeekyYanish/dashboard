const KEY = "registration-console.selected-event";

export function selectedEventId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try { return window.sessionStorage.getItem(KEY) || undefined; } catch { return undefined; }
}

export function setSelectedEventId(value: string | undefined) {
  if (typeof window !== "undefined") {
    try {
      if (value) window.sessionStorage.setItem(KEY, value);
      else window.sessionStorage.removeItem(KEY);
    } catch { /* private browsing — memory state still comes from the event */ }
    window.dispatchEvent(new CustomEvent("registration-console:event-scope"));
  }
}
