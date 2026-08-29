import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  route("people", "routes/people.tsx"),
  route("tree/:id", "routes/tree.$id.tsx"),
] satisfies RouteConfig
