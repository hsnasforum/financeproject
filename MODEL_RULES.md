# MODEL_RULES.md

## 1) Scope (Explainability SSOT)
This document records the currently implemented rule logic for `planning/v3` explainability.

Primary code references:
- Scoring/tagging/clustering/select: `planning/v3/news/select/*`, `planning/v3/news/taxonomy.ts`
- Burst/daily stats: `planning/v3/news/trend/*`, `planning/v3/news/trend.ts`
- Digest templates: `planning/v3/news/digest/*`, `planning/v3/news/digest.ts`
- Scenario cards/templates: `planning/v3/news/scenario/*`
- Trigger evaluator/templates: `planning/v3/news/triggerEvaluator.ts`, `planning/v3/news/scenarioTemplates.ts`
- Exposure/impact mapping: `planning/v3/exposure/contracts.ts`, `planning/v3/financeNews/impactModel.ts`
- Banned language guards: `planning/v3/news/guard/noRecommendationText.ts`, `src/lib/news/noRecommendation.ts`

## 2) Input constraints and storage baseline
- News item minimal fields: `title/url/publishedAt/guid/snippet/sourceId/fetchedAt`
- Snippet limit: up to 1500 chars (`NewsItemSchema`)
- Full-text/body/html/content persistence is prohibited by quality gates (`planning/v3/news/quality.test.ts`)

## 3) Scoring rules (deterministic)
Source: `planning/v3/news/select/score.ts`

### 3.1 Score formula
`totalScore = sourceWeight + recency + keywordHits + burstPlaceholder`

Current hard values:
- `burstPlaceholder = 0` (reserved integration hook)
- `sourceWeight`: from source config/overrides
- `recency` tier:
  - `<=24h`: `3`
  - `<=72h`: `2`
  - `<=7d`: `1`
  - otherwise: `0`
- `keywordHits`: sum of topic keyword/entity hits

### 3.2 Deterministic tie-break
`compareScoredItems` order:
1. `totalScore desc`
2. `publishedAt desc` (string compare on ISO datetime)
3. `title asc` (normalized)
4. `id asc`

## 4) Topic tagging rules
Source: `planning/v3/news/taxonomy.ts`

- Topic dictionary is static (`rates`, `inflation`, `fx`, `growth`, `labor`, `credit`, `commodities`, `fiscal`)
- Legacy aliases:
  - `oil -> commodities`
  - `policy -> fiscal`
  - `equity -> growth`
- Match target text: `title + snippet` (lowercased)
- Per topic:
  - `keywordHits = matched keywords + matched entities`
  - `hits = deduped match token list`
- Output rules:
  - include only topics with at least 1 hit
  - sort by `keywordHits desc`, then topic priority
  - keep top `1~2` topics

Topic priority (high to low):
`rates > inflation > fx > growth > labor > credit > commodities > fiscal`

## 5) Title clustering rules
Source: `planning/v3/news/select/clusterByTitle.ts`

- Normalize title: lowercase, punctuation removed, whitespace collapsed
- Token rule: keep tokens with length >= 2
- Similarity: token Jaccard
- Cluster condition: `Jaccard >= 0.6` (default)
- Representative: highest-ranked item by `compareScoredItems`
- Cluster output order: representative rank order

## 6) Burst grading and daily stats
Sources:
- `planning/v3/news/trend/computeDailyStats.ts`
- `planning/v3/news/trend/computeBurst.ts`
- `planning/v3/news/trend.ts`

### 6.1 Daily stats fields
Per `(dateKst, topic)`:
- `count`
- `scoreSum`
- `sourceDiversity = uniqueSources / count`
- `burstGrade`

### 6.2 Burst grade logic
Using `today.count` and `last7.count[]`:
- If history `< 7 days` -> `Unknown`
- If baseline avg `<= 0`:
  - today `>= 3` -> `High`
  - today `>= 1` -> `Med`
  - else -> `Low`
- Else:
  - `ratio = today / baselineAvg`
  - `delta = today - round(baselineAvg)`
  - `High` if `ratio >= 1.8` or `delta >= 4`
  - `Med` if `ratio >= 1.4` or `delta >= 2`
  - else `Low`

## 7) Digest templates and generation
Sources:
- `planning/v3/news/digest/contracts.ts`
- `planning/v3/news/digest/templates.ts`
- `planning/v3/news/digest/buildDigest.ts`
- `planning/v3/news/digest.ts`

### 7.1 DigestDay fixed blocks
`DigestDay` schema:
- `observation`
- `evidence[]` (title/url/sourceId/publishedAt/topics)
- `watchlist[]`
- `counterSignals[]`

