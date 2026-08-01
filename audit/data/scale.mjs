import { readFileSync } from "fs";
const src = readFileSync("perf.mjs","utf8").replace(/const TARGET[\s\S]*$/,"export {strip};");
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
for (const kb of [16,32,64,128,256]) {
  const unit = "`a`\n||\n";
  const content = unit.repeat(Math.floor(kb*1024/unit.length));
  const t0=process.hrtime.bigint(); mod.strip(content); const t1=process.hrtime.bigint();
  console.log(kb+"KB ->", (Number(t1-t0)/1e6).toFixed(1)+"ms");
}
