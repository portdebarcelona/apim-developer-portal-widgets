import {describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function deployment(confirmation: string | undefined, returnedId: string) {
  const cli = vi.fn((_command: string, _args: string[], _options: unknown) => returnedId);
  const sdk = vi.fn();
  const module = {exports: {} as any};
  runInNewContext(readFileSync('scripts/deploy-widget.cjs', 'utf8'), {
    module, __dirname: `${process.cwd()}/scripts`, console,
    process: {platform: 'win32', env: {APIM_DEPLOY_CONFIRM: confirmation}},
    require: (name: string) => name === 'node:child_process' ? {execFileSync: cli} :
      name === '@azure/api-management-custom-widgets-tools' ? {deployNodeJS: sdk} : {},
  });
  return {helper: module.exports, cli, sdk};
}
describe('protección de destino de despliegue (CLI y SDK simulados)', () => {
  it('sin confirmación no consulta Azure ni llama al SDK', () => {
    const {helper, cli, sdk} = deployment(undefined, '');
    expect(() => helper.validateTarget()).toThrow('APIM_DEPLOY_CONFIRM');
    expect(cli).not.toHaveBeenCalled(); expect(sdk).not.toHaveBeenCalled();
  });
  it('rechaza una confirmación de otra instancia', () => {
    const {helper, cli} = deployment('apbapipre', '');
    expect(() => helper.validateTarget()).toThrow(); expect(cli).not.toHaveBeenCalled();
  });
  it('rechaza una respuesta Azure que apunta al recurso anterior', () => {
    const {helper, sdk} = deployment('apim-cmn-pre', '/subscriptions/example/resourceGroups/rg-common/providers/Microsoft.ApiManagement/service/apbapipre');
    expect(() => helper.validateTarget()).toThrow('destino'); expect(sdk).not.toHaveBeenCalled();
  });
  it('valida únicamente el Resource ID completo de rg-apimgmt/apim-cmn-pre', () => {
    const expected = 'subscriptions/1b2f2b67-bfca-4ccc-87ee-f887cf98d217/resourceGroups/rg-apimgmt/providers/Microsoft.ApiManagement/service/apim-cmn-pre';
    const {helper, cli, sdk} = deployment('apim-cmn-pre', `/${expected}\n`);
    expect(helper.resourceId).toBe(expected); expect(() => helper.validateTarget()).not.toThrow();
    expect(cli.mock.calls[0][1].join(' ')).toContain('--subscription 1b2f2b67-bfca-4ccc-87ee-f887cf98d217');
    expect(sdk).not.toHaveBeenCalled();
  });
});
