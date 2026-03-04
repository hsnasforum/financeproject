import { describe, expect, it } from "vitest";
import { parseFeedXml } from "../src/lib/news/feedParse";

const RSS_SAMPLE = `
<rss version="2.0">
  <channel>
    <item>
      <guid>id-1</guid>
      <title>금리 인상 전망</title>
      <description><![CDATA[<p>연준 관련 뉴스</p>]]></description>
      <link>https://news.example.com/a?utm_source=x</link>
      <pubDate>Wed, 04 Mar 2026 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
`;

const ATOM_SAMPLE = `
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>tag:example.com,2026:/item/2</id>
    <title>환율 급등</title>
    <summary>원달러 환율 기사</summary>
    <link rel="alternate" href="https://atom.example.com/item/2" />
    <updated>2026-03-04T01:00:00Z</updated>
  </entry>
</feed>
`;

describe("news feed parse", () => {
  it("parses rss item", () => {
    const rows = parseFeedXml(RSS_SAMPLE);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.feedItemId).toBe("id-1");
    expect(rows[0]?.title).toBe("금리 인상 전망");
    expect(rows[0]?.url).toContain("https://news.example.com/a");
    expect(rows[0]?.snippet).toContain("연준 관련 뉴스");
  });

  it("parses atom entry", () => {
    const rows = parseFeedXml(ATOM_SAMPLE);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("환율 급등");
    expect(rows[0]?.url).toBe("https://atom.example.com/item/2");
    expect(rows[0]?.publishedAt).toBe("2026-03-04T01:00:00.000Z");
  });
});
