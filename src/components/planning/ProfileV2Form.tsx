import { type ReactNode } from "react";
import { Card } from "@/components/ui/Card";

type ProfileV2FormProps = {
  modeLabel: string;
  children: ReactNode;
};

export default function ProfileV2Form(props: ProfileV2FormProps) {
  return (
    <Card className="space-y-4" data-testid="planning-profile-form">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">프로필 선택</h2>
        <span className="text-xs text-slate-500">{props.modeLabel}</span>
      </div>
      {props.children}
    </Card>
  );
}