### 7.2 Evidence selection
- Representative top items from select result
- Count constrained to `2~5`

### 7.3 Watchlist template
- Topic-driven templates from `WATCHLIST_BY_TOPIC`
- Spec format: `{label, seriesId, view, window}`
- Default UI output is compact summary/grade only (`상/중/하/unknown`), not raw series dumps

### 7.4 Observation line policy
Generated lines include:
- observation
- evidence count reference
- monitoring line
- counter-signal line
All lines pass recommendation-language guard.

## 8) Scenario templates (news topic/trend)
Sources:
- `planning/v3/news/scenario/contracts.ts`
- `planning/v3/news/scenario/templates.ts`
- `planning/v3/news/scenario/buildScenarios.ts`

### 8.1 Scenario card shape
For each of `Base/Bull/Bear`:
- `observation`
- `triggers[]` (`topicBurst|topicShare|sourceDiversity`, condition `high|med|low`)
- `invalidation[]`
- `indicators[]`
- `options[]`
- `linkedTopics[]` (max 3)

### 8.2 Topic selection
Rank topics by:
1. burst grade weight (`High>Med>Low>Unknown`)
2. `scoreSum`
3. evidence count
4. topic id asc

### 8.3 Base/Bull/Bear condition transform
- `Base`: current condition
- `Bull`: one-step lower condition
- `Bear`: one-step higher condition

## 9) Trigger evaluation (indicator-based)
Sources:
- `planning/v3/news/scenarioTemplates.ts`
- `planning/v3/news/triggerEvaluator.ts`

### 9.1 Trigger DSL
Rule fields include:
- `seriesId`, `window`, `metric(pctChange|zscore|regime)`, `condition(up|down|high|low|flat|unknown)`
- Legacy compatibility: `view/op/threshold/regimeValue`

### 9.2 Evaluation output
`evaluateTriggers(...)` returns:
- overall `status`: `met | not_met | unknown`
- summary rationale
- per-rule evaluations

Status fold rule:
1. if any rule `not_met` -> overall `not_met`
2. else if any rule `unknown` -> overall `unknown`
3. else -> `met`

### 9.3 Missing data behavior
- Missing series/insufficient observations -> rule `unknown` (safe fallback)

## 10) Exposure -> Impact mapping
Sources:
- `planning/v3/exposure/contracts.ts`
- `planning/v3/financeNews/contracts.ts`
- `planning/v3/financeNews/impactModel.ts`

### 10.1 Exposure profile model
Enum-only profile, no free text:
- Debt: `hasDebt`, `rateType`, `repricingHorizon`
- Inflation: essential/rent-energy shares
- FX: foreign consumption/income
- Income stability
- Liquidity buffer
Default/missing is `unknown`.

### 10.2 Impact result shape
Grades per area: `High|Med|Low|Unknown`
- `cashflowRisk`
- `debtServiceRisk`
- `inflationPressureRisk`
- `fxPressureRisk`
- `incomeRisk`
- `bufferAdequacy`
plus `rationale[]`, `watch[]`.

### 10.3 Core mapping rules
- Missing profile -> all `Unknown`
- `rates` hot + variable/short repricing debt -> debt risk up
- `inflation/commodities` hot + high essentials/energy -> inflation pressure up
- `fx` hot + high foreign consumption -> fx pressure up
- income stability `fragile` -> income risk up
- low cash buffer -> buffer adequacy low; cashflow risk escalates one level when possible

## 11) Banned language guard rules
### 11.1 planning/v3 guard
Source: `planning/v3/news/guard/noRecommendationText.ts`
Blocked patterns include:
- `매수`, `매도`, `정답`, `무조건`, `확실`, `해야 한다`, `사야 한다`, `팔아야 한다`
- `buy now`, `sell now`, `must buy/sell`, `guaranteed`, `certainly`, `definitely`

### 11.2 runtime/common guard
Source: `src/lib/news/noRecommendation.ts`
- Regex blocks imperative/certain recommendation phrases
- Includes sanitizer to replace forbidden phrases with neutral wording

### 11.3 Enforcement points
Guards are applied in:
- digest generation
- scenario text generation/tests
- trigger rationale tests
- impact/stress rationale tests

## 12) Determinism guarantees (implemented)
- No randomness in scoring/select/cluster/burst/trigger/impact functions
- Stable tie-break chains are defined for ranking
- Unknown-safe fallbacks are explicit for missing/insufficient data
- Regression/quality tests enforce:
  - idempotency
  - no full-text persistence
  - banned-language blocking

---
This file documents currently implemented rule behavior only.
