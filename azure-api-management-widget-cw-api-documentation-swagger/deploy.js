import deployment from '../scripts/deploy-widget.cjs';
deployment.deployWidget('cw-api-documentation-swagger').catch(() => { console.error('Despliegue cancelado o fallido. Comprueba el destino y la sesión Azure.'); process.exitCode = 1; });
