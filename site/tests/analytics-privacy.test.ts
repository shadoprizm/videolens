import {readFileSync} from "node:fs";
import vm from "node:vm";
import {describe,expect,it} from "vitest";
function loadSanitizer(){
  const calls:unknown[][]=[];
  vm.runInNewContext(readFileSync(new URL("../analytics.js",import.meta.url),"utf8"),{window:{location:{origin:"https://videolens.io"},va:(...args:unknown[])=>calls.push(args)},document:{addEventListener:()=>{}},URL,URLSearchParams});
  return calls.find(c=>c[0]==="beforeSend")![1] as (event:{url:string;type:string})=>{url:string}|null;
}
describe("anonymous analytics URL redaction",()=>{
  it("strips login, pairing, checkout and report identifiers and drops nonpublic routes",()=>{
    const sanitize=loadSanitizer();
    for(const url of ["https://videolens.io/account?code=secret#access_token=secret","https://videolens.io/account?connect=nonce&device=id","https://videolens.io/account?connect=nonce&device=web-id&client=web","https://videolens.io/account?session_id=cs_secret#report=private"]){expect(sanitize({url,type:"pageview"})?.url).toBe("https://videolens.io/account");}
    expect(sanitize({url:"https://videolens.io/admin",type:"pageview"})).toBeNull();expect(sanitize({url:"https://videolens.io/private/token",type:"pageview"})).toBeNull();
  });
  it("keeps only campaign attribution parameters",()=>{
    const sanitize=loadSanitizer();
    const result=sanitize({url:"https://videolens.io/account?utm_source=email&code=secret&utm_medium=email&connect=nonce&utm_campaign=founding_welcome&utm_content=cta&utm_term=pro&session_id=cs_secret&utm_id=extra#report=private",type:"pageview"})!.url;
    expect(result).toBe("https://videolens.io/account?utm_source=email&utm_medium=email&utm_campaign=founding_welcome&utm_content=cta&utm_term=pro");
    expect(result).not.toMatch(/secret|nonce|private|utm_id/);
    expect(sanitize({url:"https://videolens.io/?utm_source=newsletter",type:"pageview"})!.url).toBe("https://videolens.io/?utm_source=newsletter");
    expect(sanitize({url:`https://videolens.io/?utm_source=${"x".repeat(101)}`,type:"pageview"})!.url).toBe("https://videolens.io/");
  });
});
