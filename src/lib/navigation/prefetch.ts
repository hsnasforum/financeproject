export function devPlanningPrefetch(href: string): false | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  return /^\/planning(?:[/?]|$)/.test(href) ? false : undefined;
}
