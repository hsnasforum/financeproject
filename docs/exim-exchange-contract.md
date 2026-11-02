# EXIM AP01 원천 날짜와 환율 검증

2026-10-11 확인 기준. [한국수출입은행 현재환율 API](https://www.koreaexim.go.kr/ir/HPHKIR020M01?apino=2&viewtype=C) 공식 문서(수정일 2026-04-28)는 다음 계약을 제공합니다.

- endpoint: `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON`. 기존 www API 주소는 공식 공지상 2026-04-30 병행 가동을 중단했습니다.
- 요청: `authkey`, `data=AP01`, `searchdate`(YYYYMMDD 또는 YYYY-MM-DD). 날짜를 생략하면 당일이지만 Finance는 실제 요청 날짜를 명시합니다.
- 응답: `result`, `cur_unit`, `cur_nm`, `deal_bas_r`, `ttb`, `tts`, `bkpr`, `yy_efee_r`, `ten_dd_efee_r`, `kftc_deal_bas_r`, `kftc_bkpr`. **응답 날짜 필드는 없습니다.** `result=1`이 성공이며 2·3·4는 데이터 코드·인증 코드·일일 한도 오류입니다.
- 영업일 오전 11시 전후 갱신하며 비영업일 또는 당일 게시 전에는 null이 올 수 있습니다. null/빈 배열은 환율 성공이나 이전 영업일 확인을 뜻하지 않습니다.

## 제품 처리

공식 AP01 응답은 검증된 `searchdate`를 `asOf`로 사용합니다. 이는 조회 시각을 원천 날짜로 만드는 처리가 아닙니다. 날짜 형식/실제 달력/미래일, provider 성공 상태, 통화 단위, 양의 유한 환율, 중복 통화 및 날짜 충돌을 검사합니다. 원문에 별도 날짜가 있으면 요청일과도 일치해야 합니다. JPY(100)·IDR(100) 같은 묶음 단위는 1단위당 KRW로 정규화합니다. 날짜 맥락 없이 전달된 과거 dated fixture의 계약은 별도로 유지합니다.

수집 receipt의 `generatedAt`과 provider provenance의 `fetchedAt`는 실제 조회 시각이며, `asOf`는 공시 기준일입니다. 공개 exchange route의 `meta.fallback.generatedAt`는 기존 계약상 `asOf`를 담으므로 이 조회 시각 설명의 대상이 아닙니다. 공식 날짜별 환율 화면과 응답을 대조할 수 없는 날짜를 최신 영업일이라고 추정하지 않습니다. 기존 공개 exchange route의 과거 날짜 조회는 각 날짜에 실제 유효 응답이 있는지 확인하고 `requestedDate`·`asOf`·`fallbackDays`로 차이를 표시합니다.

## 수집 명령과 저장 범위

```sh
corepack pnpm warm:if-stale --exchange-only --exchange-date=YYYYMMDD
```

공식 원천에서 확인한 날짜만 명시합니다. 옵션을 생략하면 KST 당일 요청입니다. 명시한 날짜는 기존 receipt의 fresh 여부와 관계없이 요청하며, 잘못된 날짜는 외부 요청 전에 거부합니다. 빈/오류/불완전 응답은 nonzero로 종료하고 기존 파일을 보존합니다. 자동으로 이전 영업일을 선택하지 않습니다.

`.data/exchange_snapshot.json`은 검증된 수집의 `generatedAt`, `asOf`, `rowCount`를 남기는 **수집 receipt**입니다. 실제 환율 23개를 담는 오프라인 캐시가 아닙니다. 사용 화면은 provider/API 응답을 사용하며 예시·과거 데이터 표시 계약을 유지합니다. receipt 최신성과 원천 공시일, 운영 환경의 실시간 응답을 혼동하지 않습니다.

## 실제 확인

2026-10-11 공식 [날짜별 환율 화면](https://www.koreaexim.go.kr/wg/HPHKWG057M01)에서 10월8일 23개 통화를 확인했고 동일 날짜 AP01 응답의 모든 `deal_bas_r`가 일치했습니다. 10월9·10·11일의 공식 화면은 데이터 없음이었습니다. 이 관측은 날짜를 임의로 역산한 결과가 아니며, 앞으로의 영업일/게시 여부를 보증하지 않습니다. 최신 성공 수집 시각과 테스트 결과는 해당 `/work` 기록 및 receipt를 확인합니다.
