import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/app.tsx"),
  // Pre-redesign URLs. The shell owns the view now, so these only exist to
  // land old links (and the installed PWA's saved start URL) in the right
  // place.
  route("people", "routes/redirect-people.tsx"),
  route("tree/:id", "routes/redirect-tree.tsx"),
  route("settings", "routes/redirect-settings.tsx"),
] satisfies RouteConfig
