import { redirect } from "next/navigation";

// "/" has no screen of its own; signed-out users are sent to /login by middleware.
export default function Root() {
  redirect("/home");
}
