using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace SST.Installer;

internal sealed class InstallerForm : Form
{
    private readonly Image? brandLogo;
    private readonly Icon? appIcon;

    private readonly TextBox installPathBox = new();
    private readonly TextBox logBox = new();
    private readonly ModernButton browseButton = new();
    private readonly ModernButton installButton = new();
    private readonly ModernButton launchButton = new();
    private readonly ModernButton closeButton = new();
    private readonly RichTextBox termsBox = new();
    private readonly CheckBox runInstallTasks = new();
    private readonly CheckBox desktopShortcut = new();
    private readonly CheckBox startMenuShortcut = new();
    private readonly CheckBox acceptTerms = new();
    private readonly TextBox acceptPhraseBox = new();
    private readonly ProgressBar progress = new();
    private readonly PillLabel modePill = new();

    private bool installed;

    public InstallerForm()
    {
        brandLogo = LoadBrandImage();
        appIcon = LoadAppIcon();
        BuildUi();
    }

    private string InstallPath => installPathBox.Text.Trim();
    private string ManagerPath => Path.Combine(InstallPath, "build", "SST-Manager", "SST Manager.exe");
    private bool TermsAccepted =>
        acceptTerms.Checked
        && string.Equals(acceptPhraseBox.Text.Trim(), "I AGREE", StringComparison.Ordinal);

    public void SaveScreenshot(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        Log("Ready to install SST.");
        Log("Choose an install location, then run the installer.");

        Show();
        Refresh();
        Application.DoEvents();

        using var bitmap = new Bitmap(Width, Height);
        DrawToBitmap(bitmap, new Rectangle(Point.Empty, Size));
        bitmap.Save(path, ImageFormat.Png);
        Close();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            brandLogo?.Dispose();
            appIcon?.Dispose();
        }

