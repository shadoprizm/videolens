import { afterEach, expect, it, vi } from 'vitest';
const release = vi.hoisted(() => vi.fn());
vi.mock('../api/_lib/entitlements.js', () => ({releaseStaleReports:release}));
import {handler} from '../api/report-maintenance.js';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it('allows only the configured cron credential to release stale reservations',async()=>{
 vi.stubEnv('CRON_SECRET','fixture');
 expect((await handler(new Request('https://videolens.io/api/report-maintenance'))).status).toBe(401);
 expect(release).not.toHaveBeenCalled();
 release.mockResolvedValue(3);
 const response=await handler(new Request('https://videolens.io/api/report-maintenance',{headers:{authorization:'Bearer fixture'}}));
 expect(await response.json()).toEqual({released:3});
 expect(release).toHaveBeenCalledOnce();
});
