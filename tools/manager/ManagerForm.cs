using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace SST.Manager;

internal sealed class ManagerForm : Form
{
    private readonly string? repoRoot;
    private readonly string apiDir;
    private readonly string webDir;
    private readonly string logsDir;
    private readonly string managerLogPath;
    private readonly bool autoStart;
    private readonly Image? brandLogo;
    private readonly Icon appIcon;
    private readonly bool ownsAppIcon;
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private readonly System.Windows.Forms.Timer statusTimer = new() { Interval = 2500 };
    private readonly object logLock = new();

    private Process? apiProcess;
    private bool stoppingApi;
    private bool exiting;
    private bool externalApi;

    private readonly InfoValueLabel statusValue = new();
    private readonly InfoValueLabel projectValue = new();
    private readonly InfoValueLabel urlValue = new();
    private readonly InfoValueLabel logValue = new();
    private readonly PillLabel statusPill = new();
    private readonly TextBox logBox = new();
    private readonly ModernButton startStopButton = new();
    private readonly ModernButton restartButton = new();
    private readonly ModernButton dashboardButton = new();
    private readonly ModernButton repairButton = new();
    private readonly ModernButton updateButton = new();
    private readonly ModernButton logsButton = new();
    private readonly ModernButton modButton = new();
    private readonly ModernButton resetButton = new();
    private readonly ModernButton exitButton = new();
    private readonly NotifyIcon trayIcon = new();

    public ManagerForm(string? repoRoot, bool autoStart = true)
    {
        this.repoRoot = repoRoot;
        this.autoStart = autoStart;
        apiDir = repoRoot is null ? string.Empty : Path.Combine(repoRoot, "apps", "api");
        webDir = repoRoot is null ? string.Empty : Path.Combine(repoRoot, "apps", "web");
        logsDir = repoRoot is null
            ? Path.Combine(AppContext.BaseDirectory, "logs")
            : Path.Combine(repoRoot, "logs");
        Directory.CreateDirectory(logsDir);
        managerLogPath = Path.Combine(logsDir, $"manager-{DateTime.Now:yyyy-MM-dd-HH-mm-ss}.log");
        brandLogo = LoadBrandImage("LOGO.png");
        (appIcon, ownsAppIcon) = LoadBrandIcon();

        BuildUi();
        BuildTrayMenu();
        UpdateControls();

        statusTimer.Tick += async (_, _) => await RefreshHealthAsync();
        statusTimer.Start();
    }

    public void SaveScreenshot(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        Show();
        Refresh();
        Application.DoEvents();

        using var bitmap = new Bitmap(Width, Height);
        DrawToBitmap(bitmap, new Rectangle(Point.Empty, Size));
        bitmap.Save(path, ImageFormat.Png);

        exiting = true;
        Close();
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        AddLog("SST Manager started.");

        if (!IsRepoValid)
        {
            SetStatus("SST project was not found. Start with --repo-root or set SST_REPO_ROOT.");
            return;
        }

        if (autoStart)
        {
            await StartApiAsync(openDashboard: true);
        }
        else
        {
            SetStatus("Preview mode. API was not started.");
        }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!exiting)
        {
            e.Cancel = true;
            Hide();
            trayIcon.Visible = true;
            trayIcon.ShowBalloonTip(1500, "SST Manager", "SST is still running in the tray.", ToolTipIcon.Info);
            return;
        }

