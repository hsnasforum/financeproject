import Link from "next/link";
import { Container } from "@/components/ui/Container";

export default function NotFound() {
  return (
    <Container className="py-16 sm:py-24">
      <section aria-labelledby="not-found-title" className="mx-auto max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-bold uppercase tracking-widest text-primary">404</p>
        <h1 className="mt-3 text-2xl font-black text-navy" id="not-found-title">요청한 화면을 찾을 수 없습니다</h1>
        <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600">
          주소가 바뀌었거나 더 이상 제공하지 않는 화면일 수 있습니다.
        </p>
        <Link className="mt-6 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-white hover:bg-primary-hover" href="/">
          홈으로 이동
        </Link>
      </section>
    </Container>
  );
}
