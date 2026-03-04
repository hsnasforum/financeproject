import { NewsSourceSchema, type NewsSource } from "./contracts";

const rawSources: NewsSource[] = [
  {
    id: "yna-economy",
    name: "Yonhap Economy",
    feedUrl: "https://www.yna.co.kr/rss/economy.xml",
    homepageUrl: "https://www.yna.co.kr/",
    weight: 0.82,
    enabled: true,
  },
  {
    id: "mk-economy",
    name: "MK Economy",
    feedUrl: "https://www.mk.co.kr/rss/30000001/",
    homepageUrl: "https://www.mk.co.kr/",
    weight: 0.76,
    enabled: true,
  },
  {
    id: "hankyung-economy",
    name: "Hankyung Economy",
    feedUrl: "https://www.hankyung.com/feed/economy",
    homepageUrl: "https://www.hankyung.com/",
    weight: 0.74,
    enabled: true,
  },
  {
    id: "bbc-business",
    name: "BBC Business",
    feedUrl: "https://feeds.bbci.co.uk/news/business/rss.xml",
    homepageUrl: "https://www.bbc.com/",
    weight: 0.66,
    enabled: true,
  },
  {
    id: "marketwatch-topstories",
    name: "MarketWatch Top Stories",
    feedUrl: "https://feeds.marketwatch.com/marketwatch/topstories/",
    homepageUrl: "https://www.marketwatch.com/",
    weight: 0.68,
    enabled: true,
  },
];

export const NEWS_SOURCES: NewsSource[] = rawSources.map((source) => NewsSourceSchema.parse(source));
