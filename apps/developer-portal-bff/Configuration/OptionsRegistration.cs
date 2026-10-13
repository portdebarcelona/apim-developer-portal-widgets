using Microsoft.Extensions.Options;

namespace PortBarcelona.DeveloperPortal.Bff.Configuration;

public static class OptionsRegistration
{
    public static IServiceCollection AddPortalOptions(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<ApimOptions>()
            .Bind(configuration.GetSection(ApimOptions.SectionName))
            .PostConfigure(options =>
            {
                options.SubscriptionId = configuration["APIM_SUBSCRIPTION_ID"] ?? options.SubscriptionId;
                options.ResourceGroup = configuration["APIM_RESOURCE_GROUP"] ?? options.ResourceGroup;
                options.ServiceName = configuration["APIM_SERVICE_NAME"] ?? options.ServiceName;
                options.ManagementEndpoint = configuration["AZURE_MANAGEMENT_API_ENDPOINT"] ?? options.ManagementEndpoint;
            })
            .Validate(options => Guid.TryParse(options.SubscriptionId, out _), "APIM subscription ID is required")
            .Validate(options => !string.IsNullOrWhiteSpace(options.ResourceGroup), "APIM resource group is required")
            .Validate(options => !string.IsNullOrWhiteSpace(options.ServiceName), "APIM service name is required")
            .ValidateOnStart();

        services.AddOptions<PortalAuthorizationOptions>()
            .Bind(configuration.GetSection(PortalAuthorizationOptions.SectionName));
        services.AddOptions<CatalogOptions>()
            .Bind(configuration.GetSection(CatalogOptions.SectionName))
            .Validate(options => options.CacheDurationMinutes is >= 5 and <= 15,
                "Catalog cache duration must be between 5 and 15 minutes")
            .Validate(options => options.MaxConcurrentProductRequests is >= 1 and <= 16,
                "Catalog product request concurrency must be between 1 and 16")
            .ValidateOnStart();
        services.AddOptions<OpenApiOptions>()
            .Bind(configuration.GetSection(OpenApiOptions.SectionName))
            .Validate(options => options.CacheEntryLimit > 0, "OpenAPI cache entry limit must be positive")
            .Validate(options => options.CacheDurationMinutes > 0, "OpenAPI cache duration must be positive")
            .Validate(options => options.MaxDocumentBytes > 0, "OpenAPI maximum document size must be positive")
            .ValidateOnStart();
        services.AddOptions<SecurityHeadersOptions>()
            .Bind(configuration.GetSection(SecurityHeadersOptions.SectionName));
        return services;
    }
}
