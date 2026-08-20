"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { RecommendOwnerId } from "@/lib/recommend/ownerNamespace";

const RecommendOwnerContext = createContext<RecommendOwnerId | null>(null);

export function RecommendOwnerProvider({
  children,
  ownerId,
}: {
  children: ReactNode;
  ownerId: RecommendOwnerId;
}) {
  return (
    <RecommendOwnerContext.Provider value={ownerId}>
      {children}
    </RecommendOwnerContext.Provider>
  );
}

export function useRecommendOwner(): RecommendOwnerId {
  const ownerId = useContext(RecommendOwnerContext);
  if (!ownerId) {
    throw new Error("추천 사용자 컨텍스트가 필요합니다.");
  }
  return ownerId;
}
