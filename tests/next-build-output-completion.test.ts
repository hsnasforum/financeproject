import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { PUBLIC_SNAPSHOT_FILES } from "../scripts/public_snapshot_assets.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(file: string) {
  for (let i = 0; i < 200; i++) { if (fs.existsSync(file)) return; await sleep(25); }
  throw new Error("fixture process did not finish");
}
const lateWriter = String.raw`
    const fs=require("node:fs");
    const stream=process.env.FAKE_NEXT_MODE === "late-stdout-warning" ? process.stdout : process.stderr;
    stream.on("error",()=>{});
    setTimeout(()=>{
      const warning=process.env.FAKE_NEXT_MODE.includes("warning");
      stream.write(warning ? "Failed to copy traced files for /synthetic/route.js\n" : "LATE_FINAL_OUTPUT\n",
        ()=>{fs.writeFileSync("writer-done","");process.exit(0);});
    },350);
`;
const fakeNext = String.raw`
const fs = require("node:fs"), path = require("node:path"), {spawn} = require("node:child_process");
const root = process.cwd(), mode = process.env.FAKE_NEXT_MODE;
function write(p, value) { p = path.join(root, p); fs.mkdirSync(path.dirname(p), {recursive:true}); fs.writeFileSync(p,value); }
write(".next/BUILD_ID", "output-completion-fixture");
write(".next/standalone/.next/BUILD_ID", "output-completion-fixture");
write(".next/standalone/server.js", "// test only");
write(".next/next-server.js.nft.json", JSON.stringify({version:1,files:["../package.json"]}));
if (mode === "nonzero") { process.stderr.write("nonzero-output\n"); process.exit(7); }
if (mode === "signal") { setInterval(()=>{},1000); process.kill(process.pid,"SIGTERM"); }
if (mode === "cancel") { write("ready",""); setInterval(()=>{},1000); }
else if (mode === "early-warning") { process.stderr.write("Failed to copy traced files for /synthetic/route.js\n"); }
else if (mode === "interleaved-warning") {
  process.stderr.write("Failed to copy trac");
  setTimeout(()=> {process.stdout.write("ordinary-stdout\n"); setTimeout(()=>process.stderr.write("ed files for /synthetic/route.js\n"),40);},40);
} else if (mode.startsWith("late-")) {
  const writer = __LATE_WRITER__;
  spawn(process.execPath,["-e",writer],{stdio:["ignore","inherit","inherit"],env:process.env}).unref();
  write("direct-child-exiting","");
  process.exit(mode === "late-nonzero" ? 7 : 0);
} else { process.stdout.write("ordinary-stdout\n"); process.stderr.write("ordinary-stderr\n"); }
`.replace("__LATE_WRITER__", JSON.stringify(lateWriter));

async function run(mode: string, cancel = false) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "finance-build-output-")));
  roots.push(root);
  fs.cpSync(path.join(repo, "scripts"), path.join(root, "scripts"), {recursive:true});
  fs.writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
  fs.mkdirSync(path.join(root, ".data"));
  for (const n of PUBLIC_SNAPSHOT_FILES) fs.writeFileSync(path.join(root, ".data", n), "{}");
  const bin=path.join(root,"node_modules/next/dist/bin/next.cjs");
  fs.mkdirSync(path.dirname(bin),{recursive:true});
  fs.writeFileSync(path.join(root,"node_modules/next/package.json"),JSON.stringify({exports:{"./dist/bin/next":mode === "startup-failure" ? "./missing.cjs" : "./dist/bin/next.cjs"}}));
  fs.writeFileSync(bin,fakeNext);
  const preload=path.join(root,"spawn-error.cjs");
  fs.writeFileSync(preload, 'const cp=require("node:child_process"), original=cp.spawn; cp.spawn=(file,args,options)=>original(args[0]?.endsWith("next.cjs") ? require("node:path").join(process.cwd(),"missing-executable") : file,args,options); require("node:module").syncBuiltinESMExports();');
  const child=spawn(process.execPath,[...(mode === "spawn-failure" ? ["--require",preload] : []),path.join(root,"scripts/next_build_safe.mjs"),"--webpack"],{
    cwd:root,env:{NODE_ENV:"test",PATH:process.env.PATH,TMPDIR:os.tmpdir(),FAKE_NEXT_MODE:mode,NEXT_TELEMETRY_DISABLED:"1"},
    stdio:["ignore","pipe","pipe"]
  });
  let stdout="",stderr="";
  child.stdout.on("data",b=>{stdout+=String(b);});child.stderr.on("data",b=>{stderr+=String(b);});
  const completion=new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve,reject)=>{
    child.once("error",reject);child.once("close",(code,signal)=>resolve({code,signal}));
  });
  if(cancel){await waitFor(path.join(root,"ready"));child.kill("SIGTERM");}
  const result=await completion;
  if(mode.startsWith("late-"))await waitFor(path.join(root,"writer-done"));
  return {...result,stdout,stderr,receipt:fs.existsSync(path.join(root,".next/standalone-privacy-receipt.json"))};
}

describe("actual next_build_safe output completion",()=>{
  it("admits an ordinary successful build after forwarding both streams",async()=>{
    const r=await run("success");expect(r.code,r.stderr).toBe(0);expect(r.receipt).toBe(true);
    expect(r.stdout).toContain("ordinary-stdout");expect(r.stderr).toContain("ordinary-stderr");
  },15000);
  it("forwards output held open beyond the direct child exit before admission",async()=>{
    const r=await run("late-normal");expect(r.code,r.stderr).toBe(0);expect(r.stderr).toContain("LATE_FINAL_OUTPUT");expect(r.receipt).toBe(true);
  },15000);
  it.each(["late-warning","late-stdout-warning","interleaved-warning","early-warning"])("rejects %s without publishing a privacy receipt",async mode=>{
    const r=await run(mode);expect({code:r.code,receipt:r.receipt}).toEqual({code:1,receipt:false});
    expect(r.stderr).toContain("standalone privacy check failed");
  },15000);
  it("preserves a nonzero child status and does not admit the build",async()=>{
    const r=await run("nonzero");expect(r.code).toBe(7);expect(r.receipt).toBe(false);expect(r.stderr).toContain("nonzero-output");
  },15000);
  it("drains inherited output while preserving a nonzero child status",async()=>{
    const r=await run("late-nonzero");expect(r.code).toBe(7);expect(r.stderr).toContain("LATE_FINAL_OUTPUT");expect(r.receipt).toBe(false);
  },15000);
  it("fails a real OS spawn error without creating a receipt",async()=>{
    const r=await run("spawn-failure");expect(r.code).toBe(1);expect(r.stderr).toContain("ENOENT");expect(r.receipt).toBe(false);
  },15000);
  it.skipIf(process.platform === "win32")("preserves a child termination signal",async()=>{
    const r=await run("signal");expect(r.code).toBeNull();expect(r.signal).toBe("SIGTERM");expect(r.receipt).toBe(false);
  },15000);
  it.skipIf(process.platform === "win32")("relays parent cancellation without admitting the build",async()=>{
    const r=await run("cancel",true);expect(r.code).toBeNull();expect(r.signal).toBe("SIGTERM");expect(r.receipt).toBe(false);
  },15000);
  it("fails startup without a resolvable Next executable and creates no receipt",async()=>{
    const r=await run("startup-failure");expect(r.code).toBe(1);expect(r.receipt).toBe(false);expect(r.stderr).toContain("MODULE_NOT_FOUND");
  },15000);
});
