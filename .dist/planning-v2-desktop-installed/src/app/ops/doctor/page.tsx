import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { OpsDoctorClient } from "@/components/OpsDoctorClient";

export default async function OpsDoctorPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const cookieStore = await cookies();
  const csrf = cookieStore.get("dev_csrf")?.value ?? "";

  return <OpsDoctorClient csrf={csrf} />;
}
