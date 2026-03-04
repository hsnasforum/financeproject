# News Refresh (RSS only)

## 로컬 실행

```bash
pnpm news:refresh
```

- 입력 SSOT:
  - `config/news-feeds.json` (피드 목록)
  - `config/news-topic-dictionary.json` (토픽 사전)
  - `config/news-scoring.json` (스코어링 규칙)
- 저장소:
  - `.data/news/news.sqlite`
- 산출물:
  - `.data/news/news_brief.latest.json`
  - `.data/news/news_brief.latest.md`
  - `.data/news/news_scenarios.latest.json`
  - `.data/news/news_scenarios.latest.md`
  - `.data/news/topic_trends.latest.json`
  - `.data/news/digest_day.latest.json`
  - `.data/news/digest_day.latest.md`
- 옵션:
  - `pnpm news:refresh -- --strict`: 피드 fetch/parse 오류가 있으면 실패(exit 1)

## 기본 정책

- RSS/Atom 피드만 사용합니다.
- 피드 본문 크롤링/스크래핑은 금지합니다.
- raw는 RSS description만 사용합니다(최대 1500자).

## 스케줄러 예시

### Windows (작업 스케줄러)

- 프로그램/스크립트: `powershell.exe`
- 인수:

```powershell
-NoProfile -Command "Set-Location 'C:\repo\finance'; pnpm news:refresh"
```

### macOS/Linux (cron)

```bash
5 9 * * * cd /path/to/finance && pnpm news:refresh >> .data/news/news_refresh.log 2>&1
```

## Daily Refresh 통합

`pnpm daily:refresh` 실행 시 `news:refresh`가 기본 단계로 포함됩니다.
