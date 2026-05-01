import { Router } from "express";
import { readFile, readdir, stat } from "../storage/fs.js";
import { paths } from "../config.js";

const router = Router();

// Cache for the newest script log (for live updates)
let scriptLogCache = {
  fileName: null,
  content: null,
  lastRead: null,
  fileSize: null
};

// Helper to get file info
async function getFileInfo(filePath) {
  try {
    const stats = await stat(filePath);
    return {
      size: stats.size,
      modified: stats.mtime.toISOString(),
      created: stats.birthtime.toISOString()
    };
  } catch {
    return null;
  }
}

// Helper to read last N lines of a file (for large files like RPT)
async function readLastLines(filePath, maxLines = 500) {
  try {
    const content = await readFile(filePath, "utf8");
    const lines = content.split("\n");
    const totalLines = lines.length;
    
    if (totalLines <= maxLines) {
      return { content, totalLines, truncated: false };
    }
    
    const lastLines = lines.slice(-maxLines).join("\n");
    return { 
      content: lastLines, 
      totalLines, 
      truncated: true,
      skippedLines: totalLines - maxLines
    };
  } catch (err) {
    throw err;
  }
}

// Helper to parse log filename into date
function parseLogDate(filename) {
  // Patterns: crash_2026-01-16_17-35-28.log, script_2026-01-16_17-52-00.log, DayZServer_x64_2026-01-16_17-51-54.RPT
  const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})/);
  if (dateMatch) {
    const dateStr = dateMatch[1].replace(/_/g, "T").replace(/-(\d{2})-(\d{2})$/, ":$1:$2");
    return new Date(dateStr);
  }
  return null;
}

// GET /logs/types - list available log types
router.get("/types", async (req, res) => {
  res.json({
    types: [
      { id: "script", name: "Script Logs", pattern: "script_*.log", description: "Enforce script output" },
      { id: "crash", name: "Crash Logs", pattern: "crash_*.log", description: "Server crash reports" },
      { id: "rpt", name: "RPT Logs", pattern: "*.RPT", description: "Server report files (large)" },
      { id: "error", name: "Error Logs", pattern: "error_*.log", description: "Script error logs" },
      { id: "adm", name: "Admin Logs", pattern: "*.ADM", description: "Admin/BattlEye logs" }
    ]
  });
});

// GET /logs/list/:type - list logs of a specific type
router.get("/list/:type", async (req, res) => {
  const { type } = req.params;
  const limit = parseInt(req.query.limit) || 20;
  
  try {
    const files = await readdir(paths.profiles);
    let pattern;
    
    switch (type) {
      case "script":
        pattern = /^script_.*\.log$/;
        break;
      case "crash":
        pattern = /^crash_.*\.log$/;
        break;
      case "rpt":
        pattern = /\.RPT$/;
        break;
      case "error":
        pattern = /^error_.*\.log$/;
        break;
      case "adm":
        pattern = /\.ADM$/;
        break;
      default:
        return res.status(400).json({ error: "Invalid log type" });
    }
    
    const matchingFiles = files.filter(f => pattern.test(f));
    
    // Get file info for each and sort by date (newest first)
    const filesWithInfo = await Promise.all(
      matchingFiles.map(async (fileName) => {
        const info = await getFileInfo(`${paths.profiles}/${fileName}`);
        return {
          fileName,
          ...info,
          date: parseLogDate(fileName)
        };
      })
    );
    
    // Sort by modified date, newest first
    filesWithInfo.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    
    // Limit results
    const limited = filesWithInfo.slice(0, limit);
    
    res.json({
      type,
      count: limited.length,
      total: matchingFiles.length,
      logs: limited
    });
  } catch (err) {
    console.error(`[Logs] Failed to list ${type} logs:`, err.message);
    res.status(500).json({ error: "Failed to list logs" });
  }
});

