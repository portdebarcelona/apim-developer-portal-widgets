const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const subscription = '1b2f2b67-bfca-4ccc-87ee-f887cf98d217';
const resourceId = `subscriptions/${subscription}/resourceGroups/rg-apimgmt/providers/Microsoft.ApiManagement/service/apim-cmn-pre`;
function validateTarget() {
  if (process.env.APIM_DEPLOY_CONFIRM !== 'apim-cmn-pre') throw new Error('Define APIM_DEPLOY_CONFIRM=apim-cmn-pre para autorizar la escritura posterior.');
  // az.cmd needs cmd.exe on Windows; every argument is a fixed value here.
  const args = ['apim', 'show', '--subscription', subscription, '--resource-group', 'rg-apimgmt', '--name', 'apim-cmn-pre', '--query', 'id', '-o', 'tsv'];
  const output = process.platform === 'win32' ?
    execFileSync('cmd.exe', ['/d', '/s', '/c', `az ${args.join(' ')}`], {encoding: 'utf8'}) :
    execFileSync('az', args, {encoding: 'utf8'});
  if (output.trim().replace(/^\//, '').toLowerCase() !== resourceId.toLowerCase()) throw new Error('El destino Azure no coincide.');
}
async function deployWidget(name) {
  if (!['cw-api-documentation', 'cw-api-documentation-swagger'].includes(name)) throw new Error('Widget no permitido');
  validateTarget();
  const dir = path.resolve(__dirname, `../azure-api-management-widget-${name}`);
  if (path.resolve(process.cwd()) !== dir) throw new Error('Ejecuta npm run deploy desde el proyecto del widget.');
  for (const file of ['dist/index.html', 'dist/editor.html', 'dist/config.msapim.json', ...(name.endsWith('swagger') ? ['dist/oauth2-redirect.html'] : [])]) {
    if (!fs.existsSync(path.join(dir, file))) throw new Error(`Falta ${file}`);
  }
  const {deployNodeJS} = require('@azure/api-management-custom-widgets-tools');
  await deployNodeJS({resourceId, managementApiEndpoint: 'https://management.azure.com'}, name,
    './static/config.msapim.json', {interactiveBrowserCredentialOptions: {redirectUri: 'http://localhost:1337'}});
}
module.exports = {deployWidget, validateTarget, resourceId};
