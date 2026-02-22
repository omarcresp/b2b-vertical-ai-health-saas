import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/app/")({
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/app/setup",
      search,
      replace: true,
    });
  },
});