// GET /logs/read/:type/:fileName - read a specific log file
router.get("/read/:type/:fileName", async (req, res) => {
  const { type, fileName } = req.params;
  const maxLines = parseInt(req.query.lines) || 500;
  
  // Validate filename to prevent directory traversal
  if (fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  
  // Validate type matches filename pattern
  const patterns = {
    script: /^script_.*\.log$/,
    crash: /^crash_.*\.log$/,
    rpt: /\.RPT$/,
    error: /^error_.*\.log$/,
    adm: /\.ADM$/
  };
  
  if (!patterns[type] || !patterns[type].test(fileName)) {
    return res.status(400).json({ error: "Filename doesn't match type" });
  }
  
  try {
    const filePath = `${paths.profiles}/${fileName}`;
    const info = await getFileInfo(filePath);
    
    if (!info) {
      return res.status(404).json({ error: "Log file not found" });
    }
    
    // For large files (> 1MB), only read last N lines
    if (info.size > 1024 * 1024) {
      const result = await readLastLines(filePath, maxLines);
      return res.json({
        fileName,
        type,
        ...info,
        ...result
      });
    }
    
    // For smaller files, read entire content
    const content = await readFile(filePath, "utf8");
    res.json({
      fileName,
      type,
      ...info,
      content,
      totalLines: content.split("\n").length,
      truncated: false
    });
  } catch (err) {
    console.error(`[Logs] Failed to read ${fileName}:`, err.message);
    res.status(500).json({ error: "Failed to read log" });
  }
});

// GET /logs/latest/script - get the newest script log (cached, updates every 10s)
router.get("/latest/script", async (req, res) => {
  const maxLines = parseInt(req.query.lines) || 200;
  const now = Date.now();
  
  try {
    const files = await readdir(paths.profiles);
    const scriptLogs = files.filter(f => /^script_.*\.log$/.test(f));
    
    if (scriptLogs.length === 0) {
      return res.status(404).json({ error: "No script logs found" });
    }
    
    // Sort by filename (which includes date) to get newest
    scriptLogs.sort().reverse();
    const newestLog = scriptLogs[0];
    const filePath = `${paths.profiles}/${newestLog}`;
    const info = await getFileInfo(filePath);
    
    // Check if we need to refresh cache (different file or > 10 seconds old)
    const needsRefresh = 
      !scriptLogCache.fileName ||
      scriptLogCache.fileName !== newestLog ||
      scriptLogCache.fileSize !== info.size ||
      !scriptLogCache.lastRead ||
      (now - scriptLogCache.lastRead) > 10000;
    
    if (needsRefresh) {
      const result = await readLastLines(filePath, maxLines);
      scriptLogCache = {
        fileName: newestLog,
        content: result.content,
        lastRead: now,
        fileSize: info.size,
        totalLines: result.totalLines,
        truncated: result.truncated,
        skippedLines: result.skippedLines
      };
    }
    
    res.json({
      fileName: scriptLogCache.fileName,
      ...info,
      content: scriptLogCache.content,
      totalLines: scriptLogCache.totalLines,
      truncated: scriptLogCache.truncated,
      skippedLines: scriptLogCache.skippedLines,
      cachedAt: new Date(scriptLogCache.lastRead).toISOString(),
      cacheAgeMs: now - scriptLogCache.lastRead
    });
  } catch (err) {
    console.error("[Logs] Failed to get latest script log:", err.message);
    res.status(500).json({ error: "Failed to get latest script log" });
  }
});

// GET /logs/latest/crash - get the newest crash log
router.get("/latest/crash", async (req, res) => {
  try {
    const files = await readdir(paths.profiles);
    const crashLogs = files.filter(f => /^crash_.*\.log$/.test(f));
    
    if (crashLogs.length === 0) {
      return res.status(404).json({ error: "No crash logs found" });
    }
    
    // Sort by filename to get newest
    crashLogs.sort().reverse();
    const newestLog = crashLogs[0];
    const filePath = `${paths.profiles}/${newestLog}`;
    
    const info = await getFileInfo(filePath);
    const content = await readFile(filePath, "utf8");
    
    res.json({
      fileName: newestLog,
      ...info,
      content,
      totalCrashLogs: crashLogs.length
    });
  } catch (err) {
    console.error("[Logs] Failed to get latest crash log:", err.message);
    res.status(500).json({ error: "Failed to get latest crash log" });
  }
});

// GET /logs/latest/rpt - get the newest RPT log (last N lines only)
router.get("/latest/rpt", async (req, res) => {
  const maxLines = parseInt(req.query.lines) || 300;
  
  try {
    const files = await readdir(paths.profiles);
    const rptLogs = files.filter(f => /\.RPT$/.test(f));
    
    if (rptLogs.length === 0) {
      return res.status(404).json({ error: "No RPT logs found" });
    }
    
    // Sort by filename to get newest
    rptLogs.sort().reverse();
    const newestLog = rptLogs[0];
    const filePath = `${paths.profiles}/${newestLog}`;
    
    const info = await getFileInfo(filePath);
    const result = await readLastLines(filePath, maxLines);
    
    res.json({
      fileName: newestLog,
      ...info,
      ...result,
      totalRptLogs: rptLogs.length
    });
  } catch (err) {
    console.error("[Logs] Failed to get latest RPT log:", err.message);
    res.status(500).json({ error: "Failed to get latest RPT log" });
  }
});

// GET /logs/summary - get a summary of all log types
router.get("/summary", async (req, res) => {
  try {
    const files = await readdir(paths.profiles);
    
    const summary = {
      script: { count: 0, newest: null, newestDate: null },
      crash: { count: 0, newest: null, newestDate: null },
      rpt: { count: 0, newest: null, newestDate: null },
      error: { count: 0, newest: null, newestDate: null },
      adm: { count: 0, newest: null, newestDate: null }
    };
    
    for (const file of files) {
      let type = null;
      if (/^script_.*\.log$/.test(file)) type = "script";
      else if (/^crash_.*\.log$/.test(file)) type = "crash";
      else if (/\.RPT$/.test(file)) type = "rpt";
      else if (/^error_.*\.log$/.test(file)) type = "error";
      else if (/\.ADM$/.test(file)) type = "adm";
      
      if (type) {
        summary[type].count++;
        const date = parseLogDate(file);
        if (!summary[type].newestDate || (date && date > summary[type].newestDate)) {
          summary[type].newest = file;
          summary[type].newestDate = date;
        }
      }
    }
    
    // Convert dates to ISO strings
    for (const type of Object.keys(summary)) {
      if (summary[type].newestDate) {
        summary[type].newestDate = summary[type].newestDate.toISOString();
      }
    }
    
    res.json({ summary });
  } catch (err) {
    console.error("[Logs] Failed to get summary:", err.message);
    res.status(500).json({ error: "Failed to get log summary" });
  }
});

export default router;
