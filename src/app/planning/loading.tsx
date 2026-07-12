import { Container } from "@/components/ui/Container";
import { LoadingState } from "@/components/ui/LoadingState";

export default function PlanningLoading() {
  return (
    <Container className="py-16 sm:py-24">
      <LoadingState
        description="저장된 정보와 계산 화면을 안전하게 불러오고 있습니다."
        testId="planning-loading-state"
        title="플래닝 화면을 준비하고 있습니다"
      />
    </Container>
  );
}
