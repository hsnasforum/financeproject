export type Sigungu = { name: string; lawdCd: string };
export type Sido = { name: string; sigungu: Sigungu[] };

export const SIDO_LIST: Sido[] = [
  {
    name: "서울특별시",
    sigungu: [
      { name: "종로구", lawdCd: "11110" }, { name: "중구", lawdCd: "11140" }, { name: "용산구", lawdCd: "11170" },
      { name: "성동구", lawdCd: "11200" }, { name: "광진구", lawdCd: "11215" }, { name: "동대문구", lawdCd: "11230" },
      { name: "중랑구", lawdCd: "11260" }, { name: "성북구", lawdCd: "11290" }, { name: "강북구", lawdCd: "11305" },
      { name: "도봉구", lawdCd: "11320" }, { name: "노원구", lawdCd: "11350" }, { name: "은평구", lawdCd: "11380" },
      { name: "서대문구", lawdCd: "11410" }, { name: "마포구", lawdCd: "11440" }, { name: "양천구", lawdCd: "11470" },
      { name: "강서구", lawdCd: "11500" }, { name: "구로구", lawdCd: "11530" }, { name: "금천구", lawdCd: "11545" },
      { name: "영등포구", lawdCd: "11560" }, { name: "동작구", lawdCd: "11590" }, { name: "관악구", lawdCd: "11620" },
      { name: "서초구", lawdCd: "11650" }, { name: "강남구", lawdCd: "11680" }, { name: "송파구", lawdCd: "11710" },
      { name: "강동구", lawdCd: "11740" },
    ],
  },
  {
    name: "부산광역시",
    sigungu: [
      { name: "중구", lawdCd: "26110" }, { name: "서구", lawdCd: "26140" }, { name: "동구", lawdCd: "26170" },
      { name: "영도구", lawdCd: "26200" }, { name: "부산진구", lawdCd: "26230" }, { name: "동래구", lawdCd: "26260" },
      { name: "남구", lawdCd: "26290" }, { name: "북구", lawdCd: "26320" }, { name: "해운대구", lawdCd: "26350" },
      { name: "사하구", lawdCd: "26380" }, { name: "금정구", lawdCd: "26410" }, { name: "강서구", lawdCd: "26440" },
      { name: "연제구", lawdCd: "26470" }, { name: "수영구", lawdCd: "26500" }, { name: "사상구", lawdCd: "26530" },
      { name: "기장군", lawdCd: "26710" },
    ],
  },
  {
    name: "대구광역시",
    sigungu: [
      { name: "중구", lawdCd: "27110" }, { name: "동구", lawdCd: "27140" }, { name: "서구", lawdCd: "27170" },
      { name: "남구", lawdCd: "27200" }, { name: "북구", lawdCd: "27230" }, { name: "수성구", lawdCd: "27260" },
      { name: "달서구", lawdCd: "27290" }, { name: "달성군", lawdCd: "27710" },
    ],
  },
  {
    name: "인천광역시",
    sigungu: [
      { name: "중구", lawdCd: "28110" }, { name: "동구", lawdCd: "28140" }, { name: "미추홀구", lawdCd: "28177" },
      { name: "연수구", lawdCd: "28185" }, { name: "남동구", lawdCd: "28200" }, { name: "부평구", lawdCd: "28237" },
      { name: "계양구", lawdCd: "28245" }, { name: "서구", lawdCd: "28260" }, { name: "강화군", lawdCd: "28710" },
      { name: "옹진군", lawdCd: "28720" },
    ],
  },
  {
    name: "광주광역시",
    sigungu: [
      { name: "동구", lawdCd: "29110" }, { name: "서구", lawdCd: "29140" }, { name: "남구", lawdCd: "29155" },
      { name: "북구", lawdCd: "29170" }, { name: "광산구", lawdCd: "29200" },
    ],
  },
  {
    name: "대전광역시",
    sigungu: [
      { name: "동구", lawdCd: "30110" }, { name: "중구", lawdCd: "30140" }, { name: "서구", lawdCd: "30170" },
      { name: "유성구", lawdCd: "30200" }, { name: "대덕구", lawdCd: "30230" },
    ],
  },
  {
    name: "울산광역시",
    sigungu: [
      { name: "중구", lawdCd: "31110" }, { name: "남구", lawdCd: "31140" }, { name: "동구", lawdCd: "31170" },
      { name: "북구", lawdCd: "31200" }, { name: "울주군", lawdCd: "31710" },
    ],
  },
  {
    name: "세종특별자치시",
    sigungu: [{ name: "세종시", lawdCd: "36110" }],
  },
];

export function findSidoByLawdCd(lawdCd: string): { sidoName: string; sigunguName: string } | null {
  for (const sido of SIDO_LIST) {
    const hit = sido.sigungu.find((sigungu) => sigungu.lawdCd === lawdCd);
    if (hit) {
      return { sidoName: sido.name, sigunguName: hit.name };
    }
  }
  return null;
}