        base.Dispose(disposing);
    }

    private static Image? LoadBrandImage()
    {
        try
        {
            var assembly = Assembly.GetExecutingAssembly();
            using var stream = assembly.GetManifestResourceStream("SST.Installer.Assets.LOGO.png");
            if (stream is null)
            {
                return null;
            }

            using var image = Image.FromStream(stream);
            return new Bitmap(image);
        }
        catch
        {
            return null;
        }
    }

    private static Icon? LoadAppIcon()
    {
        try
        {
            var assembly = Assembly.GetExecutingAssembly();
            using var stream = assembly.GetManifestResourceStream("SST.Installer.Assets.sst-manager.ico");
            return stream is null ? null : new Icon(stream);
        }
        catch
        {
            return null;
        }
    }

    private void BuildUi()
    {
        Text = "SST Setup";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(980, 820);
        Size = new Size(1040, 860);
        BackColor = UiPalette.Page;
        Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
        DoubleBuffered = true;
        AutoScaleMode = AutoScaleMode.Dpi;
        if (appIcon is not null)
        {
            Icon = appIcon;
        }

        var shell = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 6,
            Padding = new Padding(18),
            BackColor = UiPalette.Page,
        };
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 128));
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 252));
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 220));
        shell.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        Controls.Add(shell);

        shell.Controls.Add(BuildHeader(), 0, 0);
        shell.Controls.Add(BuildTermsPanel(), 0, 1);
        shell.Controls.Add(BuildInstallPanel(), 0, 2);
        shell.Controls.Add(BuildLogPanel(), 0, 3);

        progress.Dock = DockStyle.Fill;
        progress.Margin = new Padding(0, 0, 0, 8);
        progress.Style = ProgressBarStyle.Continuous;
        shell.Controls.Add(progress, 0, 4);

        shell.Controls.Add(BuildFooter(), 0, 5);
    }

    private Control BuildHeader()
    {
        var header = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            BackColor = UiPalette.Card,
            BorderColor = UiPalette.Border,
            CornerRadius = 8,
            Padding = new Padding(18, 14, 18, 14),
            Margin = new Padding(0, 0, 0, 12),
        };

        var grid = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            RowCount = 1,
            BackColor = Color.Transparent,
        };
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 238));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 160));
        header.Controls.Add(grid);

        var logoHost = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 7, 24, 7),
            Margin = new Padding(0),
        };

        if (brandLogo is not null)
        {
            logoHost.Controls.Add(new PictureBox
            {
                Image = brandLogo,
                SizeMode = PictureBoxSizeMode.Zoom,
                Dock = DockStyle.Fill,
                Margin = new Padding(0),
            });
        }
        else
        {
            logoHost.Controls.Add(new Label
            {
                Text = "SST",
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft,
                ForeColor = UiPalette.Text,
                Font = new Font("Segoe UI", 24F, FontStyle.Bold, GraphicsUnit.Point),
            });
        }
        grid.Controls.Add(logoHost, 0, 0);

        var titleStack = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            RowCount = 2,
            ColumnCount = 1,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 5, 12, 0),
        };
        titleStack.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        titleStack.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        grid.Controls.Add(titleStack, 1, 0);

        titleStack.Controls.Add(new Label
        {
            Text = "Setup",
            Dock = DockStyle.Fill,
            ForeColor = UiPalette.Text,
            Font = new Font("Segoe UI", 22F, FontStyle.Bold, GraphicsUnit.Point),
            TextAlign = ContentAlignment.MiddleLeft,
            Margin = new Padding(0),
        }, 0, 0);

        titleStack.Controls.Add(new Label
        {
            Text = "Install SST Manager, API, dashboard, and updater from one clean Windows app.",
            Dock = DockStyle.Fill,
            ForeColor = UiPalette.Muted,
            Font = new Font("Segoe UI", 9.5F, FontStyle.Regular, GraphicsUnit.Point),
            TextAlign = ContentAlignment.MiddleLeft,
            AutoEllipsis = true,
            Margin = new Padding(1, 0, 0, 0),
        }, 0, 1);

        var pillHost = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 22, 0, 0),
            Margin = new Padding(0),
        };
        modePill.Text = "Installer";
        modePill.FillColor = UiPalette.InfoFill;
        modePill.TextColor = UiPalette.InfoText;
        modePill.Size = new Size(132, 32);
        modePill.Margin = new Padding(0);
        pillHost.Controls.Add(modePill);
        grid.Controls.Add(pillHost, 2, 0);

        return header;
    }

    private Control BuildTermsPanel()
    {
        var panel = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            BackColor = UiPalette.Card,
            BorderColor = UiPalette.Border,
            CornerRadius = 8,
            Padding = new Padding(16),
            Margin = new Padding(0, 0, 0, 12),
        };

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 4,
            BackColor = Color.Transparent,
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        panel.Controls.Add(layout);

        layout.Controls.Add(new Label
        {
            Text = "Non-Commercial Terms and Conditions",
            Dock = DockStyle.Fill,
            ForeColor = UiPalette.Text,
            Font = new Font("Segoe UI", 11F, FontStyle.Bold, GraphicsUnit.Point),
            TextAlign = ContentAlignment.MiddleLeft,
            Margin = new Padding(0),
        }, 0, 0);

        termsBox.Dock = DockStyle.Fill;
        termsBox.ReadOnly = true;
        termsBox.BorderStyle = BorderStyle.None;
        termsBox.BackColor = UiPalette.LogBackground;
        termsBox.ForeColor = UiPalette.LogText;
        termsBox.Font = new Font("Segoe UI", 8.75F, FontStyle.Regular, GraphicsUnit.Point);
        termsBox.Text = LoadTermsText();
        termsBox.Margin = new Padding(0, 2, 0, 8);
        layout.Controls.Add(termsBox, 0, 1);

        acceptTerms.Text = "I have read and agree to the non-commercial Terms and Conditions.";
        ConfigureCheckBox(acceptTerms);
        acceptTerms.CheckedChanged += (_, _) => UpdateTermsGate();
        layout.Controls.Add(acceptTerms, 0, 2);

        var phraseRow = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
            BackColor = Color.Transparent,
            Margin = new Padding(0),
        };
        phraseRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 238));
        phraseRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.Controls.Add(phraseRow, 0, 3);

        phraseRow.Controls.Add(new Label
        {
            Text = "Type I AGREE to continue",
            Dock = DockStyle.Fill,
            ForeColor = UiPalette.Muted,
            Font = new Font("Segoe UI", 8.75F, FontStyle.Bold, GraphicsUnit.Point),
            TextAlign = ContentAlignment.MiddleLeft,
            Margin = new Padding(0),
        }, 0, 0);

        acceptPhraseBox.Dock = DockStyle.Fill;
        acceptPhraseBox.Font = new Font("Segoe UI", 9.25F, FontStyle.Regular, GraphicsUnit.Point);
        acceptPhraseBox.Margin = new Padding(0, 4, 0, 4);
        acceptPhraseBox.TextChanged += (_, _) => UpdateTermsGate();
        phraseRow.Controls.Add(acceptPhraseBox, 1, 0);

        return panel;
    }

    private static string LoadTermsText()
    {
        try
        {
            var assembly = Assembly.GetExecutingAssembly();
            using var stream = assembly.GetManifestResourceStream("SST.Installer.Assets.NON-COMMERCIAL-TERMS.md");
            if (stream is null)
            {
                return FallbackTermsText;
            }

            using var reader = new StreamReader(stream, Encoding.UTF8);
            return reader.ReadToEnd();
        }
        catch
        {
            return FallbackTermsText;
        }
    }

    private Control BuildInstallPanel()
    {
        var panel = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            BackColor = UiPalette.Card,
            BorderColor = UiPalette.Border,
            CornerRadius = 8,
            Padding = new Padding(16),
            Margin = new Padding(0, 0, 0, 12),
        };

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 5,
            BackColor = Color.Transparent,
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 32));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 24));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        panel.Controls.Add(layout);

        layout.Controls.Add(new Label
        {
            Text = "Install Options",
            Dock = DockStyle.Fill,
            ForeColor = UiPalette.Text,
            Font = new Font("Segoe UI", 11F, FontStyle.Bold, GraphicsUnit.Point),
            TextAlign = ContentAlignment.MiddleLeft,
            Margin = new Padding(0),
        }, 0, 0);

        layout.Controls.Add(new Label
        {
            Text = "Install location",
            Dock = DockStyle.Fill,
            ForeColor = UiPalette.Muted,
            Font = new Font("Segoe UI", 8.75F, FontStyle.Regular, GraphicsUnit.Point),
            TextAlign = ContentAlignment.MiddleLeft,
            Margin = new Padding(0),
        }, 0, 1);

        var pathRow = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
            BackColor = Color.Transparent,
            Margin = new Padding(0, 0, 0, 8),
        };
        pathRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        pathRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 126));
        layout.Controls.Add(pathRow, 0, 2);

        installPathBox.Dock = DockStyle.Fill;
        installPathBox.Text = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SST");
        installPathBox.Font = new Font("Segoe UI", 9.25F, FontStyle.Regular, GraphicsUnit.Point);
        installPathBox.Margin = new Padding(0, 3, 10, 3);
        pathRow.Controls.Add(installPathBox, 0, 0);

        ConfigureButton(browseButton, "Browse", (_, _) => BrowseInstallFolder());
        browseButton.Margin = new Padding(0, 2, 0, 4);
        pathRow.Controls.Add(browseButton, 1, 0);

        runInstallTasks.Text = "Install dependencies and build the dashboard after extracting";
        runInstallTasks.Checked = true;
        ConfigureCheckBox(runInstallTasks);
        layout.Controls.Add(runInstallTasks, 0, 3);

        var shortcutRow = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
            BackColor = Color.Transparent,
            Margin = new Padding(0),
        };
        shortcutRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        shortcutRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        layout.Controls.Add(shortcutRow, 0, 4);

        desktopShortcut.Text = "Create desktop shortcut";
        desktopShortcut.Checked = true;
        ConfigureCheckBox(desktopShortcut);
        desktopShortcut.Margin = new Padding(0, 4, 12, 4);
        shortcutRow.Controls.Add(desktopShortcut, 0, 0);

        startMenuShortcut.Text = "Create Start Menu shortcut";
        startMenuShortcut.Checked = true;
        ConfigureCheckBox(startMenuShortcut);
        startMenuShortcut.Margin = new Padding(0, 4, 0, 4);
        shortcutRow.Controls.Add(startMenuShortcut, 1, 0);

        return panel;
    }

    private Control BuildLogPanel()
    {
        var panel = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            BackColor = UiPalette.Card,
            BorderColor = UiPalette.Border,
            CornerRadius = 8,
            Padding = new Padding(0),
            Margin = new Padding(0, 0, 0, 12),
        };

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            BackColor = Color.Transparent,
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        panel.Controls.Add(layout);

        layout.Controls.Add(new Label
        {
            Text = "Install Log",
            Dock = DockStyle.Fill,
            ForeColor = UiPalette.Text,
            Font = new Font("Segoe UI", 10.5F, FontStyle.Bold, GraphicsUnit.Point),
            TextAlign = ContentAlignment.MiddleLeft,
            Margin = new Padding(16, 0, 16, 0),
        }, 0, 0);

        logBox.Dock = DockStyle.Fill;
        logBox.Multiline = true;
        logBox.ReadOnly = true;
        logBox.ScrollBars = ScrollBars.Both;
        logBox.WordWrap = false;
        logBox.Font = new Font("Consolas", 8.75F, FontStyle.Regular, GraphicsUnit.Point);
        logBox.BackColor = UiPalette.LogBackground;
        logBox.ForeColor = UiPalette.LogText;
        logBox.BorderStyle = BorderStyle.None;
        logBox.Margin = new Padding(16, 0, 16, 16);
        layout.Controls.Add(logBox, 0, 1);

        return panel;
    }

    private Control BuildFooter()
    {
        var footer = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 5,
            RowCount = 1,
            BackColor = UiPalette.Page,
            Margin = new Padding(0),
        };
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 132));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 132));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 112));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 112));

        ConfigureButton(installButton, "Install SST", async (_, _) => await InstallAsync(), ButtonTone.Primary);
        ConfigureButton(launchButton, "Launch SST", (_, _) => LaunchManager());
        ConfigureButton(closeButton, "Close", (_, _) => Close());
        installButton.Enabled = false;
        launchButton.Enabled = false;

        footer.Controls.Add(installButton, 0, 0);
        footer.Controls.Add(launchButton, 1, 0);
        footer.Controls.Add(closeButton, 4, 0);

        return footer;
    }

    private static void ConfigureButton(ModernButton button, string text, EventHandler handler, ButtonTone tone = ButtonTone.Secondary)
    {
        button.Text = text;
        button.Tone = tone;
        button.Height = 38;
        button.Dock = DockStyle.Fill;
        button.Margin = new Padding(0, 5, 10, 5);
        button.Click += handler;
    }

    private static void ConfigureCheckBox(CheckBox box)
    {
        box.Dock = DockStyle.Fill;
        box.AutoSize = false;
        box.Height = 34;
        box.ForeColor = UiPalette.Text;
        box.Font = new Font("Segoe UI", 9.25F, FontStyle.Regular, GraphicsUnit.Point);
        box.TextAlign = ContentAlignment.MiddleLeft;
        box.Margin = new Padding(0, 4, 0, 4);
    }

    private void BrowseInstallFolder()
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "Choose where SST should be installed.",
            SelectedPath = Directory.Exists(InstallPath) ? InstallPath : Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            UseDescriptionForTitle = true,
        };

        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            installPathBox.Text = dialog.SelectedPath;
        }
    }

    private async Task InstallAsync()
    {
        if (!TermsAccepted)
        {
            MessageBox.Show(this, "You must agree to the non-commercial Terms and Conditions before installing SST.", "Terms Required", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            UpdateTermsGate();
            return;
        }

        if (string.IsNullOrWhiteSpace(InstallPath))
        {
            MessageBox.Show(this, "Choose an install folder first.", "SST Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        SetBusy(true);
        progress.Value = 0;
        logBox.Clear();

        try
        {
            Log("Starting SST install.");
            Log("Non-commercial Terms and Conditions accepted.");
            Log("Install folder: " + InstallPath);

            StopManagersInInstallFolder();
            progress.Value = 10;

            Directory.CreateDirectory(InstallPath);
            await ExtractPayloadAsync();
            progress.Value = 45;

            EnsureEnvFile();
            progress.Value = 50;

            if (runInstallTasks.Checked)
            {
                if (!NodeExists())
                {
                    Log("Node.js was not found. SST files were installed, but dependencies were not built.");
                    Log("Install Node.js 18 or newer from https://nodejs.org/ and run Install-SST.bat from the install folder.");
                    MessageBox.Show(this, "Node.js was not found. Install Node.js 18 or newer, then run Install-SST.bat from the SST folder.", "Node.js required", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
                else
                {
                    await RunCommandAsync("npm install", Path.Combine(InstallPath, "apps", "api"), "Installing API dependencies");
                    progress.Value = 65;
                    await RunCommandAsync("npm install", Path.Combine(InstallPath, "apps", "web"), "Installing dashboard dependencies");
                    progress.Value = 78;
                    await RunCommandAsync("npm run build", Path.Combine(InstallPath, "apps", "web"), "Building dashboard");
                    progress.Value = 88;
                }
            }

            if (desktopShortcut.Checked)
            {
                CreateShortcut(
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "SST Manager.lnk"),
                    ManagerPath,
                    InstallPath);
            }

            if (startMenuShortcut.Checked)
            {
                var startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", "SST");
                Directory.CreateDirectory(startMenu);
                CreateShortcut(Path.Combine(startMenu, "SST Manager.lnk"), ManagerPath, InstallPath);
            }

            progress.Value = 100;
            installed = true;
            launchButton.Enabled = File.Exists(ManagerPath);
            Log("Install complete.");
        }
        catch (Exception ex)
        {
            Log("FAILED: " + ex.Message);
            MessageBox.Show(this, ex.Message, "SST Setup failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async Task ExtractPayloadAsync()
    {
        Log("Extracting embedded SST package.");
        await Task.Run(() =>
        {
            using var stream = EmbeddedPayload.Open();
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
            foreach (var entry in archive.Entries)
            {
                if (string.IsNullOrEmpty(entry.Name))
                {
                    Directory.CreateDirectory(Path.Combine(InstallPath, entry.FullName));
                    continue;
                }

                var destinationPath = Path.GetFullPath(Path.Combine(InstallPath, entry.FullName));
                var installRoot = Path.GetFullPath(InstallPath);
                if (!destinationPath.StartsWith(installRoot, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException("Installer payload tried to write outside the install folder.");
                }

                Directory.CreateDirectory(Path.GetDirectoryName(destinationPath)!);
                entry.ExtractToFile(destinationPath, overwrite: true);
            }
        });
    }

    private void EnsureEnvFile()
    {
        var envPath = Path.Combine(InstallPath, "apps", "api", ".env");
        if (File.Exists(envPath))
        {
            Log("Existing API .env preserved.");
            return;
        }

        var examplePath = Path.Combine(InstallPath, "apps", "api", ".env.example");
        if (File.Exists(examplePath))
        {
            File.Copy(examplePath, envPath);
            Log("Created apps/api/.env from .env.example.");
        }
        else
        {
            File.WriteAllText(envPath, "PORT=3001" + Environment.NewLine + "API_KEY=" + Environment.NewLine);
            Log("Created minimal apps/api/.env.");
        }
    }

    private async Task RunCommandAsync(string command, string workingDirectory, string label)
    {
        Log(label + ".");
        var comSpec = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe";
        var startInfo = new ProcessStartInfo
        {
            FileName = comSpec,
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        startInfo.ArgumentList.Add("/d");
        startInfo.ArgumentList.Add("/s");
        startInfo.ArgumentList.Add("/c");
        startInfo.ArgumentList.Add(command);

        using var process = new Process { StartInfo = startInfo };
        process.OutputDataReceived += (_, e) => { if (!string.IsNullOrWhiteSpace(e.Data)) Log(e.Data); };
        process.ErrorDataReceived += (_, e) => { if (!string.IsNullOrWhiteSpace(e.Data)) Log(e.Data); };
        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        await process.WaitForExitAsync();
        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException($"{label} failed with exit code {process.ExitCode}.");
        }
    }

    private static bool NodeExists()
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/d /s /c where node",
                CreateNoWindow = true,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            });
            process?.WaitForExit();
            return process?.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    private void StopManagersInInstallFolder()
    {
        var installRoot = Path.GetFullPath(InstallPath);
        foreach (var process in Process.GetProcessesByName("SST Manager"))
        {
            try
            {
                var path = process.MainModule?.FileName;
                if (path is not null && Path.GetFullPath(path).StartsWith(installRoot, StringComparison.OrdinalIgnoreCase))
                {
                    Log("Stopping running SST Manager process " + process.Id + ".");
                    process.Kill(entireProcessTree: true);
                    process.WaitForExit(10000);
                }
            }
            catch
            {
                // Process may have exited or may not expose MainModule.
            }
        }
    }

    private void CreateShortcut(string shortcutPath, string targetPath, string workingDirectory)
    {
        if (!File.Exists(targetPath))
        {
            Log("Shortcut skipped because SST Manager was not found at " + targetPath);
            return;
        }

        Directory.CreateDirectory(Path.GetDirectoryName(shortcutPath)!);
        var shellType = Type.GetTypeFromProgID("WScript.Shell")
            ?? throw new InvalidOperationException("Windows Script Host is not available for shortcut creation.");
        dynamic shell = Activator.CreateInstance(shellType)!;
        dynamic shortcut = shell.CreateShortcut(shortcutPath);
        shortcut.TargetPath = targetPath;
        shortcut.WorkingDirectory = workingDirectory;
        shortcut.IconLocation = targetPath;
        shortcut.Description = "SST Manager";
        shortcut.Save();
        Log("Created shortcut: " + shortcutPath);
    }

    private void LaunchManager()
    {
        if (!File.Exists(ManagerPath))
        {
            MessageBox.Show(this, "SST Manager was not found at " + ManagerPath, "SST Setup", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = ManagerPath,
            WorkingDirectory = InstallPath,
            UseShellExecute = true,
        });
    }

    private void SetBusy(bool busy)
    {
        installButton.Enabled = !busy;
        browseButton.Enabled = !busy;
        installPathBox.Enabled = !busy;
        runInstallTasks.Enabled = !busy;
        desktopShortcut.Enabled = !busy;
        startMenuShortcut.Enabled = !busy;
        acceptTerms.Enabled = !busy;
        acceptPhraseBox.Enabled = !busy;
        closeButton.Enabled = !busy || installed;
        Cursor = busy ? Cursors.WaitCursor : Cursors.Default;
        if (!busy)
        {
            UpdateTermsGate();
        }
    }

    private void UpdateTermsGate()
    {
        if (installButton.IsDisposed)
        {
            return;
        }

        installButton.Enabled = TermsAccepted && !installed;
    }

    private void Log(string message)
    {
        if (InvokeRequired)
        {
            BeginInvoke(() => Log(message));
            return;
        }

        logBox.AppendText($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}");
        logBox.SelectionStart = logBox.TextLength;
        logBox.ScrollToCaret();
    }

    private const string FallbackTermsText =
        "SST is provided for non-commercial use only. Commercial use, resale, paid hosting, paid server-management services, paid consulting, sublicensing, renting, leasing, or monetizing SST is not permitted without prior written permission. If you do not agree, do not install or use SST.";
}

internal static class UiPalette
{
    public static readonly Color Page = Color.FromArgb(246, 248, 251);
    public static readonly Color Card = Color.White;
    public static readonly Color Border = Color.FromArgb(222, 226, 232);
    public static readonly Color Text = Color.FromArgb(18, 24, 38);
    public static readonly Color Muted = Color.FromArgb(96, 106, 122);
    public static readonly Color Primary = Color.FromArgb(33, 33, 33);
    public static readonly Color PrimaryHover = Color.FromArgb(47, 47, 47);
    public static readonly Color SoftButton = Color.FromArgb(248, 249, 251);
    public static readonly Color SoftButtonHover = Color.FromArgb(241, 244, 248);
    public static readonly Color Danger = Color.FromArgb(184, 44, 44);
    public static readonly Color DangerHover = Color.FromArgb(154, 36, 36);
    public static readonly Color LogBackground = Color.FromArgb(248, 250, 252);
    public static readonly Color LogText = Color.FromArgb(34, 42, 56);
    public static readonly Color InfoFill = Color.FromArgb(228, 243, 255);
    public static readonly Color InfoText = Color.FromArgb(0, 103, 184);
}

internal enum ButtonTone
{
    Primary,
    Secondary,
    Danger,
}

internal static class UiShapes
{
    public static GraphicsPath RoundedRectangle(Rectangle bounds, int radius)
    {
        var path = new GraphicsPath();
        var diameter = Math.Max(1, Math.Min(radius * 2, Math.Min(bounds.Width, bounds.Height)));
        var arc = new Rectangle(bounds.Location, new Size(diameter, diameter));

        path.AddArc(arc, 180, 90);
        arc.X = bounds.Right - diameter;
        path.AddArc(arc, 270, 90);
        arc.Y = bounds.Bottom - diameter;
        path.AddArc(arc, 0, 90);
        arc.X = bounds.Left;
        path.AddArc(arc, 90, 90);
        path.CloseFigure();
        return path;
    }
}

internal sealed class RoundedPanel : Panel
{
    public int CornerRadius { get; set; } = 8;
    public Color BorderColor { get; set; } = UiPalette.Border;

    public RoundedPanel()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint
            | ControlStyles.OptimizedDoubleBuffer
            | ControlStyles.ResizeRedraw
            | ControlStyles.UserPaint, true);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = new Rectangle(0, 0, Width - 1, Height - 1);
        using var path = UiShapes.RoundedRectangle(rect, CornerRadius);
        using var fill = new SolidBrush(BackColor);
        using var border = new Pen(BorderColor);
        e.Graphics.FillPath(fill, path);
        e.Graphics.DrawPath(border, path);
    }
}

internal sealed class PillLabel : Control
{
    public Color FillColor { get; set; } = UiPalette.InfoFill;
    public Color TextColor { get; set; } = UiPalette.InfoText;

    public PillLabel()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint
            | ControlStyles.OptimizedDoubleBuffer
            | ControlStyles.ResizeRedraw
            | ControlStyles.UserPaint, true);
        Font = new Font("Segoe UI", 8.75F, FontStyle.Bold, GraphicsUnit.Point);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = new Rectangle(0, 0, Width - 1, Height - 1);
        using var path = UiShapes.RoundedRectangle(rect, 6);
        using var fill = new SolidBrush(FillColor);
        e.Graphics.FillPath(fill, path);
        var textRect = Rectangle.Inflate(rect, -8, 0);
        TextRenderer.DrawText(
            e.Graphics,
            Text,
            Font,
            textRect,
            TextColor,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
    }
}

internal sealed class ModernButton : Button
{
    private bool hovered;
    private bool pressed;

    public ButtonTone Tone { get; set; } = ButtonTone.Secondary;

    public ModernButton()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint
            | ControlStyles.OptimizedDoubleBuffer
            | ControlStyles.ResizeRedraw
            | ControlStyles.UserPaint, true);
        FlatStyle = FlatStyle.Flat;
        FlatAppearance.BorderSize = 0;
        Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
        Cursor = Cursors.Hand;
    }

    protected override void OnMouseEnter(EventArgs e)
    {
        hovered = true;
        Invalidate();
        base.OnMouseEnter(e);
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        hovered = false;
        pressed = false;
        Invalidate();
        base.OnMouseLeave(e);
    }

    protected override void OnMouseDown(MouseEventArgs mevent)
    {
        pressed = true;
        Invalidate();
        base.OnMouseDown(mevent);
    }

    protected override void OnMouseUp(MouseEventArgs mevent)
    {
        pressed = false;
        Invalidate();
        base.OnMouseUp(mevent);
    }

    protected override void OnEnabledChanged(EventArgs e)
    {
        Invalidate();
        base.OnEnabledChanged(e);
    }

    protected override void OnPaint(PaintEventArgs pevent)
    {
        pevent.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = new Rectangle(0, 0, Width - 1, Height - 1);
        var colors = GetColors();

        using var path = UiShapes.RoundedRectangle(rect, 8);
        using var fill = new SolidBrush(colors.Fill);
        pevent.Graphics.FillPath(fill, path);

        if (colors.Border != Color.Transparent)
        {
            using var border = new Pen(colors.Border);
            pevent.Graphics.DrawPath(border, path);
        }

        var textRect = pressed ? new Rectangle(rect.X, rect.Y + 1, rect.Width, rect.Height) : rect;
        TextRenderer.DrawText(
            pevent.Graphics,
            Text,
            Font,
            textRect,
            colors.Text,
            TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
    }

    private (Color Fill, Color Border, Color Text) GetColors()
    {
        if (!Enabled)
        {
            return (Color.FromArgb(238, 241, 245), Color.Transparent, Color.FromArgb(145, 153, 166));
        }

        return Tone switch
        {
            ButtonTone.Primary => (hovered ? UiPalette.PrimaryHover : UiPalette.Primary, Color.Transparent, Color.White),
            ButtonTone.Danger => (hovered ? UiPalette.DangerHover : UiPalette.Danger, Color.Transparent, Color.White),
            _ => (hovered ? UiPalette.SoftButtonHover : UiPalette.SoftButton, UiPalette.Border, UiPalette.Text),
        };
    }
}
