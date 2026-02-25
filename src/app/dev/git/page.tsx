import { notFound } from "next/navigation";
import { DevGitAdminClient } from "@/components/DevGitAdminClient";

export default function DevGitPage() {
  if ((process.env.NODE_ENV ?? "development") === "production") {
    notFound();
  }

  return <DevGitAdminClient />;
}