        trayIcon.Visible = false;
        trayIcon.Dispose();
        brandLogo?.Dispose();
        if (ownsAppIcon)
        {
            appIcon.Dispose();
        }
        http.Dispose();
        base.OnFormClosing(e);
    }

    private bool IsRepoValid =>
        repoRoot is not null
        && File.Exists(Path.Combine(apiDir, "src", "server.js"))
        && File.Exists(Path.Combine(webDir, "index.html"));

    private string DashboardUrl => $"http://localhost:{ReadApiPort()}";
    private string ModFolderPath => repoRoot is null ? string.Empty : FindBundledModFolder(repoRoot);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyIcon(IntPtr handle);

    private static string FindBundledModFolder(string root)
    {
        var candidates = new[]
        {
            Path.Combine(root, "dayz", "server-mod", "@SST"),
            Path.Combine(root, "@SST"),
        };

        foreach (var candidate in candidates)
        {
            if (File.Exists(Path.Combine(candidate, "Addons", "SST.pbo")))
            {
                return candidate;
            }
        }

        return candidates[0];
    }

    private Image? LoadBrandImage(string fileName)
    {
        var path = FindBrandAsset(fileName);
        if (path is null)
        {
            return null;
        }

        try
        {
            using var stream = File.OpenRead(path);
            using var image = Image.FromStream(stream);
            return new Bitmap(image);
        }
        catch
        {
            return null;
        }
    }

    private (Icon Icon, bool OwnsIcon) LoadBrandIcon()
    {
        var image = LoadBrandImage("LOGO-mark.png");
        if (image is null)
        {
            return (SystemIcons.Application, false);
        }

        try
        {
            using (image)
            using (var bitmap = new Bitmap(256, 256))
            using (var graphics = Graphics.FromImage(bitmap))
            {
                graphics.Clear(Color.Transparent);
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.SmoothingMode = SmoothingMode.AntiAlias;

                var scale = Math.Min(218f / image.Width, 218f / image.Height);
                var width = (int)(image.Width * scale);
                var height = (int)(image.Height * scale);
                var x = (256 - width) / 2;
                var y = (256 - height) / 2;
                graphics.DrawImage(image, x, y, width, height);

                var handle = bitmap.GetHicon();
                try
                {
                    using var icon = Icon.FromHandle(handle);
                    return ((Icon)icon.Clone(), true);
                }
                finally
                {
                    DestroyIcon(handle);
                }
            }
        }
        catch
        {
            image.Dispose();
            return (SystemIcons.Application, false);
        }
    }

    private string? FindBrandAsset(string fileName)
    {
        if (repoRoot is null)
        {
            return null;
        }

        var candidates = new[]
        {
            Path.Combine(repoRoot, "apps", "web", "public", "banners", fileName),
            Path.Combine(repoRoot, "apps", "web", "dist", "banners", fileName),
        };

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    private void BuildUi()
    {
        Text = "SST Manager";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(1040, 740);
        Size = new Size(1080, 780);
        Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
        BackColor = Palette.Page;
        Icon = appIcon;
        DoubleBuffered = true;
        AutoScaleMode = AutoScaleMode.Dpi;

        var shell = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 4,
            Padding = new Padding(18),
            BackColor = Palette.Page,
        };
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 128));
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 210));
        shell.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        shell.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        Controls.Add(shell);

        var header = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            BackColor = Palette.Card,
            BorderColor = Palette.Border,
            CornerRadius = 8,
            Padding = new Padding(18, 14, 18, 14),
            Margin = new Padding(0, 0, 0, 12),
        };
        shell.Controls.Add(header, 0, 0);

        var headerGrid = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            RowCount = 1,
            BackColor = Color.Transparent,
        };
        headerGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 238));
        headerGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        headerGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 160));
        header.Controls.Add(headerGrid);

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
                ForeColor = Palette.Text,
                Font = new Font("Segoe UI", 24F, FontStyle.Bold, GraphicsUnit.Point),
            });
        }
        headerGrid.Controls.Add(logoHost, 0, 0);

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
        headerGrid.Controls.Add(titleStack, 1, 0);

        titleStack.Controls.Add(new Label
        {
            Text = "Manager",
            Dock = DockStyle.Fill,
            ForeColor = Palette.Text,
            Font = new Font("Segoe UI", 22F, FontStyle.Bold, GraphicsUnit.Point),
            TextAlign = ContentAlignment.MiddleLeft,
            Margin = new Padding(0, 0, 0, 0),
        }, 0, 0);

        titleStack.Controls.Add(new Label
        {
            Text = "Run the SST API, dashboard, logs, and updater from one clean Windows app.",
            AutoSize = false,
            Dock = DockStyle.Fill,
            ForeColor = Palette.Muted,
            Font = new Font("Segoe UI", 9.5F, FontStyle.Regular, GraphicsUnit.Point),
            TextAlign = ContentAlignment.MiddleLeft,
            AutoEllipsis = true,
            Margin = new Padding(1, 0, 0, 0),
        }, 0, 1);

        var badgeHost = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.RightToLeft,
            WrapContents = false,
            BackColor = Color.Transparent,
            Padding = new Padding(0, 22, 0, 0),
            Margin = new Padding(0),
        };
        statusPill.Text = "Starting";
        statusPill.Size = new Size(132, 32);
        statusPill.Margin = new Padding(0);
        statusPill.Font = new Font("Segoe UI", 9F, FontStyle.Bold, GraphicsUnit.Point);
        badgeHost.Controls.Add(statusPill);
        headerGrid.Controls.Add(badgeHost, 2, 0);

        var details = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            BackColor = Palette.Card,
            BorderColor = Palette.Border,
            CornerRadius = 8,
            Padding = new Padding(14),
            Margin = new Padding(0, 0, 0, 12),
        };
        shell.Controls.Add(details, 0, 1);

        var infoGrid = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 3,
            BackColor = Color.Transparent,
            Margin = new Padding(0),
        };
        infoGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 45));
        infoGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 55));
        infoGrid.RowStyles.Add(new RowStyle(SizeType.Absolute, 72));
        infoGrid.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));
        infoGrid.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));
        details.Controls.Add(infoGrid);

        ConfigureValueLabel(statusValue);
        ConfigureValueLabel(projectValue);
        ConfigureValueLabel(urlValue);
        ConfigureValueLabel(logValue);

        projectValue.Text = repoRoot ?? "(not found)";
        urlValue.Text = DashboardUrl;
        logValue.Text = managerLogPath;

        infoGrid.Controls.Add(BuildInfoCard("Status", statusValue), 0, 0);
        infoGrid.Controls.Add(BuildInfoCard("Dashboard", urlValue), 1, 0);
        var projectRow = BuildInfoRow("Project", projectValue);
        var logRow = BuildInfoRow("Log file", logValue);
        infoGrid.Controls.Add(projectRow, 0, 1);
        infoGrid.SetColumnSpan(projectRow, 2);
        infoGrid.Controls.Add(logRow, 0, 2);
        infoGrid.SetColumnSpan(logRow, 2);

        var logPanel = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            BackColor = Palette.Card,
            BorderColor = Palette.Border,
            CornerRadius = 8,
            Padding = new Padding(0),
            Margin = new Padding(0, 0, 0, 12),
        };
        shell.Controls.Add(logPanel, 0, 2);

        var logLayout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            BackColor = Color.Transparent,
        };
        logLayout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        logLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        logPanel.Controls.Add(logLayout);

        logLayout.Controls.Add(new Label
        {
            Text = "Live log",
            AutoSize = true,
            ForeColor = Palette.Text,
            Font = new Font("Segoe UI", 10.5F, FontStyle.Bold, GraphicsUnit.Point),
            Margin = new Padding(16, 14, 16, 8),
        }, 0, 0);

        logBox.Dock = DockStyle.Fill;
        logBox.Multiline = true;
        logBox.ReadOnly = true;
        logBox.ScrollBars = ScrollBars.Both;
        logBox.WordWrap = false;
        logBox.BackColor = Palette.LogBackground;
        logBox.ForeColor = Palette.LogText;
        logBox.BorderStyle = BorderStyle.None;
        logBox.Font = new Font("Consolas", 8.75F, FontStyle.Regular, GraphicsUnit.Point);
        logBox.Margin = new Padding(16, 0, 16, 16);
        logLayout.Controls.Add(logBox, 0, 1);

        var footer = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 10,
            RowCount = 1,
            BackColor = Palette.Page,
            Margin = new Padding(0),
        };
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 126));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 104));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 96));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 92));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 92));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 76));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 76));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 86));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 112));
        shell.Controls.Add(footer, 0, 3);

        ConfigureButton(dashboardButton, "Dashboard", (_, _) => OpenDashboard(), ButtonTone.Primary);
        ConfigureButton(startStopButton, "Start API", async (_, _) => await ToggleApiAsync());
        ConfigureButton(restartButton, "Restart", async (_, _) => await RestartApiAsync());
        ConfigureButton(repairButton, "Repair", async (_, _) => await EnsureDependenciesAsync(force: true));
        ConfigureButton(updateButton, "Update", async (_, _) => await RunUpdaterAsync());
        ConfigureButton(logsButton, "Logs", (_, _) => OpenManagerLog());
        ConfigureButton(modButton, "Mod", (_, _) => ShowModMenu());
        ConfigureButton(resetButton, "Reset", async (_, _) => await FactoryResetAsync());
        ConfigureButton(exitButton, "Quit SST", async (_, _) => await ExitApplicationAsync(), ButtonTone.Danger);

        footer.Controls.Add(dashboardButton, 0, 0);
        footer.Controls.Add(startStopButton, 1, 0);
        footer.Controls.Add(restartButton, 2, 0);
        footer.Controls.Add(repairButton, 3, 0);
        footer.Controls.Add(updateButton, 4, 0);
        footer.Controls.Add(logsButton, 5, 0);
        footer.Controls.Add(modButton, 6, 0);
        footer.Controls.Add(resetButton, 7, 0);
        footer.Controls.Add(exitButton, 9, 0);
    }

    private void BuildTrayMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Show Manager", null, (_, _) => ShowManager());
        menu.Items.Add("Open Dashboard", null, (_, _) => OpenDashboard());
        menu.Items.Add("Restart API", null, async (_, _) => await RestartApiAsync());
        menu.Items.Add("Open @SST Mod Folder", null, (_, _) => OpenModFolder());
        menu.Items.Add("Copy @SST Mod To Server", null, async (_, _) => await CopyModToServerAsync());
        menu.Items.Add("Factory Reset", null, async (_, _) => await FactoryResetAsync());
        menu.Items.Add("View Logs", null, (_, _) => OpenManagerLog());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit SST", null, async (_, _) => await ExitApplicationAsync());

        trayIcon.Text = "SST Manager";
        trayIcon.Icon = appIcon;
        trayIcon.ContextMenuStrip = menu;
        trayIcon.Visible = true;
        trayIcon.DoubleClick += (_, _) => ShowManager();
    }

    private static void ConfigureValueLabel(InfoValueLabel label)
    {
        label.Dock = DockStyle.Fill;
        label.Height = 28;
        label.BackColor = Color.Transparent;
        label.ForeColor = Palette.Text;
        label.Font = new Font("Segoe UI", 9.25F, FontStyle.Regular, GraphicsUnit.Point);
    }

    private static Control BuildInfoCard(string caption, InfoValueLabel value)
    {
        var card = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            BackColor = Palette.Card,
            BorderColor = Palette.Border,
            CornerRadius = 8,
            Padding = new Padding(12, 8, 12, 8),
            Margin = new Padding(0, 0, 10, 8),
        };

        var block = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            BackColor = Color.Transparent,
            Margin = new Padding(0),
        };
        block.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        block.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        block.Controls.Add(new Label
        {
            Text = caption,
            AutoSize = true,
            BackColor = Color.Transparent,
            ForeColor = Palette.Muted,
            Font = new Font("Segoe UI", 8.5F, FontStyle.Regular, GraphicsUnit.Point),
            Margin = new Padding(0, 0, 0, 4),
        }, 0, 0);
        block.Controls.Add(value, 0, 1);
        card.Controls.Add(block);

        return card;
    }

    private static Control BuildInfoRow(string caption, InfoValueLabel value)
    {
        var row = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
            BackColor = Color.Transparent,
            Margin = new Padding(0, 2, 0, 0),
        };
        row.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 74));
        row.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        row.Controls.Add(new Label
        {
            Text = caption,
            Dock = DockStyle.Fill,
            BackColor = Color.Transparent,
            ForeColor = Palette.Muted,
            TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Segoe UI", 8.5F, FontStyle.Regular, GraphicsUnit.Point),
            Margin = new Padding(0),
        }, 0, 0);
        row.Controls.Add(value, 1, 0);
        return row;
    }

    private static void ConfigureButton(ModernButton button, string text, EventHandler handler, ButtonTone tone = ButtonTone.Secondary)
    {
        button.Text = text;
        button.Tone = tone;
        button.Height = 38;
        button.Dock = DockStyle.Fill;
        button.Margin = new Padding(0, 4, 8, 4);
        button.Click += handler;
    }

    private async Task ToggleApiAsync()
    {
        if (apiProcess is { HasExited: false })
        {
            await StopApiAsync();
            return;
        }

        await StartApiAsync(openDashboard: false);
    }

    private async Task StartApiAsync(bool openDashboard)
    {
        if (!IsRepoValid)
        {
            SetStatus("SST project was not found.");
            return;
        }

        if (apiProcess is { HasExited: false })
        {
            SetStatus("API is already managed by SST Manager.");
            if (openDashboard)
            {
                OpenDashboard();
            }
            return;
        }

        urlValue.Text = DashboardUrl;
        if (await IsHealthyAsync())
        {
            externalApi = true;
            SetStatus("API is already running outside SST Manager.");
            AddLog("Detected an existing API on " + DashboardUrl + ".");
            if (openDashboard)
            {
                OpenDashboard();
            }
            UpdateControls();
            return;
        }

        await EnsureDependenciesAsync(force: false);

        var nodePath = FindOnPath("node.exe");
        if (nodePath is null)
        {
            SetStatus("Node.js was not found on PATH.");
            AddLog("Node.js was not found. Install Node.js, then restart SST Manager.");
            return;
        }

        stoppingApi = false;
        externalApi = false;

        var startInfo = new ProcessStartInfo
        {
            FileName = nodePath,
            Arguments = "src/server.js",
            WorkingDirectory = apiDir,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        startInfo.Environment["SST_CONSOLE_UI"] = "0";
        startInfo.Environment["SST_MANAGER"] = "1";

        var process = new Process
        {
            StartInfo = startInfo,
            EnableRaisingEvents = true,
        };

        process.OutputDataReceived += (_, e) => AddProcessLog(e.Data);
        process.ErrorDataReceived += (_, e) => AddProcessLog(e.Data);
        process.Exited += async (_, _) => await ApiExitedAsync(process.ExitCode);

        try
        {
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            apiProcess = process;
            SetStatus("API starting...");
            AddLog("Started hidden API process.");
            UpdateControls();
        }
        catch (Exception ex)
        {
            process.Dispose();
            SetStatus("Could not start API.");
            AddLog("Could not start API: " + ex.Message);
            return;
        }

        var healthy = await WaitForHealthAsync(TimeSpan.FromSeconds(15));
        SetStatus(healthy ? "API running." : "API started, waiting for health check.");
        if (healthy && openDashboard)
        {
            OpenDashboard();
        }
    }

    private async Task ApiExitedAsync(int exitCode)
    {
        AddLog("API process exited with code " + exitCode + ".");

        if (stoppingApi || exiting)
        {
            return;
        }

        await Task.Delay(3000);
        if (!stoppingApi && !exiting)
        {
            BeginInvoke(async () =>
            {
                SetStatus("API exited; restarting...");
                await StartApiAsync(openDashboard: false);
            });
        }
    }

    private async Task StopApiAsync()
    {
        if (externalApi && apiProcess is not { HasExited: false })
        {
            SetStatus("API is running outside SST Manager.");
            AddLog("The existing API was not started by SST Manager, so it was not stopped.");
            return;
        }

        if (apiProcess is not { HasExited: false })
        {
            SetStatus("API is not running.");
            UpdateControls();
            return;
        }

        stoppingApi = true;
        SetStatus("Stopping API...");
        AddLog("Stopping hidden API process.");

        try
        {
            apiProcess.Kill(entireProcessTree: true);
            await apiProcess.WaitForExitAsync();
        }
        catch (Exception ex)
        {
            AddLog("Could not stop API cleanly: " + ex.Message);
        }
        finally
        {
            apiProcess.Dispose();
            apiProcess = null;
            externalApi = false;
            stoppingApi = false;
            SetStatus("API stopped.");
            UpdateControls();
        }
    }

    private async Task RestartApiAsync()
    {
        if (externalApi && apiProcess is not { HasExited: false })
        {
            SetStatus("API is running outside SST Manager.");
            AddLog("Close the other API launcher before restarting from SST Manager.");
            return;
        }

        await StopApiAsync();
        await StartApiAsync(openDashboard: true);
    }

    private async Task EnsureDependenciesAsync(bool force)
    {
        if (!IsRepoValid)
        {
            return;
        }

        var apiNodeModules = Path.Combine(apiDir, "node_modules");
        if (force || !Directory.Exists(apiNodeModules))
        {
            SetStatus("Installing API dependencies...");
            var apiCode = await RunCommandAsync("npm install", apiDir, "API npm install");
            if (apiCode != 0)
            {
                SetStatus("API dependency install failed.");
                return;
            }
        }

        var webDist = Path.Combine(webDir, "dist", "index.html");
        var webNodeModules = Path.Combine(webDir, "node_modules");
        if (force || !Directory.Exists(webNodeModules))
        {
            SetStatus("Installing dashboard dependencies...");
            var webCode = await RunCommandAsync("npm install", webDir, "Dashboard npm install");
            if (webCode != 0)
            {
                SetStatus("Dashboard dependency install failed.");
                return;
            }
        }

        if (force || !File.Exists(webDist))
        {
            SetStatus("Building dashboard...");
            var buildCode = await RunCommandAsync("npm run build", webDir, "Dashboard build");
            if (buildCode != 0)
            {
                SetStatus("Dashboard build failed.");
                return;
            }
        }

        if (force)
        {
            SetStatus("Dependencies repaired.");
        }
    }

    private async Task RunUpdaterAsync()
    {
        if (!IsRepoValid || repoRoot is null)
        {
            SetStatus("SST project was not found.");
            return;
        }

        var updater = Path.Combine(repoRoot, "tools", "updater", "Update-SST.bat");
        if (!File.Exists(updater))
        {
            SetStatus("Updater batch file was not found.");
            AddLog("Updater batch file missing at " + updater + ".");
            return;
        }

        var confirm = MessageBox.Show(
            "SST Manager will stop its API process, run the updater, then start SST again.",
            "Run SST Updater",
            MessageBoxButtons.OKCancel,
            MessageBoxIcon.Information);

        if (confirm != DialogResult.OK)
        {
            return;
        }

        await StopApiAsync();

        var updateLogPath = Path.Combine(logsDir, $"manager-update-{DateTime.Now:yyyy-MM-dd-HH-mm-ss}.log");
        SetStatus("Running updater...");
        var command = Quote(updater)
            + " --repo-root " + Quote(repoRoot)
            + " --log-path " + Quote(updateLogPath);
        var exitCode = await RunCommandAsync(command, repoRoot, "SST updater");
        SetStatus(exitCode == 0 ? "Updater finished." : "Updater failed.");

        if (exitCode == 0)
        {
            await StartApiAsync(openDashboard: true);
        }
    }

    private void ShowModMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Open @SST folder", null, (_, _) => OpenModFolder());
        menu.Items.Add("Copy @SST to server folder...", null, async (_, _) => await CopyModToServerAsync());
        menu.Show(modButton, new Point(0, modButton.Height));
    }

    private void OpenModFolder()
    {
        if (!Directory.Exists(ModFolderPath))
        {
            SetStatus("@SST mod folder was not found.");
            MessageBox.Show(this, "@SST was not found at " + ModFolderPath, "SST Mod", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = ModFolderPath,
            UseShellExecute = true,
        });
    }

    private async Task CopyModToServerAsync()
    {
        if (!Directory.Exists(ModFolderPath))
        {
            SetStatus("@SST mod folder was not found.");
            MessageBox.Show(this, "@SST was not found at " + ModFolderPath, "SST Mod", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        using var dialog = new FolderBrowserDialog
        {
            Description = "Choose your DayZ server folder. @SST will be copied into it.",
            UseDescriptionForTitle = true,
        };

        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        var destinationRoot = Path.GetFullPath(dialog.SelectedPath);
        var targetPath = string.Equals(Path.GetFileName(destinationRoot), "@SST", StringComparison.OrdinalIgnoreCase)
            ? destinationRoot
            : Path.Combine(destinationRoot, "@SST");

        var sourcePath = Path.GetFullPath(ModFolderPath);
        if (targetPath.Equals(sourcePath, StringComparison.OrdinalIgnoreCase) || IsUnderRoot(targetPath, sourcePath))
        {
            MessageBox.Show(this, "Choose a DayZ server folder outside the installed @SST folder.", "SST Mod", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        if (Directory.Exists(targetPath))
        {
            var overwrite = MessageBox.Show(
                this,
                "@SST already exists at:\n" + targetPath + "\n\nOverwrite matching files?",
                "Copy @SST Mod",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question,
                MessageBoxDefaultButton.Button2);

            if (overwrite != DialogResult.Yes)
            {
                return;
            }
        }

        try
        {
            SetStatus("Copying @SST mod...");
            await Task.Run(() => CopyDirectory(sourcePath, targetPath));
            AddLog("Copied @SST mod to " + targetPath + ".");
            SetStatus("@SST mod copied.");
            MessageBox.Show(this, "@SST was copied to:\n" + targetPath, "SST Mod", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            SetStatus("@SST mod copy failed.");
            AddLog("@SST mod copy failed: " + ex.Message);
            MessageBox.Show(this, ex.Message, "SST Mod Copy Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static void CopyDirectory(string sourceDir, string targetDir)
    {
        Directory.CreateDirectory(targetDir);

        foreach (var directory in Directory.GetDirectories(sourceDir, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(sourceDir, directory);
            Directory.CreateDirectory(Path.Combine(targetDir, relative));
        }

        foreach (var file in Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(sourceDir, file);
            var target = Path.Combine(targetDir, relative);
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.Copy(file, target, overwrite: true);
        }
    }

    private async Task FactoryResetAsync()
    {
        if (!IsRepoValid || repoRoot is null)
        {
            SetStatus("SST project was not found.");
            return;
        }

        if (apiProcess is not { HasExited: false } && await IsHealthyAsync())
        {
            SetStatus("Close the external API before factory reset.");
            MessageBox.Show(
                this,
                "SST is running outside SST Manager. Close that API first, then run Factory Reset again.",
                "Factory Reset",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        var confirm = MessageBox.Show(
            this,
            "Factory Reset will stop SST, back up SST's API .env, local data, server profiles, and host-provider config, then recreate a clean .env. It will not touch your DayZ server files or mission folders.\n\nContinue?",
            "Factory Reset SST",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning,
            MessageBoxDefaultButton.Button2);

        if (confirm != DialogResult.Yes)
        {
            return;
        }

        await StopApiAsync();

        try
        {
            SetStatus("Factory reset running...");
            var backupRoot = Path.Combine(repoRoot, "backups", $"factory-reset-{DateTime.Now:yyyy-MM-dd-HH-mm-ss}");
            Directory.CreateDirectory(backupRoot);

            MovePathToBackup(Path.Combine(apiDir, ".env"), backupRoot);
            MovePathToBackup(Path.Combine(apiDir, ".env.local"), backupRoot);
            MovePathToBackup(Path.Combine(apiDir, "data"), backupRoot);
            MovePathToBackup(Path.Combine(apiDir, "profiles"), backupRoot);
            MovePathToBackup(Path.Combine(apiDir, "config", "host-providers.json"), backupRoot);

            DeletePathUnderRoot(Path.Combine(webDir, "dist"), "apps/web/dist");
            DeletePathUnderRoot(Path.Combine(webDir, "tsconfig.tsbuildinfo"), "apps/web/tsconfig.tsbuildinfo");
            DeletePathUnderRoot(Path.Combine(webDir, "node_modules", ".vite"), "apps/web/node_modules/.vite");
            CreateBrowserResetFlag();
            CreateFreshEnvFile();

            AddLog("Factory reset backup saved to " + backupRoot + ".");
            SetStatus("Factory reset complete.");
            MessageBox.Show(
                this,
                "Factory reset complete. A backup was saved to:\n" + backupRoot,
                "Factory Reset Complete",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);

            await StartApiAsync(openDashboard: false);
            if (await IsHealthyAsync())
            {
                OpenBrowserResetPage();
            }
        }
        catch (Exception ex)
        {
            SetStatus("Factory reset failed.");
            AddLog("Factory reset failed: " + ex.Message);
            MessageBox.Show(this, ex.Message, "Factory Reset Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void MovePathToBackup(string sourcePath, string backupRoot)
    {
        var isDirectory = Directory.Exists(sourcePath);
        if (!isDirectory && !File.Exists(sourcePath))
        {
            return;
        }

        var sourceFullPath = Path.GetFullPath(sourcePath);
        var repoFullPath = Path.GetFullPath(repoRoot!);
        if (!IsUnderRoot(sourceFullPath, repoFullPath))
        {
            throw new InvalidOperationException("Factory reset refused to move a path outside the SST folder.");
        }

        var relativePath = Path.GetRelativePath(repoFullPath, sourceFullPath);
        var backupPath = Path.Combine(backupRoot, relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(backupPath)!);

        if (isDirectory)
        {
            Directory.Move(sourceFullPath, backupPath);
        }
        else
        {
            File.Move(sourceFullPath, backupPath);
        }

        AddLog("Backed up " + relativePath + ".");
    }

    private void DeletePathUnderRoot(string targetPath, string label)
    {
        var isDirectory = Directory.Exists(targetPath);
        if (!isDirectory && !File.Exists(targetPath))
        {
            return;
        }

        var targetFullPath = Path.GetFullPath(targetPath);
        var repoFullPath = Path.GetFullPath(repoRoot!);
        if (!IsUnderRoot(targetFullPath, repoFullPath))
        {
            throw new InvalidOperationException("Factory reset refused to delete a path outside the SST folder.");
        }

        if (isDirectory)
        {
            Directory.Delete(targetFullPath, recursive: true);
        }
        else
        {
            File.Delete(targetFullPath);
        }

        AddLog("Removed " + label + ".");
    }

    private static bool IsUnderRoot(string path, string root)
    {
        var normalizedRoot = root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return path.Equals(normalizedRoot, StringComparison.OrdinalIgnoreCase)
            || path.StartsWith(normalizedRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
            || path.StartsWith(normalizedRoot + Path.AltDirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    }

    private void CreateBrowserResetFlag()
    {
        var flagPath = Path.Combine(repoRoot!, ".sst-reset-client.flag");
        File.WriteAllText(flagPath, DateTimeOffset.Now.ToString("O"), Encoding.ASCII);
        AddLog("Created .sst-reset-client.flag.");
    }

    private void CreateFreshEnvFile()
    {
        var envPath = Path.Combine(apiDir, ".env");
        Directory.CreateDirectory(Path.GetDirectoryName(envPath)!);

        var examplePath = Path.Combine(apiDir, ".env.example");
        if (File.Exists(examplePath))
        {
            File.Copy(examplePath, envPath, overwrite: true);
            AddLog("Created clean apps/api/.env from .env.example.");
            return;
        }

        File.WriteAllText(envPath, "PORT=3001" + Environment.NewLine + "API_KEY=" + Environment.NewLine, Encoding.UTF8);
        AddLog("Created clean minimal apps/api/.env.");
    }

    private async Task<int> RunCommandAsync(string command, string workingDirectory, string label)
    {
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

        startInfo.Environment["SST_CONSOLE_UI"] = "0";

        using var process = new Process { StartInfo = startInfo };
        process.OutputDataReceived += (_, e) => AddProcessLog(e.Data);
        process.ErrorDataReceived += (_, e) => AddProcessLog(e.Data);

        AddLog("Running " + label + ".");
        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        await process.WaitForExitAsync();
        AddLog(label + " exited with code " + process.ExitCode + ".");
        return process.ExitCode;
    }

    private async Task RefreshHealthAsync()
    {
        if (!IsRepoValid)
        {
            return;
        }

        var managed = apiProcess is { HasExited: false };
        var healthy = await IsHealthyAsync();
        if (managed)
        {
            SetStatus(healthy ? "API running." : "API process running; health check pending.");
        }
        else if (healthy)
        {
            externalApi = true;
            SetStatus("API running outside SST Manager.");
        }
        else if (!stoppingApi)
        {
            externalApi = false;
            SetStatus("API stopped.");
        }

        UpdateControls();
    }

    private async Task<bool> WaitForHealthAsync(TimeSpan timeout)
    {
        var startedAt = DateTime.UtcNow;
        while (DateTime.UtcNow - startedAt < timeout)
        {
            if (await IsHealthyAsync())
            {
                return true;
            }

            await Task.Delay(750);
        }

        return false;
    }

    private async Task<bool> IsHealthyAsync()
    {
        try
        {
            using var response = await http.GetAsync(DashboardUrl + "/health");
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private int ReadApiPort()
    {
        if (!IsRepoValid)
        {
            return 3001;
        }

        var envPath = Path.Combine(apiDir, ".env");
        if (!File.Exists(envPath))
        {
            return 3001;
        }

        foreach (var rawLine in File.ReadLines(envPath))
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith("#", StringComparison.Ordinal))
            {
                continue;
            }

            var equals = line.IndexOf('=');
            if (equals <= 0)
            {
                continue;
            }

            var key = line[..equals].Trim();
            if (!string.Equals(key, "PORT", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var value = line[(equals + 1)..].Trim().Trim('"');
            if (int.TryParse(value, out var port) && port > 0)
            {
                return port;
            }
        }

        return 3001;
    }

    private void OpenDashboard()
    {
        OpenUrl(DashboardUrl);
    }

    private void OpenBrowserResetPage()
    {
        OpenUrl(DashboardUrl + "/reset-client.html?return=/");
    }

    private void OpenUrl(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true,
            });
        }
        catch (Exception ex)
        {
            AddLog("Could not open browser: " + ex.Message);
        }
    }

    private void OpenManagerLog()
    {
        try
        {
            if (!File.Exists(managerLogPath))
            {
                File.WriteAllText(managerLogPath, string.Empty, Encoding.UTF8);
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = "notepad.exe",
                Arguments = Quote(managerLogPath),
                UseShellExecute = false,
                CreateNoWindow = true,
            });
        }
        catch (Exception ex)
        {
            AddLog("Could not open manager log: " + ex.Message);
        }
    }

    private void ShowManager()
    {
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
    }

    private async Task ExitApplicationAsync()
    {
        exiting = true;
        await StopApiAsync();
        Close();
    }

    private void SetStatus(string message)
    {
        if (IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            BeginInvoke(() => SetStatus(message));
            return;
        }

        statusValue.Text = message;
        var tone = StatusTone.FromMessage(message);
        statusValue.ForeColor = tone.TextColor;
        statusPill.Text = tone.Label;
        statusPill.FillColor = tone.FillColor;
        statusPill.TextColor = tone.TextColor;
        statusPill.Invalidate();
        trayIcon.Text = message.Length > 63 ? message[..63] : message;
        UpdateControls();
    }

    private void UpdateControls()
    {
        if (IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            BeginInvoke(UpdateControls);
            return;
        }

        var repoOk = IsRepoValid;
        var managed = apiProcess is { HasExited: false };
        startStopButton.Text = managed ? "Stop API" : "Start API";
        startStopButton.Enabled = repoOk && !stoppingApi;
        restartButton.Enabled = repoOk && !stoppingApi;
        dashboardButton.Enabled = repoOk;
        repairButton.Enabled = repoOk && !stoppingApi;
        updateButton.Enabled = repoOk && !stoppingApi;
        logsButton.Enabled = true;
        modButton.Enabled = repoOk && Directory.Exists(ModFolderPath);
        resetButton.Enabled = repoOk && !stoppingApi;
        exitButton.Enabled = true;
        urlValue.Text = DashboardUrl;
    }

    private void AddProcessLog(string? line)
    {
        if (!string.IsNullOrWhiteSpace(line))
        {
            AddLog(line);
        }
    }

    private void AddLog(string message)
    {
        var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}";
        lock (logLock)
        {
            File.AppendAllText(managerLogPath, line + Environment.NewLine, Encoding.UTF8);
        }

        if (IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            BeginInvoke(() => AppendLogToUi(line));
            return;
        }

        AppendLogToUi(line);
    }

    private void AppendLogToUi(string line)
    {
        logBox.AppendText(line + Environment.NewLine);
        if (logBox.Lines.Length > 250)
        {
            var lines = logBox.Lines;
            var keep = lines[^200..];
            logBox.Lines = keep;
            logBox.SelectionStart = logBox.TextLength;
            logBox.ScrollToCaret();
        }
    }

    private static string? FindOnPath(string fileName)
    {
        var path = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        foreach (var directory in path.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                var candidate = Path.Combine(directory.Trim('"'), fileName);
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }
            catch
            {
                // Ignore malformed PATH entries.
            }
        }

        var nodeDefault = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "nodejs",
            fileName);
        return File.Exists(nodeDefault) ? nodeDefault : null;
    }

    private static string Quote(string value) => "\"" + value.Replace("\"", "\\\"") + "\"";
}

internal static class Palette
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
    public static readonly Color SuccessFill = Color.FromArgb(224, 250, 236);
    public static readonly Color SuccessText = Color.FromArgb(3, 128, 76);
    public static readonly Color WarningFill = Color.FromArgb(255, 247, 220);
    public static readonly Color WarningText = Color.FromArgb(151, 95, 0);
    public static readonly Color ErrorFill = Color.FromArgb(255, 233, 233);
    public static readonly Color ErrorText = Color.FromArgb(180, 38, 38);
    public static readonly Color NeutralFill = Color.FromArgb(239, 242, 246);
    public static readonly Color NeutralText = Color.FromArgb(77, 87, 103);
    public static readonly Color InfoFill = Color.FromArgb(228, 243, 255);
    public static readonly Color InfoText = Color.FromArgb(0, 103, 184);
}

internal readonly record struct StatusTone(string Label, Color FillColor, Color TextColor)
{
    public static StatusTone FromMessage(string message)
    {
        var text = message.ToLowerInvariant();
        if (text.Contains("failed") || text.Contains("not found") || text.Contains("could not") || text.Contains("error"))
        {
            return new StatusTone("Attention", Palette.ErrorFill, Palette.ErrorText);
        }

        if (text.Contains("outside"))
        {
            return new StatusTone("External", Palette.InfoFill, Palette.InfoText);
        }

        if (text.Contains("running."))
        {
            return new StatusTone("Running", Palette.SuccessFill, Palette.SuccessText);
        }

        if (text.Contains("starting") || text.Contains("installing") || text.Contains("building") || text.Contains("updater") || text.Contains("waiting"))
        {
            return new StatusTone("Working", Palette.WarningFill, Palette.WarningText);
        }

        if (text.Contains("stopped"))
        {
            return new StatusTone("Stopped", Palette.NeutralFill, Palette.NeutralText);
        }

        return new StatusTone("Ready", Palette.NeutralFill, Palette.NeutralText);
    }
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
    public Color BorderColor { get; set; } = Palette.Border;

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
    public Color FillColor { get; set; } = Palette.WarningFill;
    public Color TextColor { get; set; } = Palette.WarningText;

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

internal sealed class InfoValueLabel : Control
{
    public InfoValueLabel()
    {
        SetStyle(ControlStyles.AllPaintingInWmPaint
            | ControlStyles.OptimizedDoubleBuffer
            | ControlStyles.ResizeRedraw
            | ControlStyles.SupportsTransparentBackColor
            | ControlStyles.UserPaint, true);
        BackColor = Color.Transparent;
        Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
    }

    protected override void OnTextChanged(EventArgs e)
    {
        Invalidate();
        base.OnTextChanged(e);
    }

    protected override void OnForeColorChanged(EventArgs e)
    {
        Invalidate();
        base.OnForeColorChanged(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var rect = new Rectangle(0, 0, Width, Height);
        TextRenderer.DrawText(
            e.Graphics,
            Text,
            Font,
            rect,
            ForeColor,
            TextFormatFlags.Left
                | TextFormatFlags.VerticalCenter
                | TextFormatFlags.SingleLine
                | TextFormatFlags.EndEllipsis
                | TextFormatFlags.NoPrefix);
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
            ButtonTone.Primary => (hovered ? Palette.PrimaryHover : Palette.Primary, Color.Transparent, Color.White),
            ButtonTone.Danger => (hovered ? Palette.DangerHover : Palette.Danger, Color.Transparent, Color.White),
            _ => (hovered ? Palette.SoftButtonHover : Palette.SoftButton, Palette.Border, Palette.Text),
        };
    }
}
