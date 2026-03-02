import { getAppInfo } from "@/lib/planning/server/runtime/appInfo";
import { BackupReminderBanner } from "./BackupReminderBanner";

export async function BackupReminderBannerServer(props: {
  scope: "planning" | "ops";
  className?: string;
}) {
  const info = await getAppInfo();
  return (
    <BackupReminderBanner
      scope={props.scope}
      appVersion={info.appVersion}
      className={props.className}
    />
  );
}

