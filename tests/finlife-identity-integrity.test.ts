import { describe, it, expect, vi } from "vitest";
import { mergeProducts, mergeAcrossGroups } from "../scripts/finlife_cli_common.mjs";
import { persistFinlifeSyncKind } from "../scripts/finlife_persistence.mjs";
import { validateFinlifeResponse, validateFinlifeProducts, finlifeIdentity } from "../src/lib/finlife/identity.mjs";
const base = (company: string, extra = {}) => ({fin_co_no:company, fin_prdt_cd:"SHARED", dcls_month:"202609", kor_co_nm:company, fin_prdt_nm:"상품", ...extra});
const option = (company: string, extra = {}) => ({...base(company), intr_rate:3, intr_rate2:4, save_trm:"12", ...extra});
describe("FINLIFE raw identity integrity", () => {
 it("preserves two companies with the same code and attaches only their own options", () => {
  const rows=mergeProducts([base("0010001"),base("0010002")],[option("0010001"),option("0010002")],"020000");
  expect(rows).toHaveLength(2);
  expect(rows.map(p=>p.options.map(o=>o.raw.fin_co_no))).toEqual([["0010001"],["0010002"]]);
  expect(mergeAcrossGroups([{group:"020000",items:rows}]).items).toHaveLength(2);
 });
 it("separates credit loan subtypes even within one company and code", () => {
  const rows=mergeProducts([base("0010001",{crdt_prdt_type:"2"}),base("0010001",{crdt_prdt_type:"3"})],[option("0010001",{crdt_prdt_type:"2"}),option("0010001",{crdt_prdt_type:"3"})],"020000");
  expect(rows).toHaveLength(2);
  expect(rows.map(p=>p.options[0].raw.crdt_prdt_type)).toEqual(["2","3"]);
 });
 it("rejects company and disclosure-month orphans", () => {
  expect(()=>mergeProducts([base("0010001")],[option("0010002")],"020000")).toThrow(/orphan/i);
  expect(()=>mergeProducts([base("0010001")],[option("0010001",{dcls_month:"202608"})],"020000")).toThrow(/orphan/i);
 });
 it("does not collapse loan options with identical absent deposit-rate fields", () => {
  const rows=mergeProducts([base("0010001")],[option("0010001",{lend_rate_type:"F"}),option("0010001",{lend_rate_type:"V"})],"020000");
  const merged=mergeAcrossGroups([{group:"020000",items:rows},{group:"030000",items:rows}]);
  expect(merged.items[0].options).toHaveLength(2);
 });
 it("rejects conflicting duplicate base rows", () => {
  expect(()=>mergeProducts([base("0010001"),base("0010001",{fin_prdt_nm:"다른상품"})],[],"020000")).toThrow(/duplicate/i);
 });
 it("blocks a mismatched candidate before DB, snapshot, or completion writes", async () => {
  const syncProductsToDb=vi.fn(async()=>{throw new Error("invalid candidates must never reach DB");}),writeSnapshot=vi.fn(),writeCompletionEvidence=vi.fn();
  await expect(persistFinlifeSyncKind({kind:"deposit",snapshot:{meta:{generatedAt:"2026-10-10T15:00:00.000Z",ttlMs:43200000,groupsScanned:["020000"],pagesFetchedByGroup:{"020000":1},totalProducts:1,totalOptions:1,completionRate:1,truncatedByHardCap:false,source:"finlife"},items:[{...base("0010001"),raw:base("0010001"),options:[{raw:option("0010002"),intr_rate:3,intr_rate2:4}]}]}},{
   syncProductsToDb,writeSnapshot,writeCompletionEvidence,writeSyncAttempt:vi.fn(),clearSyncAttempt:vi.fn()
  })).rejects.toThrow();
  expect(syncProductsToDb).not.toHaveBeenCalled(); expect(writeSnapshot).not.toHaveBeenCalled();expect(writeCompletionEvidence).not.toHaveBeenCalled();
 });
});

describe("FINLIFE normalized identity consistency", () => {
 it("rejects a supplied identity key that names a different company before persistence", async () => {
  const syncProductsToDb = vi.fn(), writeSnapshot = vi.fn(), writeCompletionEvidence = vi.fn();
  const items = [{ ...base("0010001"), identityKey: "finlife:deposit:0010002:SHARED", raw: base("0010001"), options: [] }];
  await expect(persistFinlifeSyncKind({ kind: "deposit", snapshot: {
   meta: { generatedAt: "2026-10-10T15:00:00.000Z", ttlMs: 43200000, groupsScanned: ["020000"], pagesFetchedByGroup: { "020000": 1 }, totalProducts: 1, totalOptions: 0, completionRate: 1, truncatedByHardCap: false, source: "finlife" },
   items,
  } }, { syncProductsToDb, writeSnapshot, writeCompletionEvidence, writeSyncAttempt: vi.fn(), clearSyncAttempt: vi.fn() })).rejects.toThrow();
  expect(syncProductsToDb).not.toHaveBeenCalled();
  expect(writeSnapshot).not.toHaveBeenCalled();
  expect(writeCompletionEvidence).not.toHaveBeenCalled();
 });
});

describe("FINLIFE disclosure and response contract", () => {
 it("keeps stable identity across disclosures but replaces old options rather than merging them", () => {
   const old = mergeProducts([base("0010001",{dcls_month:"202608"})],[option("0010001",{dcls_month:"202608",intr_rate:1})],"020000");
   const current = mergeProducts([base("0010001")],[option("0010001")],"020000");
   expect(finlifeIdentity("deposit",old[0].raw)).toBe(finlifeIdentity("deposit",current[0].raw));
   const merged=mergeAcrossGroups([{group:"020000",items:old},{group:"020000",items:current}]).items;
   expect(merged).toHaveLength(1);expect(merged[0].options).toHaveLength(1);expect(merged[0].options[0].raw.dcls_month).toBe("202609");
 });
 it("rejects relabeled loan rows and inconsistent paging despite success code", () => {
   const raw={result:{err_cd:"000",prdt_div:"P",now_page_no:1,max_page_no:1,total_count:1,baseList:[base("0010001",{loan_type:"1"})],optionList:[]}};
   expect(()=>validateFinlifeResponse("pension",raw,{pageNo:1})).toThrow(/kind mismatch/);
   expect(()=>validateFinlifeResponse("deposit",raw,{pageNo:1})).toThrow(/division mismatch/);
   expect(()=>validateFinlifeResponse("pension",{result:{...raw.result,now_page_no:24,max_page_no:30,baseList:[]}},{pageNo:1})).toThrow(/paging mismatch/);
 });
 it("rejects incomplete identities rather than accepting a normalized name fallback", () => {
  expect(()=>validateFinlifeProducts("deposit",[{fin_prdt_cd:"SHARED",options:[],raw:{fin_prdt_cd:"SHARED"}}])).toThrow();
 });
});

describe("FINLIFE count integrity", () => {
 it.each([null, "", false])("rejects malformed total_count %s instead of publishing empty success", (total_count) => {
  expect(()=>validateFinlifeResponse("deposit",{result:{err_cd:"000",prdt_div:"D",now_page_no:1,max_page_no:1,total_count,baseList:[],optionList:[]}},{pageNo:1})).toThrow(/paging mismatch/);
 });
});
