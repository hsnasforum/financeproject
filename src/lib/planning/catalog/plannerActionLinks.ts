export const PLANNER_ACTION_LINKS = {
  emergencyRecommend: {
    href: "/recommend?purpose=emergency&kind=deposit&preferredTerm=3&liquidityPref=high&rateMode=max&pool=unified&autorun=1&save=1&go=history",
    label: "비상금 예금 추천",
  },
  savingRecommend: {
    href: "/recommend?purpose=seed-money&kind=saving&preferredTerm=12&liquidityPref=mid&rateMode=max&pool=unified&autorun=1&save=1&go=history",
    label: "목표 적금 추천",
  },
  creditLoanProducts: {
    href: "/products/credit-loan",
    label: "대출 상품 보기/비교",
  },
  gov24Benefits: {
    href: "/gov24",
    label: "지원금/혜택 찾아보기",
  },
  benefitsCashflow: {
    href: "/benefits?q=생활비&category=job&region=전국&ageBand=all&incomeBand=low-mid",
    label: "생활지원 혜택 보기",
  },
  benefitsFamily: {
    href: "/benefits?q=양육%20돌봄&category=childcare&region=전국&ageBand=30s-40s&incomeBand=all",
    label: "부양가족 혜택 보기",
  },
  benefitsHousing: {
    href: "/benefits?q=주거비&category=housing&region=전국&ageBand=all&incomeBand=all",
    label: "주거지원 혜택 보기",
  },
  subscriptionHousing: {
    href: "/housing/subscription?region=전국&mode=all&houseType=apt",
    label: "청약 공고 보기",
  },
} as const;

export type PlannerActionLinks = typeof PLANNER_ACTION_LINKS;
