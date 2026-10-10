import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/lib/settings-defaults';
import type { LeadType, Settings, SignalType } from '@/lib/types';
import { recommendService } from '../index';

const S: Settings = DEFAULT_SETTINGS;
const L = (lead_type: LeadType = 'corporate', est_locations: number | null = null) => ({ lead_type, est_locations });
const sg = (...t: SignalType[]) => t.map((signal_type) => ({ signal_type }));

describe('recommendService', () => {
  it('individual lead -> individual headshot', () => {
    expect(recommendService(L('individual'), [], S).service).toBe('Individual headshot + LinkedIn optimisation');
  });
  it('business_launch signal -> individual headshot', () => {
    expect(recommendService(L('corporate'), sg('business_launch'), S).service).toBe('Individual headshot + LinkedIn optimisation');
  });
  it('executive lead -> executive portraits', () => {
    expect(recommendService(L('executive'), [], S).service).toBe('Executive & board portraits');
  });
  it('exec_appointment signal -> executive portraits', () => {
    expect(recommendService(L('corporate'), sg('exec_appointment'), S).service).toBe('Executive & board portraits');
  });
  it('multi-location -> on-site, capacity validated', () => {
    const r = recommendService(L('corporate', 3), sg('hiring'), S);
    expect(r.service).toBe('On-site staff photography');
    expect(r.reason).toMatch(/capacity must be validated/);
  });
  it('single location is not multi-location', () => {
    expect(recommendService(L('corporate', 1), sg('hiring'), S).service).toBe('Corporate team headshots');
  });
  it('rebrand -> team headshots with brand upsell', () => {
    const r = recommendService(L(), sg('rebrand'), S);
    expect(r.service).toBe('Corporate team headshots');
    expect(r.reason).toMatch(/brand photography upsell/);
  });
  it.each(['hiring', 'onboarding', 'graduate_intake', 'new_office', 'merger', 'team_page'] as SignalType[])('%s -> team headshots', (t) => {
    expect(recommendService(L(), sg(t), S).service).toBe('Corporate team headshots');
  });
  it('corporate with no signals -> team headshots', () => {
    expect(recommendService(L(), [], S).service).toBe('Corporate team headshots');
  });
  it('otherwise null', () => {
    expect(recommendService(L(), sg('tender'), S).service).toBeNull();
    expect(recommendService(L(), sg('other', 'event'), S).service).toBeNull();
  });
  it('precedence: individual beats executive and multi-location', () => {
    expect(recommendService(L('individual', 5), sg('exec_appointment'), S).service).toBe('Individual headshot + LinkedIn optimisation');
  });
  it('missing catalogue entry -> null service', () => {
    const s: Settings = { ...S, service_catalogue: S.service_catalogue.filter((c) => c.id !== 'corporate-team-headshots') };
    const r = recommendService(L(), [], s);
    expect(r.service).toBeNull();
    expect(r.reason).toMatch(/missing/);
  });
});
