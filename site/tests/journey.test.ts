import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({auth:vi.fn(),record:vi.fn(),report:vi.fn()}));
vi.mock("../api/_lib/auth.js",()=>({authenticate:m.auth}));
vi.mock("../api/_lib/journey.js",async()=>{const events=await import("../shared/journey.js");return {JOURNEY_EVENTS:events.JOURNEY_EVENTS,recordJourney:m.record};});
vi.mock("../api/_lib/supabase.js",()=>({supabaseAdmin:()=>({from:()=>({select:()=>({eq:()=>({eq:()=>({eq:()=>({maybeSingle:m.report})})})})})})}));
import {handler} from "../api/journey.js";
const reportId="00000000-0000-0000-0000-000000000001";
const request=(body:unknown)=>new Request("https://videolens.io/api/journey",{method:"POST",body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({id:"u",source:"website"});m.report.mockResolvedValue({data:{id:reportId},error:null});});
describe("bounded journey ingestion",()=>{
  it("accepts only supported names and rejects arbitrary content",async()=>{expect((await handler(request({event:"account_opened",url:"secret"}))).status).toBe(400);expect((await handler(request({event:"arbitrary"}))).status).toBe(400);expect(m.record).not.toHaveBeenCalled();});
  it("requires an owned completed report for feedback or report actions",async()=>{expect((await handler(request({event:"feedback_helpful"}))).status).toBe(400);m.report.mockResolvedValue({data:null,error:null});expect((await handler(request({event:"report_exported",reportId}))).status).toBe(404);expect(m.record).not.toHaveBeenCalled();});
  it("does not ingest background extension activity",async()=>{m.auth.mockResolvedValue({id:"u",source:"extension"});expect((await handler(request({event:"account_opened"}))).status).toBe(403);expect(m.record).not.toHaveBeenCalled();expect((await handler(request({event:"feedback_partial",reportId}))).status).toBe(200);expect(m.record).toHaveBeenCalledWith("u","feedback_partial","extension",reportId);});
});
