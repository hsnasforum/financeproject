import { expect, test } from "./helpers/e2eTest";
import { normalizeFinlifeProducts } from "../../src/lib/finlife/normalize";

test("loan company and subtype collisions keep independent favorites after reload and mobile resize", async ({ page }, testInfo) => {
  const baseList = [
    {fin_co_no:"0010001",fin_prdt_cd:"COLLISION",crdt_prdt_type:"2",dcls_month:"202609",kor_co_nm:"첫째은행",fin_prdt_nm:"첫째은행 한도대출"},
    {fin_co_no:"0010002",fin_prdt_cd:"COLLISION",crdt_prdt_type:"2",dcls_month:"202609",kor_co_nm:"둘째은행",fin_prdt_nm:"둘째은행 한도대출"},
    {fin_co_no:"0010001",fin_prdt_cd:"COLLISION",crdt_prdt_type:"3",dcls_month:"202609",kor_co_nm:"첫째은행",fin_prdt_nm:"첫째은행 카드대출"},
  ];
  const products = normalizeFinlifeProducts({kind:"credit-loan",baseList,optionList:baseList.map(row=>({...row,crdt_lend_rate_type:"A",crdt_grad_avg:4}))});
  const errors: string[] = [];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/api/finlife/credit-loan?**",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
    ok:true,mode:"live",data:products,meta:{kind:"credit-loan",topFinGrpNo:"020000",pageNo:1,hasNext:false,fallbackUsed:false,totalCount:3}
  })}));
  await page.goto("/products/credit-loan?view=product");
  for (const row of baseList) await expect(page.getByRole("heading",{name:row.fin_prdt_nm,exact:true})).toBeVisible();
  await page.getByRole("button",{name:"즐겨찾기",exact:true}).first().click();
  const favorites = await page.evaluate(()=>JSON.parse(localStorage.getItem("products_shelf_v1") ?? "{}").favorites as string[]);
  expect(favorites).toHaveLength(1);
  expect(favorites[0]).toMatch(/^finlife:credit-loan:001000[12]:COLLISION:[23]$/);
  await page.reload();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("checkbox",{name:"즐겨찾기",exact:true}).check();
  const selected=products.find(row=>row.identityKey===favorites[0])!;
  await expect(page.getByRole("heading",{name:selected.fin_prdt_nm!,exact:true})).toBeVisible();
  for(const row of baseList.filter(row=>row.fin_prdt_nm!==selected.fin_prdt_nm)){
    await expect(page.getByRole("heading",{name:row.fin_prdt_nm,exact:true})).toHaveCount(0);
  }
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("products_shelf_v1") ?? "{}").favorites)).toEqual(favorites);
  await page.screenshot({ path: testInfo.outputPath("mobile-scoped-favorite.png"), fullPage: true });
  expect(errors).toEqual([]);
});
