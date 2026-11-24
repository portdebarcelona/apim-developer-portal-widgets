import {describe, expect, it, vi} from 'vitest';
import {ApiNavigation, apiFromHash, observeNavigation} from '../../shared/api-documentation/navigation';
import type {LoadedApi} from '../../shared/api-documentation/types';
const result = (apiId: string): LoadedApi => ({apiId, document: {}, warnings: []});
describe('navegación y aislamiento', () => {
  it('respeta versiones/revisiones y hashes vacíos o malformados', () => {
    expect(apiFromHash('#api=PTP%3Brev%3D2&operation=get')).toBe('PTP;rev=2');
    expect(apiFromHash('#operation=x&api=V2')).toBe('V2');
    expect(apiFromHash('#api=PTP%3Brev%3D2/GET/ping')).toBe('PTP;rev=2');
    expect(apiFromHash('#api=%broken')).toBe(''); expect(apiFromHash('')).toBe('');
  });
  it('aborta selección anterior y descarta su respuesta aunque el transporte ignore abort', async () => {
    let resolveOld!: (api: LoadedApi) => void; const signals: AbortSignal[] = [];
    const load = vi.fn((api: string, signal: AbortSignal) => {signals.push(signal); return api === 'old' ? new Promise<LoadedApi>(resolve => {resolveOld = resolve;}) : Promise.resolve(result(api));});
    const reset = vi.fn(), accept = vi.fn(), fail = vi.fn(); const nav = new ApiNavigation(load, reset, accept, fail);
    const old = nav.select('old'); await nav.select('new'); resolveOld(result('old')); await old;
    expect(signals[0].aborted).toBe(true); expect(accept.mock.calls.map(call => call[0].apiId)).toEqual(['new']);
    expect(reset.mock.calls).toEqual([['old'], ['new']]); expect(fail).not.toHaveBeenCalled();
    await nav.select('new'); expect(load).toHaveBeenCalledTimes(2);
    await nav.select('new', true); expect(load).toHaveBeenCalledTimes(3);
  });
  it('al desmontar aborta y evita resultados, errores y nuevas cargas', async () => {
    let reject!: (error: Error) => void; let signal!: AbortSignal;
    const accept = vi.fn(), fail = vi.fn(), load = vi.fn((_api: string, value: AbortSignal) => {signal = value; return new Promise<LoadedApi>((_, no) => {reject = no;});});
    const nav = new ApiNavigation(load, vi.fn(), accept, fail); const pending = nav.select('old');
    nav.dispose(); reject(new Error('late')); await pending; await nav.select('new');
    expect(signal.aborted).toBe(true); expect(load).toHaveBeenCalledTimes(1); expect(accept).not.toHaveBeenCalled(); expect(fail).not.toHaveBeenCalled();
  });
  it('abandona una API al vaciar selección y muestra fallos de la selección actual', async () => {
    const reset = vi.fn(), fail = vi.fn(); const nav = new ApiNavigation(async () => {throw new Error('fallo');}, reset, vi.fn(), fail);
    await nav.select('api'); expect(fail).toHaveBeenCalledWith('fallo'); await nav.select(''); expect(reset).toHaveBeenLastCalledWith('');
  });
  it('retira listeners de hashchange al desmontar', () => {
    const current = new EventTarget() as Window; Object.assign(current, {location: {hash: '#api=one'}, parent: current});
    const changed = vi.fn(); const stop = observeNavigation(changed, current);
    current.location.hash = '#api=two'; current.dispatchEvent(new Event('hashchange')); stop();
    current.dispatchEvent(new Event('hashchange'));
    expect(changed.mock.calls).toEqual([['one'], ['two']]);
  });
  it('funciona en sandbox sin acceso al padre con el hash propagado por APIM', () => {
    const current = new EventTarget() as Window; Object.assign(current, {location: {hash: '#api=sandbox'}, parent: {get location() {throw new Error('SecurityError');}}});
    const changed = vi.fn(); const stop = observeNavigation(changed, current); stop(); expect(changed).toHaveBeenCalledWith('sandbox');
  });
});
