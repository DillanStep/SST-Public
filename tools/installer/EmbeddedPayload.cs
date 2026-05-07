using System.IO;
using System.Reflection;

namespace SST.Installer;

internal static class EmbeddedPayload
{
    private const string PayloadResourceSuffix = ".assets.sst-payload.zip";

    public static bool Exists => FindPayloadResourceName() is not null;

    public static Stream Open()
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resourceName = FindPayloadResourceName()
            ?? throw new FileNotFoundException("The embedded SST payload was not found.");
        return assembly.GetManifestResourceStream(resourceName)
            ?? throw new FileNotFoundException("The embedded SST payload could not be opened.");
    }

    private static string? FindPayloadResourceName()
    {
        foreach (var name in Assembly.GetExecutingAssembly().GetManifestResourceNames())
        {
            if (name.EndsWith(PayloadResourceSuffix, System.StringComparison.OrdinalIgnoreCase))
            {
                return name;
            }
        }

        return null;
    }
}
