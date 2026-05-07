using System;
using System.IO;
using System.Windows.Forms;

namespace SST.Manager;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        var repoRoot = RepoLocator.Resolve(args);
        if (HasFlag(args, "--smoke-test") || HasFlag(args, "--validate"))
        {
            return repoRoot is null ? 2 : 0;
        }

        var autoStart = !HasFlag(args, "--no-autostart") && !HasFlag(args, "--preview");
        ApplicationConfiguration.Initialize();

        var screenshotPath = GetOptionValue(args, "--screenshot");
        if (!string.IsNullOrWhiteSpace(screenshotPath))
        {
            using var preview = new ManagerForm(repoRoot, autoStart: false);
            preview.SaveScreenshot(screenshotPath);
            return 0;
        }

        Application.Run(new ManagerForm(repoRoot, autoStart));
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

internal static class RepoLocator
{
    public static string? Resolve(string[] args)
    {
        for (var i = 0; i < args.Length; i++)
        {
            if (string.Equals(args[i], "--repo-root", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                var explicitRoot = FindFrom(args[i + 1]);
                if (explicitRoot is not null)
                {
                    return explicitRoot;
                }
            }
        }

        var envRoot = Environment.GetEnvironmentVariable("SST_REPO_ROOT");
        if (!string.IsNullOrWhiteSpace(envRoot))
        {
            var resolved = FindFrom(envRoot);
            if (resolved is not null)
            {
                return resolved;
            }
        }

        return FindFrom(AppContext.BaseDirectory)
            ?? FindFrom(Environment.CurrentDirectory);
    }

    private static string? FindFrom(string start)
    {
        if (string.IsNullOrWhiteSpace(start))
        {
            return null;
        }

        var directory = Directory.Exists(start) ? new DirectoryInfo(start) : new FileInfo(start).Directory;
        while (directory is not null)
        {
            var apiEntry = Path.Combine(directory.FullName, "apps", "api", "src", "server.js");
            var webEntry = Path.Combine(directory.FullName, "apps", "web", "index.html");
            if (File.Exists(apiEntry) && File.Exists(webEntry))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        return null;
    }
}
