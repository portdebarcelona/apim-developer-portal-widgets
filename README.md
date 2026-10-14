# APIM Developer Portal

Portal de APIs del Port de Barcelona y widgets para el portal de Azure API Management.

| Directorio | Contenido |
| --- | --- |
| `apps/developer-portal` | Frontend Vue con autenticación Entra y documentación Scalar/Swagger. |
| `apps/developer-portal-bff` | API .NET 8 para consultar el catálogo y exportar OpenAPI desde APIM. |
| `packages/apim-core` | Cliente APIM y tipos compartidos por el portal y los widgets. |
| `azure-api-management-widget-cw-apislist` | Catálogo de APIs. |
| `azure-api-management-widget-cw-apisperapp` | APIs agrupadas por aplicación. |
| `azure-api-management-widget-cw-prodbygroups` | APIs agrupadas por productos accesibles al usuario. |
| `infra` | Plantillas Bicep y parámetros de despliegue. |

## Desarrollo local

Requisitos: Node.js 22.12 o superior, npm y .NET SDK 8 o superior.
Para consultar APIM, Azure CLI debe estar autenticada con permisos de lectura.

Copia `.env.local-pre.example` a `.env.local-pre` y completa los identificadores
Entra. El BFF requiere un token para su audiencia con el scope `access_as_user`.

```powershell
dotnet run --project apps/developer-portal-bff --launch-profile https-local-pre-entra
```

En otro terminal:

```powershell
cd apps/developer-portal
npm ci
npm run dev:local-pre
```

Para desarrollo con autenticación simulada, usa `.env.local-pre-mock.example`,
el perfil BFF `https-local-pre` y `npm run dev:local-pre-mock`.
La autenticación simulada está limitada al entorno Development.

## Compilación y pruebas

Desde `apps/developer-portal`, ejecuta `npm test` y `npm run build`.
Desde la raíz:

```powershell
dotnet test apps/developer-portal-bff-tests/DeveloperPortal.Bff.Tests.csproj --configuration Release
```

Los widgets se compilan con `npm ci` y `npm run build` desde su directorio.

## Despliegue

Los workflows manuales de `.github/workflows` despliegan el frontend y el BFF
al entorno PRE. La configuración de APIM está en `config/apim-target.json`;
los parámetros Bicep están en `infra/parameters`.
Cada widget conserva su script `npm run deploy`.

Las variables disponibles están en `.env.example`. No guardes credenciales
ni secretos de cliente en los archivos de configuración.
