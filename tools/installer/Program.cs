using System;
using System.Windows.Forms;

namespace SST.Installer;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (HasFlag(args, "--smoke-test"))
        {
            return EmbeddedPayload.Exists && TermsResourceExists() ? 0 : 2;
        }

        ApplicationConfiguration.Initialize();

        var screenshotPath = GetOptionValue(args, "--screenshot");
        if (!string.IsNullOrWhiteSpace(screenshotPath))
        {
            using var preview = new InstallerForm();
            preview.SaveScreenshot(screenshotPath);
            return 0;
        }

        Application.Run(new InstallerForm());
        return 0;
    }

    private static bool HasFlag(string[] args, string flag)
    {
        foreach (var arg in args)
        {
            if (string.Equals(arg, flag, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static bool TermsResourceExists()
    {
        using var stream = typeof(Program).Assembly.GetManifestResourceStream("SST.Installer.Assets.NON-COMMERCIAL-TERMS.md");
        return stream is not null;
    }

    private static string? GetOptionValue(string[] args, string name)
    {
        for (var index = 0; index < args.Length - 1; index++)
        {
            if (string.Equals(args[index], name, StringComparison.OrdinalIgnoreCase))
            {
                return args[index + 1];
            }
        }

        return null;
    }
}
