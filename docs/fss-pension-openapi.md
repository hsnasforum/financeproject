# 금감원 통합연금포털 OpenAPI (연금저축)

2026-10-15 확인 기준. 연금저축 상품 자료는 FINLIFE가 아니라 금융감독원 통합연금포털 OpenAPI에서 수집합니다. FINLIFE `annuitySavingProductsSearch`는 대출 형식 행이나 빈 페이지를 반환하고([finlife-identity.md](finlife-identity.md)), FINLIFE 화면의 연금저축 메뉴도 통합연금포털로 연결됩니다.

- 공식 안내: [OpenAPI 소개](https://www.fss.or.kr/fss/main/contents.do?menuNo=201042), [개발 가이드](https://www.fss.or.kr/fss/lifeplan/devlopGuide/list.do?menuNo=201053), [인증키 신청/관리](https://www.fss.or.kr/fss/lifeplan/svingsApiKey/list.do?menuNo=201046)
- 인증키: `FSS_PENSION_API_KEY`(32자, server-only). FINLIFE·OpenDART 키와 별개입니다. 본인인증과 관리자 승인 뒤 발급되며 1인 1키, 하루 1,000회, 12개월 미사용 시 삭제될 수 있습니다.
- 이용 조건: 화면에 "통합연금포털(금융감독원) 콘텐츠"임을 표시하고, 제공 정보를 수정하거나 오인하게 만들지 않습니다. 금감원은 정확성·최신성을 보증하지 않습니다.

## 사용하는 API

| API | 요청 | 기준 | 용도 |
| --- | --- | --- | --- |
| `psProdList2` (상품별 수익률·수수료율, '25.4분기 이후) | `key`, `year`, `quarter`, `areaCode` 1 은행·3 자산운용·4 생명보험·5 손해보험 | 분기 | 상품 유형, 원금보장, 판매여부, 적립금, 3·5·7·10년 수익률, 누적 연평균 수익률, 연평균 수수료율 |
| `psGuaranteedProdList` (원리금보장 연금저축보험) | `key`, `areaCode` 4·5 | 작성월 `reportDate` (YYYY/MM) | 공시이율, 최저보증이율, 채널별 수수료 부과구조 |

결과 코드: `000` 정상, `001` 조회 결과 없음(미공시), `100`·`102`·`600` 인증·승인, `101` 하루 한도, `700` 파라미터, 그 밖은 원천 오류입니다. `001` 응답에는 `count`·`list`가 없습니다.

## 실제 응답과 공식 안내의 차이

2026-10-15 실제 응답으로 계약을 정했습니다. 안내 문서만 믿지 않습니다.

- `guaranteedInterestRate`는 숫자가 아니라 기간별 조건 문장입니다(예: "(10년 이내) 1.00%, (10년 초과) 0.50%"). 숫자로 바꾸지 않고 원문을 보존하며, 일부 상품은 값이 없습니다.
- 상품별 수익률은 안내의 1·3·5·7년이 아니라 `earnRate3`·`earnRate5`·`earnRate7`·`earnRate10`으로 옵니다.
- 채널별 수수료(`fpFeeDesc`·`agentFeeDesc`·`onlineFeeDesc`)는 상품마다 일부만 있습니다.
- 자산운용 응답(2026년 2분기 36,052행)의 32,863행은 회사·상품명·적립금만 있고 판매여부·유형·수익률·수수료율이 없습니다. 이 행은 상품 목록에서 제외하고 권역별 `excludedRowsWithoutProductInfo`로 기록합니다.
- 같은 회사·상품명이 최초판매일이나 연금 수령 방식이 다른 여러 행으로 나옵니다. 고유 키를 강제하지 않고, 모든 값이 같은 완전 중복만 합친 뒤 `exactDuplicateRowsRemoved`로 기록합니다.
- 공시값의 이상치(예: 연평균 수수료율 -0.106%, 3년 수익률 744%)는 고치지 않고 그대로 둡니다. 범위 검사는 손상된 값(문자열, 무한대, 수익률 -100% 미만 등)만 거부합니다.

## 수집 (`pnpm pension:sync`)

```bash
pnpm pension:sync            # 항상 수집
pnpm pension:sync:if-stale   # 두 스냅샷이 3일 이내면 skip (daily refresh 단계)
```

- 분기 선택: KST 기준 최근 완료 분기 3개를 최신 순으로 시도해 4개 권역이 모두 `000`인 첫 분기를 씁니다. `001`이면 미공시로 기록하고 이전 분기로 넘어가며, 그 밖의 오류는 즉시 실패합니다(이전 분기로 대체하지 않음). 선택 과정은 `selection.attempts`, 최근 완료 분기와의 차이는 `selection.quartersBehind`로 남기고 2분기 이상 뒤처지면 경고합니다.
- 원리금보장 보험은 두 권역의 작성월이 같아야 합니다.
- 두 스냅샷을 모두 검증한 뒤 임시 파일에서 함께 교체합니다. 실패하면 기존 파일을 보존하고 nonzero로 종료합니다. 키가 없으면 `CONFIG_MISSING`으로 실패하며 조용히 건너뛰지 않습니다.
- 산출물: `.data/fss_pension_products_snapshot.json`, `.data/fss_pension_guaranteed_snapshot.json`. 각각 `source`(출처·표시 문구), `generatedAt`(조회 시각), `asOf`(공시 기준 분기·작성월), 권역별 원천/저장/제외 건수, `items`를 담습니다. 키는 저장하지 않습니다.
- 신선도: `fss_pension_*_snapshot.json`은 수집 기록 기준 7일입니다. 분기·월 단위 공시라 FINLIFE의 3일 기준을 쓰지 않으며, 공시 기준일은 `asOf`로 따로 표시합니다.

2026-10-15 03:55 KST 첫 수집: 2026년 3분기 미공시(`001`) 확인 뒤 2026년 2분기 4,373개(은행 36, 자산운용 3,189, 생명보험 658, 손해보험 490), 원리금보장 2026년 9월 44개(손해보험 완전 중복 1행 제외)를 저장했습니다.
