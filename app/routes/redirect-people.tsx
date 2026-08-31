import { LegacyRedirect } from "~/components/shell/legacy-redirect"

// The People page is now a view inside the shell; this keeps old bookmarks
// and any installed PWA shortcut working.
export default function RedirectPeople() {
  return <LegacyRedirect view="table" />
}
