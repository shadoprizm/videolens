import {readFileSync} from "node:fs";
import vm from "node:vm";
import {describe,expect,it} from "vitest";
describe("anonymous analytics URL redaction",()=>{
  it("strips login, pairing, checkout and report identifiers and drops nonpublic routes",()=>{
    const calls:unknown[][]=[];
    vm.runInNewContext(readFileSync(new URL("../analytics.js",import.meta.url),"utf8"),{window:{location:{origin:"https://videolens.io"},va:(...args:unknown[])=>calls.push(args)},document:{addEventListener:()=>{}},URL});
    const sanitize=calls.find(c=>c[0]==="beforeSend")![1] as (event:{url:string;type:string})=>{url:string}|null;
    for(const url of ["https://videolens.io/account?code=secret#access_token=secret","https://videolens.io/account?connect=nonce&device=id","https://videolens.io/account?session_id=cs_secret#report=private"]){expect(sanitize({url,type:"pageview"})?.url).toBe("https://videolens.io/account");}
    expect(sanitize({url:"https://videolens.io/admin",type:"pageview"})).toBeNull();expect(sanitize({url:"https://videolens.io/private/token",type:"pageview"})).toBeNull();
  });
});
