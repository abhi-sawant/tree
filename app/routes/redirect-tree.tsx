import { useParams } from "react-router"

import { LegacyRedirect } from "~/components/shell/legacy-redirect"

export default function RedirectTree() {
  const { id } = useParams()
  return <LegacyRedirect view="tree" treeId={id} />
}
