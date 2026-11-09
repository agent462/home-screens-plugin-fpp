import { describe, expect, it } from 'vitest';
import statuses from '../../test/fixtures/statuses.json';
import type { FppStatus } from './fpp-types';
import { nominalVoltage, readingNames, summarizeSensors, warningTexts } from './sensors';

const st = (ip: string) => (statuses as Record<string, FppStatus>)[ip];

describe('summarizeSensors on real boards', () => {
  it('splits chip and board and finds the lowest supply (K8-Max, two inputs)', () => {
    const s = summarizeSensors(st('192.168.0.104').sensors);
    expect(s.chip).toBeCloseTo(57.4, 1);
    expect(s.board).toBeCloseTo(35.6, 1);
    expect(s.lowestSupply).toBeCloseTo(11.6, 1);
    expect(s.nominal).toBe(12);
    expect(s.lowPower).toBe(false);
    expect(s.hot).toBe(false);
  });

  it('drops a probe that reads zero (Arches Right Temp 0.0)', () => {
    const s = summarizeSensors(st('192.168.0.117').sensors);
    expect(s.board).toBeNull();
    expect(s.readings.some((r) => r.value === 0)).toBe(false);
  });

  it('treats the PocketScroller 5 V supply as healthy', () => {
    const s = summarizeSensors(st('192.168.0.204').sensors);
    expect(s.nominal).toBe(5);
    expect(s.lowPower).toBe(false);
  });

  it('flags hot at 75°C and low power 5% under nominal', () => {
    expect(summarizeSensors([{ label: 'MAIN0: ', value: 75.2, valueType: 'Temperature' }]).hot).toBe(true);
    expect(summarizeSensors([{ label: 'MAIN0: ', value: 74.9, valueType: 'Temperature' }]).hot).toBe(false);
    expect(summarizeSensors([{ label: 'VIN: ', value: 11.3, valueType: 'Voltage' }]).lowPower).toBe(true);
    expect(summarizeSensors([{ label: 'VIN: ', value: 11.5, valueType: 'Voltage' }]).lowPower).toBe(false);
    expect(summarizeSensors([{ label: 'VIN: ', value: 4.6, valueType: 'Voltage' }]).lowPower).toBe(true);
  });

  it('copes with a box that sends no sensors', () => {
    expect(summarizeSensors(undefined)).toMatchObject({ hottest: null, lowestSupply: null, hot: false, lowPower: false });
  });

  it('guesses the supply', () => {
    expect(nominalVoltage(24.1)).toBe(24);
    expect(nominalVoltage(12.4)).toBe(12);
    expect(nominalVoltage(5.1)).toBe(5);
    expect(nominalVoltage(2)).toBeNull();
  });

  it('names readings for the detail sheet', () => {
    const s = summarizeSensors(st('192.168.0.106').sensors); // Flake: two boards, four inputs
    expect(readingNames(s.readings)).toEqual(['Board 1', 'Board 2', 'Power 1', 'Power 2', 'Power 3', 'Power 4']);
  });
});

describe('warningTexts', () => {
  it('reads the real Quad Props warning', () => {
    expect(warningTexts(st('192.168.0.113').warnings)).toEqual(['Could not create output type BBB48String. Check logs for details.']);
  });
  it('accepts objects with a message and skips junk', () => {
    expect(warningTexts([{ message: 'Low disk' }, '', 3, null, ' Two '])).toEqual(['Low disk', 'Two']);
    expect(warningTexts(undefined)).toEqual([]);
  });
});
