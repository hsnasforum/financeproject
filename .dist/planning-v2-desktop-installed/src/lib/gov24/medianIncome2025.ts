export type IncomeBracketKey = "0_50" | "51_75" | "76_100" | "101_200" | "200_plus";
export type HouseholdSize = 1 | 2 | 3 | 4 | 5 | 6;

export const MEDIAN_INCOME_2025 = {
  year: 2025,
  brackets: [
    {
      key: "0_50",
      label: "0~50%",
      households: { 1: 1_196_007, 2: 1_966_329, 3: 2_512_677, 4: 3_048_887, 5: 3_554_096, 6: 4_032_403 },
    },
    {
      key: "51_75",
      label: "51~75%",
      households: { 1: 1_794_010, 2: 2_949_494, 3: 3_769_015, 4: 4_573_330, 5: 5_331_144, 6: 6_048_604 },
    },
    {
      key: "76_100",
      label: "76~100%",
      households: { 1: 2_392_013, 2: 3_932_658, 3: 5_025_353, 4: 6_097_773, 5: 7_108_192, 6: 8_064_805 },
    },
    {
      key: "101_200",
      label: "101~200%",
      households: { 1: 4_784_026, 2: 7_865_316, 3: 10_050_706, 4: 12_195_546, 5: 14_216_384, 6: 16_129_610 },
    },
    {
      key: "200_plus",
      label: "200% 이상",
      households: { 1: 4_784_026, 2: 7_865_316, 3: 10_050_706, 4: 12_195_546, 5: 14_216_384, 6: 16_129_610 },
      isUpperBound: true,
    },
  ] as Array<{
    key: IncomeBracketKey;
    label: string;
    households: Record<HouseholdSize, number>;
    isUpperBound?: boolean;
  }>,
} as const;

