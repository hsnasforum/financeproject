"use client";

import { NewsTrendsTableClient } from "./NewsTrendsTableClient";

type NewsTrendsClientProps = {
  csrf?: string;
};

export function NewsTrendsClient({ csrf }: NewsTrendsClientProps) {
  return <NewsTrendsTableClient csrf={csrf} />;
}
